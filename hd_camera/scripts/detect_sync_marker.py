"""Find the game's coded sync flash in a video and align it with events.csv.

The camera must see the corner of the participant's screen where the game
draws the flash ([sync] position in config/experiment_config.toml). Give that
region of the VIDEO frame as --roi x,y,w,h (pixels; read it off a frame in
any image viewer).

    python scripts/detect_sync_marker.py --video V.mp4 --roi 40,30,60,60 --output detections.csv
    # with alignment against a session:
    python scripts/detect_sync_marker.py --video V.mp4 --roi 40,30,60,60 --output det.csv \
        --events <session>/events.csv --camera-metadata <session>/camera/camera_metadata.json --report align.json

Output CSV: one row per detected ON pulse (onset_s/offset_s are seconds since
the first frame). The alignment report gives, per logged flash sequence, the
offset between video time and software time; its median is the correction
to apply when mapping video time to the session wall clock.
"""

import argparse
import csv
import json
import statistics
import sys
from datetime import datetime


def iso_to_unix(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()


def roi_brightness(video, roi, max_frames=None):
    import cv2

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"Could not open video: {video}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        raise SystemExit("Could not determine video FPS")
    x, y, w, h = roi
    values = []
    while True:
        ok, frame = cap.read()
        if not ok or (max_frames and len(values) >= max_frames):
            break
        patch = frame[y:y + h, x:x + w]
        if patch.size == 0:
            raise SystemExit(f"ROI {roi} is outside the {frame.shape[1]}x{frame.shape[0]} frame")
        values.append(float(cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY).mean()))
    cap.release()
    return fps, values


def detect_pulses(values, fps, min_contrast=30.0):
    """Threshold half-way between dark and bright levels; return ON intervals."""
    if not values:
        return [], {"visible": False, "reason": "no frames"}
    s = sorted(values)
    low, high = s[int(0.05 * (len(s) - 1))], s[int(0.95 * (len(s) - 1))]
    info = {"low_level": round(low, 2), "high_level": round(high, 2), "fps": fps}
    if high - low < min_contrast:
        info.update(visible=False, reason=f"contrast {high - low:.1f} < {min_contrast}: flash not visible in ROI")
        return [], info
    thr = (low + high) / 2
    info.update(visible=True, threshold=round(thr, 2))
    pulses, start = [], None
    for i, v in enumerate(values):
        if v >= thr and start is None:
            start = i
        elif v < thr and start is not None:
            pulses.append((start, i))
            start = None
    if start is not None:
        pulses.append((start, len(values)))
    return [{"onset_frame": a, "offset_frame": b, "onset_s": a / fps, "offset_s": b / fps, "duration_s": (b - a) / fps}
            for a, b in pulses], info


def logged_sequences(events_csv):
    seqs = {}
    with open(events_csv, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["event_type"] != "SYNC_MARKER_ONSET" or not row["payload"]:
                continue
            p = json.loads(row["payload"])
            if p.get("marker_source") != "session_sync_sequence":
                continue
            wall = row["source_wallclock"] or row["wallclock"]
            seqs.setdefault(p.get("sequence"), []).append({"unix": iso_to_unix(wall), "duration_ms": p.get("duration_ms")})
    return seqs


def align(pulses, seqs, recording_start_unix, fps):
    """Match each logged sequence to the run of detected pulses with the closest ON durations."""
    frame = 1.0 / fps
    report = {}
    for name, logged in seqs.items():
        k = len(logged)
        best = None
        for i in range(0, len(pulses) - k + 1):
            window = pulses[i:i + k]
            score = sum(abs(p["duration_s"] - (l["duration_ms"] or 0) / 1000.0) for p, l in zip(window, logged))
            gaps_ok = all(abs((window[j + 1]["onset_s"] - window[j]["onset_s"]) - (logged[j + 1]["unix"] - logged[j]["unix"])) < 3 * frame
                          for j in range(k - 1))
            if gaps_ok and (best is None or score < best[0]):
                best = (score, i, window)
        if best is None or best[0] > k * 2 * frame:
            report[name] = {"matched": False, "logged_pulses": k}
            continue
        offsets = [p["onset_s"] - (l["unix"] - recording_start_unix) for p, l in zip(best[2], logged)]
        report[name] = {
            "matched": True, "logged_pulses": k, "first_detected_pulse_index": best[1],
            "video_onset_s": [round(p["onset_s"], 4) for p in best[2]],
            "offset_s_median": round(statistics.median(offsets), 4),
            "offset_s_range": round(max(offsets) - min(offsets), 4),
            "frame_period_s": round(frame, 4),
            "meaning": "video_time - (software_time - estimated_recording_start); add to software-derived video times",
        }
    matched = [r for r in report.values() if r.get("matched")]
    summary = {"sequences": report}
    if len(matched) >= 2:
        summary["offset_change_between_sequences_s"] = round(matched[-1]["offset_s_median"] - matched[0]["offset_s_median"], 4)
    return summary


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--roi", required=True, help="x,y,w,h in video pixels")
    ap.add_argument("--output", required=True, help="CSV of detected pulses")
    ap.add_argument("--min-contrast", type=float, default=30.0)
    ap.add_argument("--max-frames", type=int, default=None)
    ap.add_argument("--events", help="session events.csv for alignment")
    ap.add_argument("--camera-metadata", help="session camera/camera_metadata.json (recording start estimate)")
    ap.add_argument("--report", help="JSON alignment report path")
    args = ap.parse_args(argv)

    roi = tuple(int(v) for v in args.roi.split(","))
    if len(roi) != 4:
        ap.error("--roi must be x,y,w,h")
    fps, values = roi_brightness(args.video, roi, args.max_frames)
    pulses, info = detect_pulses(values, fps, args.min_contrast)
    with open(args.output, "x", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["onset_frame", "offset_frame", "onset_s", "offset_s", "duration_s"])
        w.writeheader()
        w.writerows(pulses)
    print(f"frames={len(values)} fps={fps:.3f} pulses={len(pulses)} {info}")

    if args.report:
        report = {"detection": info, "pulses_detected": len(pulses), "roi": roi, "video": args.video}
        if args.events and args.camera_metadata:
            with open(args.camera_metadata, encoding="utf-8") as fh:
                start = json.load(fh).get("estimated_recording_start_unix_s")
            if start is None:
                report["alignment"] = {"error": "camera metadata has no estimated_recording_start_unix_s"}
            else:
                report["alignment"] = align(pulses, logged_sequences(args.events), start, fps)
        with open(args.report, "x", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"report: {args.report}")
    return 0 if info.get("visible") else 3


if __name__ == "__main__":
    sys.exit(main())
