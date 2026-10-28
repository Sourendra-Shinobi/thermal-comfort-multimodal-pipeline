"""End-to-end controller runs with fake OBS, simulated Shimmer and a scripted game.

No hardware is involved; these establish that the orchestration logic,
status rules and outputs are right, not that devices work.
"""

import csv
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from experiment.adapters.mock import MockCameraAdapter
from experiment.adapters.obs_camera import OBSCameraAdapter
from experiment.controller import ExperimentController, RunOptions, build_adapters, run_preflight_only
from experiment.modes import Mode
from experiment.validation import validate_session
from tests.helpers import FakeOBS, SimulatedGame, make_config, wait_until, read_rows


def run_with_game(controller, play):
    """Run the controller; `play(game_client)` drives the game once the server is up."""
    result = {}

    def drive():
        assert wait_until(lambda: controller.link is not None and controller.server is not None and controller.started is not None
                          and controller.events is not None and "game_url" in controller.link.context and controller.session
                          and controller.session.metadata.get("status") == "RUNNING"
                          and len(controller.started) == len(controller.adapters), timeout=40)
        play(SimulatedGame(controller.server.base_url, controller.session.session_id))

    t = threading.Thread(target=drive, daemon=True)
    t.start()
    result["session"] = controller.run()
    t.join(timeout=5)
    return result["session"]


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp())
        self.lines = []

    def options(self, mode, **kw):
        base = dict(mode=mode, participant="P001", condition="Warm", game="nogo", open_browser=False, allow_stale_build=True)
        base.update(kw)
        return RunOptions(**base)

    def meta(self, session):
        return json.loads(session.metadata_path.read_text(encoding="utf-8"))

    def test_mock_integration_complete(self):
        cfg = make_config(self.out)
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST), out=self.lines.append)
        s = run_with_game(c, lambda g: (time.sleep(0.8), g.play(n_trials=5)))
        m = self.meta(s)
        self.assertEqual(m["status"], "COMPLETE", m["status_reasons"])
        self.assertTrue(m["is_mock"])
        self.assertIn("MOCK", s.session_id)
        root = s.root
        self.assertTrue((root / "shimmer" / "MOCK_raw_data.csv").is_file())
        self.assertFalse((root / "shimmer" / "raw_data.csv").exists())
        self.assertTrue((root / "camera" / "MOCK_camera_metadata.json").is_file())
        self.assertTrue((root / "games" / "nogo" / "trials.csv").is_file())
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["validation"]["passed"])
        self.assertTrue(manifest["is_mock"])
        roles = {f["path"]: f["role"] for f in manifest["files"]}
        self.assertIn("SIMULATED", roles["shimmer/MOCK_raw_data.csv"])
        self.assertTrue(all(len(f["sha256"]) == 64 for f in manifest["files"]))
        self.assertTrue((root / "sync_report.json").is_file())
        self.assertTrue((root / "logs" / "experiment.log").stat().st_size > 0)
        rows = read_rows(root / "events.csv")
        order = [r["event_type"] for r in rows]
        self.assertLess(order.index("GSR_RECORDING_CONFIRMED"), order.index("GAME_LAUNCH_REQUESTED"))
        self.assertLess(order.index("GAME_RESULT_RECEIVED"), order.index("GSR_STOP_REQUESTED"))
        self.assertLess(order.index("SYNC_SEQUENCE_COMPLETED"), order.index("GSR_STOP_REQUESTED"),
                        "devices must keep recording until the session_end flash is over")
        self.assertNotIn("SYNC_END_SEQUENCE_MISSING", order)
        self.assertLess(order.index("GSR_RECORDING_STOPPED"), order.index("CAMERA_STOP_REQUESTED"))
        self.assertEqual(order[-1], "SESSION_FINALIZED")
        self.assertTrue(any("NO REAL DATA" in line for line in self.lines))

    def test_full_multimodal_with_fake_obs_and_simulated_shimmer(self):
        """FULL_MULTIMODAL control flow with injected test devices (fake OBS + simulated Shimmer)."""
        obs = FakeOBS()
        try:
            cfg = make_config(self.out, obs_port=obs.port, thermal_camera={"mode": "manual"})
            adapters = build_adapters(cfg, Mode.MOCK_INTEGRATION_TEST)  # simulated shimmer
            adapters["camera"] = OBSCameraAdapter(cfg.section("obs"), "")
            asked = []
            c = ExperimentController(cfg, self.options(Mode.FULL_MULTIMODAL, thermal_confirm=lambda: asked.append(1) or True),
                                     adapters=adapters, out=self.lines.append)
            s = run_with_game(c, lambda g: g.play(n_trials=3))
            m = self.meta(s)
            self.assertEqual(asked, [1])
            self.assertTrue(m["modalities"]["thermal_camera"]["operator_confirmed_recording"])
            self.assertTrue(m["modalities"]["camera"]["verification"]["ok"])
            self.assertTrue(m["modalities"]["camera"]["verification"]["inside_session_folder"])
            videos = list((s.root / "camera").glob("*.mp4"))
            self.assertEqual(len(videos), 1)
            # simulated Shimmer in a non-mock mode: validation must flag MOCK files
            self.assertEqual(m["status"], "INCOMPLETE")
            v = validate_session(s.root)
            failed = {ch["check"] for ch in v["checks"] if not ch["ok"]}
            self.assertIn("no MOCK files in a non-mock session", failed)
        finally:
            obs.close()

    def test_preflight_failure_records_nothing(self):
        cfg = make_config(self.out)  # OBS port with nothing listening
        c = ExperimentController(cfg, self.options(Mode.CAMERA_GAME_TEST), out=self.lines.append)
        s = c.run()
        m = self.meta(s)
        self.assertEqual(m["status"], "PREFLIGHT_FAILED")
        self.assertTrue(any("camera/obs" in r for r in m["status_reasons"]))
        self.assertEqual(list((s.root / "camera").iterdir()), [])
        events = (s.root / "events.csv").read_text(encoding="utf-8")
        self.assertIn("PREFLIGHT_FAILED", events)
        self.assertNotIn("CAMERA_START_REQUESTED", events)
        self.assertTrue((s.root / "manifest.json").is_file())

    def test_thermal_not_confirmed_blocks_full_session(self):
        obs = FakeOBS()
        try:
            cfg = make_config(self.out, obs_port=obs.port, thermal_camera={"mode": "manual"})
            adapters = {"camera": OBSCameraAdapter(cfg.section("obs"), "")}
            c = ExperimentController(cfg, self.options(Mode.FULL_MULTIMODAL, thermal_confirm=lambda: False),
                                     adapters=adapters, out=self.lines.append)
            s = c.run()
            self.assertEqual(self.meta(s)["status"], "PREFLIGHT_FAILED")
            self.assertFalse(obs.recording)
            self.assertNotIn("StartRecord", obs.requests)
        finally:
            obs.close()

    def test_camera_start_failure_stops_nothing_left_running(self):
        cfg = make_config(self.out)
        adapters = build_adapters(cfg, Mode.MOCK_INTEGRATION_TEST)
        adapters["camera"] = MockCameraAdapter(fail_start=True)
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST), adapters=adapters, out=self.lines.append)
        s = c.run()
        m = self.meta(s)
        self.assertEqual(m["status"], "FAILED")
        self.assertIsNone(adapters["shimmer"].proc)  # shimmer never started

    def test_missing_end_flash_is_logged_not_fatal(self):
        cfg = make_config(self.out, sync={"pattern_ms": [100, 100, 100]})
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST), out=self.lines.append)
        s = run_with_game(c, lambda g: g.play(end_sync=False))
        self.assertEqual(self.meta(s)["status"], "COMPLETE")
        self.assertIn("SYNC_END_SEQUENCE_MISSING", (s.root / "events.csv").read_text(encoding="utf-8"))

    def test_game_abort_marks_session_aborted(self):
        cfg = make_config(self.out)
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST), out=self.lines.append)
        s = run_with_game(c, lambda g: g.play(n_trials=2, status="aborted"))
        m = self.meta(s)
        self.assertEqual(m["status"], "ABORTED")
        self.assertTrue((s.root / "games" / "nogo" / "trials.csv").is_file(), "partial trials kept")
        self.assertTrue((s.root / "shimmer" / "MOCK_raw_data.csv").is_file(), "partial GSR kept")

    def test_device_failure_during_game_marks_incomplete(self):
        cfg = make_config(self.out)
        adapters = build_adapters(cfg, Mode.MOCK_INTEGRATION_TEST)
        adapters["camera"] = MockCameraAdapter(fail_health_after_s=0.2)
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST), adapters=adapters, out=self.lines.append)
        s = run_with_game(c, lambda g: (time.sleep(1.5), g.play()))
        m = self.meta(s)
        self.assertEqual(m["status"], "INCOMPLETE")
        self.assertTrue(any("camera" in r and "error" in r for r in m["status_reasons"]))
        self.assertIn("DEVICE_ERROR", (s.root / "events.csv").read_text(encoding="utf-8"))
        self.assertTrue(any("CAMERA PROBLEM" in l for l in self.lines))

    def test_game_only_no_hardware(self):
        cfg = make_config(self.out)
        c = ExperimentController(cfg, self.options(Mode.GAME_ONLY_TEST, game="odd_one_out"), out=self.lines.append)
        self.assertEqual(c.adapters, {})
        s = run_with_game(c, lambda g: g.play())
        m = self.meta(s)
        self.assertEqual(m["status"], "COMPLETE", m["status_reasons"])
        self.assertTrue(m["is_test_session"])
        self.assertEqual(list((s.root / "shimmer").iterdir()), [])

    def test_no_game_duration_mode(self):
        cfg = make_config(self.out)
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST, game=None, duration_s=1.0), out=self.lines.append)
        s = c.run()
        m = self.meta(s)
        self.assertEqual(m["status"], "COMPLETE", m["status_reasons"])
        self.assertFalse(m["game_expected"])

    def test_operator_ctrl_c_marks_aborted_and_finalizes(self):
        cfg = make_config(self.out)
        c = ExperimentController(cfg, self.options(Mode.MOCK_INTEGRATION_TEST), out=self.lines.append)
        orig = c._run_game

        def interrupted():
            time.sleep(0.5)
            raise KeyboardInterrupt

        c._run_game = interrupted
        s = c.run()
        m = self.meta(s)
        self.assertEqual(m["status"], "ABORTED")
        self.assertEqual(m["modalities"]["shimmer"]["state"], "STOPPED")
        self.assertTrue((s.root / "manifest.json").is_file())
        del orig

    def test_unknown_game_rejected_before_session(self):
        cfg = make_config(self.out)
        with self.assertRaises(ValueError):
            ExperimentController(cfg, self.options(Mode.GAME_ONLY_TEST, game="simon"))
        self.assertFalse(any(self.out.glob("session_*")))

    def test_preflight_only_command(self):
        cfg = make_config(self.out)
        self.assertTrue(run_preflight_only(cfg, Mode.MOCK_INTEGRATION_TEST, "nogo", allow_stale_build=True, out=self.lines.append))
        self.assertFalse(run_preflight_only(cfg, Mode.CAMERA_GAME_TEST, None, out=self.lines.append))
        self.assertFalse(any(self.out.glob("session_*")))


if __name__ == "__main__":
    unittest.main()
