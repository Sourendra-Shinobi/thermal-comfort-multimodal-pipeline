"""Optional post-processing of a finished session's RGB video.

Runs the existing hd_camera scripts as subprocesses ([postprocess] python
must have mediapipe, opencv-python and pandas):
    extract_landmarks.py  -> processing/pose_landmarks.csv
    calculate_features.py -> processing/behaviour_features.csv
    detect_sync_marker.py -> processing/sync_marker_detections.csv  (only with --sync-roi)
The video file itself is only read, never moved or modified.
"""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Callable

from .config import Config
from .session import write_json_atomic
from .validation import build_manifest, validate_session


class PostprocessError(RuntimeError):
    pass


def find_video(session_root: Path) -> Path:
    meta = json.loads((session_root / "metadata.json").read_text(encoding="utf-8"))
    if meta.get("is_mock"):
        raise PostprocessError("MOCK session: there is no real video to process")
    ver = (meta.get("modalities", {}).get("camera", {}) or {}).get("verification") or {}
    if ver.get("path") and Path(ver["path"]).is_file():
        return Path(ver["path"])
    candidates = [p for p in (session_root / "camera").iterdir() if p.suffix.lower() in (".mp4", ".mkv", ".mov", ".flv")]
    if len(candidates) == 1:
        return candidates[0]
    raise PostprocessError(f"no unique video found for {session_root} (camera metadata path: {ver.get('path')})")


def run_postprocess(config: Config, session_root: Path, sync_roi: str | None = None, max_frames: int | None = None,
                    out: Callable[[str], None] = print) -> dict:
    session_root = Path(session_root)
    pp = config.section("postprocess")
    python = config.python_for("postprocess")
    scripts = config.path(pp.get("hd_camera_dir", "hd_camera")) / "scripts"
    model = config.path(pp.get("model", "hd_camera/models/pose_landmarker_full.task"))
    if not model.is_file():
        raise PostprocessError(f"MediaPipe model not found: {model}")
    video = find_video(session_root)
    proc_dir = session_root / "processing"
    proc_dir.mkdir(exist_ok=True)
    landmarks, features = proc_dir / "pose_landmarks.csv", proc_dir / "behaviour_features.csv"
    for p in (landmarks, features):
        if p.exists():
            raise PostprocessError(f"{p} already exists; delete it deliberately to re-run")

    steps = [
        ("extract_landmarks", [python, str(scripts / "extract_landmarks.py"), "--video", str(video), "--model", str(model),
                               "--output", str(landmarks)] + (["--max-frames", str(max_frames)] if max_frames else [])),
        ("calculate_features", [python, str(scripts / "calculate_features.py"), "--input", str(landmarks), "--output", str(features)]),
    ]
    if sync_roi:
        steps.append(("detect_sync_marker", [python, str(scripts / "detect_sync_marker.py"), "--video", str(video), "--roi", sync_roi,
                                             "--output", str(proc_dir / "sync_marker_detections.csv"),
                                             "--events", str(session_root / "events.csv"),
                                             "--camera-metadata", str(session_root / "camera" / "camera_metadata.json"),
                                             "--report", str(proc_dir / "sync_alignment.json")]))
    record = {"video": str(video), "model": str(model), "python": python, "steps": []}
    camera_meta = session_root / "camera" / "camera_metadata.json"
    if camera_meta.is_file():
        cm = json.loads(camera_meta.read_text(encoding="utf-8"))
        record["video_time_origin"] = {
            "estimated_recording_start_wallclock": cm.get("estimated_recording_start_wallclock"),
            "estimated_start_uncertainty_s": cm.get("estimated_start_uncertainty_s"),
            "note": "pose 'timestamp' is seconds from the first video frame; add to the estimated start for wall clock",
        }
    for name, cmd in steps:
        out(f"Running {name}...")
        t0 = time.monotonic()
        proc = subprocess.run(cmd, capture_output=True, text=True)
        (session_root / "logs" / f"postprocess_{name}.log").write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr, encoding="utf-8")
        step = {"step": name, "returncode": proc.returncode, "seconds": round(time.monotonic() - t0, 1), "command": cmd}
        record["steps"].append(step)
        if name == "detect_sync_marker" and proc.returncode == 3:
            step["warning"] = "sync flash not visible in the given ROI; video not aligned by marker"
            out(f"WARNING: {step['warning']}")
            continue
        if proc.returncode != 0:
            write_json_atomic(proc_dir / "processing_metadata.json", record)
            raise PostprocessError(f"{name} failed (exit {proc.returncode}); see logs/postprocess_{name}.log\n{proc.stderr[-1500:]}")
    write_json_atomic(proc_dir / "processing_metadata.json", record)
    build_manifest(session_root, validate_session(session_root))
    out(f"Post-processing complete: {proc_dir}")
    return record
