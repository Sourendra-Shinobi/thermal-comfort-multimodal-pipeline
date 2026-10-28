"""hd_camera scripts: regression against the original outputs, and sync-flash detection.

Needs an interpreter with mediapipe / opencv / pandas; skipped otherwise.
"""

import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tests.helpers import read_rows
from experiment.config import PROJECT_ROOT

HD = PROJECT_ROOT / "hd_camera"
HAS_CV = all(importlib.util.find_spec(m) for m in ("cv2", "pandas", "numpy"))
HAS_MP = HAS_CV and importlib.util.find_spec("mediapipe") is not None


@unittest.skipUnless(HAS_CV, "opencv/pandas not installed")
class FeatureRegressionTests(unittest.TestCase):
    def test_calculate_features_reproduces_original_output(self):
        import pandas as pd
        out = Path(tempfile.mkdtemp()) / "beh.csv"
        proc = subprocess.run([sys.executable, "scripts/calculate_features.py", "--input", "features/test_landmarks.csv", "--output", str(out)],
                              cwd=HD, capture_output=True, text=True, timeout=120)
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        self.assertTrue(pd.read_csv(HD / "features" / "test_behaviour.csv").equals(pd.read_csv(out)))

    @unittest.skipUnless(HAS_MP, "mediapipe not installed")
    def test_extract_landmarks_reproduces_original_first_frames(self):
        import pandas as pd
        out = Path(tempfile.mkdtemp()) / "lm.csv"
        proc = subprocess.run([sys.executable, str(HD / "scripts" / "extract_landmarks.py"), "--video", str(HD / "videos/raw/test.mp4"),
                               "--model", str(HD / "models/pose_landmarker_full.task"), "--output", str(out), "--max-frames", "60"],
                              capture_output=True, text=True, timeout=300)
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        new = pd.read_csv(out)
        ref = pd.read_csv(HD / "features" / "test_landmarks.csv").head(60)
        self.assertEqual(list(new.columns), list(ref.columns))
        self.assertEqual(len(new), 60)
        diff = (new.select_dtypes("number") - ref.select_dtypes("number")).abs().max().max()
        self.assertLess(diff, 1e-6)


@unittest.skipUnless(HAS_CV, "opencv not installed")
class SyncDetectorTests(unittest.TestCase):
    def make_video(self, path, fps, flashes, n_frames, roi=(10, 10, 40, 40)):
        import cv2
        import numpy as np
        w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (160, 120))
        x, y, ww, hh = roi
        for i in range(n_frames):
            frame = np.full((120, 160, 3), 30, np.uint8)
            if any(a <= i < b for a, b in flashes):
                frame[y:y + hh, x:x + ww] = 255
            w.write(frame)
        w.release()

    def test_detects_pulses_and_aligns(self):
        tmp = Path(tempfile.mkdtemp())
        fps = 30.0
        # pattern 300/300/300/300/900 ms starting at frame 30 -> ON frames [30,39) [48,57) [66,93)
        flashes = [(30, 39), (48, 57), (66, 93)]
        video = tmp / "v.mp4"
        self.make_video(video, fps, flashes, 150)
        rec_start = 1_800_000_000.0
        lag = 0.1  # video shows the flash 0.1 s after the software timestamp
        events = tmp / "events.csv"
        with open(events, "w", newline="", encoding="utf-8") as fh:
            wr = csv.DictWriter(fh, fieldnames=["event_type", "payload", "source_wallclock", "wallclock"])
            wr.writeheader()
            for k, (a, b) in enumerate(flashes):
                from datetime import datetime, timezone
                t = rec_start + a / fps - lag
                wr.writerow({"event_type": "SYNC_MARKER_ONSET", "wallclock": "",
                             "source_wallclock": datetime.fromtimestamp(t, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
                             "payload": json.dumps({"marker_source": "session_sync_sequence", "sequence": "session_start",
                                                    "pulse_index": k, "duration_ms": round((b - a) / fps * 1000)})})
        cam = tmp / "cam.json"
        cam.write_text(json.dumps({"estimated_recording_start_unix_s": rec_start}), encoding="utf-8")
        out, report = tmp / "det.csv", tmp / "align.json"
        proc = subprocess.run([sys.executable, str(HD / "scripts" / "detect_sync_marker.py"), "--video", str(video), "--roi", "10,10,40,40",
                               "--output", str(out), "--events", str(events), "--camera-metadata", str(cam), "--report", str(report)],
                              capture_output=True, text=True, timeout=120)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        pulses = read_rows(out)
        self.assertEqual([int(p["onset_frame"]) for p in pulses], [30, 48, 66])
        seq = json.loads(report.read_text(encoding="utf-8"))["alignment"]["sequences"]["session_start"]
        self.assertTrue(seq["matched"])
        self.assertAlmostEqual(seq["offset_s_median"], lag, delta=1 / fps)

    def test_reports_invisible_marker(self):
        tmp = Path(tempfile.mkdtemp())
        video = tmp / "v.mp4"
        self.make_video(video, 30.0, [], 30)
        proc = subprocess.run([sys.executable, str(HD / "scripts" / "detect_sync_marker.py"), "--video", str(video), "--roi", "10,10,40,40",
                               "--output", str(tmp / "d.csv")], capture_output=True, text=True, timeout=120)
        self.assertEqual(proc.returncode, 3)
        self.assertIn("not visible", proc.stdout)


if __name__ == "__main__":
    unittest.main()
