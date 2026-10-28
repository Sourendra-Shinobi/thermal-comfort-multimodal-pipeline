"""Post-processing on a session whose camera metadata points at hd_camera/videos/raw/test.mp4 (read only)."""

import csv
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from experiment.config import PROJECT_ROOT
from experiment.modes import Mode
from experiment.postprocess import PostprocessError, run_postprocess
from experiment.session import SessionManager
from tests.helpers import make_config, read_rows

VIDEO = PROJECT_ROOT / "hd_camera" / "videos" / "raw" / "test.mp4"
HAS_MP = all(importlib.util.find_spec(m) for m in ("cv2", "pandas", "mediapipe"))


def digest(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


@unittest.skipUnless(HAS_MP and VIDEO.is_file(), "mediapipe/opencv/pandas or test video missing")
class PostprocessTests(unittest.TestCase):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp())
        self.cfg = make_config(self.out)

    def session(self, mode=Mode.CAMERA_GAME_TEST):
        s = SessionManager(self.out).create(mode=mode, participant="P1", condition="Warm", game="nogo")
        s.update_modality("camera", verification={"ok": True, "path": str(VIDEO), "inside_session_folder": False})
        (s.root / "camera" / "camera_metadata.json").write_text(json.dumps({"estimated_recording_start_unix_s": 1.8e9}), encoding="utf-8")
        (s.root / "events.csv").write_text("event_type,payload,source_wallclock,wallclock\n", encoding="utf-8")
        return s

    def test_landmarks_and_features_written_video_untouched(self):
        before = digest(VIDEO)
        s = self.session()
        run_postprocess(self.cfg, s.root, max_frames=20, out=lambda *_: None)
        lm = read_rows(s.root / "processing" / "pose_landmarks.csv")
        beh = read_rows(s.root / "processing" / "behaviour_features.csv")
        self.assertEqual((len(lm), len(beh)), (20, 20))
        self.assertIn("head_movement", beh[0])
        meta = json.loads((s.root / "processing" / "processing_metadata.json").read_text(encoding="utf-8"))
        self.assertEqual([st["returncode"] for st in meta["steps"]], [0, 0])
        self.assertTrue((s.root / "manifest.json").is_file())
        self.assertEqual(digest(VIDEO), before)
        with self.assertRaises(PostprocessError):  # never overwrites earlier outputs
            run_postprocess(self.cfg, s.root, max_frames=5, out=lambda *_: None)

    def test_invisible_sync_marker_is_a_warning(self):
        s = self.session()
        run_postprocess(self.cfg, s.root, sync_roi="0,0,20,20", max_frames=10, out=lambda *_: None)
        meta = json.loads((s.root / "processing" / "processing_metadata.json").read_text(encoding="utf-8"))
        self.assertIn("warning", meta["steps"][-1])

    def test_mock_session_refused(self):
        s = SessionManager(self.out).create(mode=Mode.MOCK_INTEGRATION_TEST, participant="P1", condition="c", game="nogo")
        with self.assertRaisesRegex(PostprocessError, "MOCK"):
            run_postprocess(self.cfg, s.root, out=lambda *_: None)


if __name__ == "__main__":
    unittest.main()
