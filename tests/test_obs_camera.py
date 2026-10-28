"""OBS camera adapter against the protocol-level FakeOBS (no real OBS)."""

import base64
import hashlib
import tempfile
import time
import unittest
from pathlib import Path

from experiment.adapters.base import AcquisitionError
from experiment.adapters.obs_camera import OBSCameraAdapter, OBSClient, OBSError, obs_auth_string
from experiment.events import EventLogger
from tests.helpers import FakeOBS, free_port


def cfg(port, **kw):
    base = {"host": "127.0.0.1", "port": port, "connect_timeout_s": 2, "set_record_directory": True,
            "require_video_capture_input": True, "start_confirm_timeout_s": 2, "stop_confirm_timeout_s": 5}
    base.update(kw)
    return base


class AuthTests(unittest.TestCase):
    def test_auth_string_matches_spec(self):
        # Independent re-derivation of the obs-websocket v5 formula.
        secret = base64.b64encode(hashlib.sha256(b"pw" + b"salt").digest())
        expected = base64.b64encode(hashlib.sha256(secret + b"chal").digest()).decode()
        self.assertEqual(obs_auth_string("pw", "salt", "chal"), expected)

    def test_password_accepted_and_rejected(self):
        obs = FakeOBS(password="pw")
        try:
            c = OBSClient("127.0.0.1", obs.port, "pw", 2)
            c.connect()
            self.assertIn("obsVersion", c.request("GetVersion"))
            c.close()
            with self.assertRaises(OBSError):
                OBSClient("127.0.0.1", obs.port, "wrong", 2).connect()
            with self.assertRaisesRegex(OBSError, "password"):
                OBSClient("127.0.0.1", obs.port, "", 2).connect()
        finally:
            obs.close()

    def test_unreachable(self):
        with self.assertRaisesRegex(OBSError, "Cannot connect"):
            OBSClient("127.0.0.1", free_port(), "", 1).connect()


class CameraAdapterTests(unittest.TestCase):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp())
        self.events_path = self.out / "events.csv"
        self.events = EventLogger(self.events_path, "S")
        self.addCleanup(self.events.close)

    def adapter(self, obs, **kw):
        a = OBSCameraAdapter(cfg(obs.port, **kw), obs.password)
        a.bind(self.events, self.out)
        return a

    def test_full_cycle_records_into_session_folder_and_restores_dir(self):
        obs = FakeOBS()
        original = obs.record_dir
        try:
            a = self.adapter(obs)
            pre = a.preflight()
            self.assertTrue(pre.ok, pre.message)
            info = a.start()
            self.assertEqual(a.state, "RECORDING")
            self.assertIsNotNone(info["estimated_recording_start_wallclock"])
            time.sleep(0.3)
            self.assertTrue(a.health().ok)
            result = a.stop()
            ver = result["verification"]
            self.assertTrue(ver["ok"], ver)
            self.assertTrue(ver["exists"] and ver["size_bytes"] > 0 and ver["size_stable"], ver)
            self.assertTrue(ver["inside_session_folder"])
            self.assertEqual(Path(result["output_path"]).parent, self.out)
            self.assertEqual(obs.record_dir, original, "record directory must be restored")
            self.assertTrue((self.out / "camera_metadata.json").is_file())
            self.assertEqual(a.state, "STOPPED")
            a.close()
        finally:
            obs.close()
        types = self.events_path.read_text(encoding="utf-8")
        for t in ("CAMERA_START_REQUESTED", "CAMERA_RECORDING_CONFIRMED", "CAMERA_STOP_REQUESTED", "CAMERA_RECORDING_STOPPED"):
            self.assertIn(t, types)

    def test_undecodable_video_fails_verification(self):
        import importlib.util
        if importlib.util.find_spec("cv2") is None:
            self.skipTest("opencv not installed: decode check not performed")
        obs = FakeOBS(corrupt_video=True)
        try:
            a = self.adapter(obs)
            a.start()
            time.sleep(0.3)
            ver = a.stop()["verification"]
            self.assertTrue(ver["exists"] and ver["size_bytes"] > 0)
            self.assertFalse(ver["ok"], ver)
        finally:
            obs.close()

    def test_preflight_fails_when_already_recording(self):
        obs = FakeOBS(already_recording=True)
        try:
            r = self.adapter(obs).preflight()
            self.assertFalse(r.ok)
            self.assertIn("already recording", r.message)
        finally:
            obs.close()

    def test_preflight_fails_without_active_camera_source(self):
        for kwargs in ({"video_input": False}, {"video_active": False}):
            obs = FakeOBS(**kwargs)
            try:
                r = self.adapter(obs).preflight()
                self.assertFalse(r.ok, kwargs)
                self.assertIn("Video Capture Device", r.message)
            finally:
                obs.close()

    def test_preflight_unreachable(self):
        a = OBSCameraAdapter(cfg(free_port()), "")
        r = a.preflight()
        self.assertFalse(r.ok)

    def test_start_not_confirmed_raises_and_stops(self):
        obs = FakeOBS(never_confirm=True)
        try:
            a = self.adapter(obs)
            with self.assertRaises(AcquisitionError):
                a.start()
            self.assertIn("StopRecord", obs.requests)
            self.assertFalse(obs.recording)
        finally:
            obs.close()

    def test_old_obs_without_set_record_directory(self):
        obs = FakeOBS(supports_set_record_directory=False)
        try:
            a = self.adapter(obs)
            a.start()
            res = a.stop()
            self.assertTrue(res["verification"]["ok"], res["verification"])
            self.assertFalse(res["verification"]["inside_session_folder"])
        finally:
            obs.close()
        self.assertIn("CAMERA_WARNING", self.events_path.read_text(encoding="utf-8"))

    def test_obs_crash_during_recording_detected(self):
        obs = FakeOBS()
        a = self.adapter(obs)
        a.start()
        obs.crash()
        time.sleep(0.3)
        h = a.health()
        self.assertFalse(h.ok)
        res = a.stop()  # must not raise
        self.assertFalse(res["verification"]["ok"])
        self.assertEqual(a.state, "ERROR")
        obs.close()


if __name__ == "__main__":
    unittest.main()
