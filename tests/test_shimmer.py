"""Shimmer recorder subprocess + adapter, using the SIMULATED device.

These tests exercise the real subprocess protocol and file handling. They do
NOT test the Shimmer hardware or ShimmerAPI.dll (docs/SHIMMER_TESTING.md).
"""

import csv
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from tests.helpers import read_rows
from experiment.adapters.base import AcquisitionError
from experiment.adapters.shimmer import ShimmerAdapter
from experiment.config import PROJECT_ROOT
from experiment.events import EventLogger

RECORDER = PROJECT_ROOT / "Shimmer" / "shimmer_recorder.py"
CFG = {"com_port": "COM10", "device_name": "A406", "connect_timeout_s": 15, "stream_confirm_timeout_s": 10,
       "stream_confirm_min_samples": 10, "stall_timeout_s": 1.0, "stop_timeout_s": 15, "simulated_rate_hz": 200}


class RecorderCliTests(unittest.TestCase):
    def test_standalone_duration_run(self):
        out = Path(tempfile.mkdtemp()) / "rec"
        proc = subprocess.run([sys.executable, str(RECORDER), "--simulate", "--simulate-rate", "200", "--output-dir", str(out),
                               "--duration", "1"], capture_output=True, text=True, timeout=60)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        msgs = [json.loads(l) for l in proc.stdout.splitlines()]
        self.assertEqual(msgs[-1]["type"], "finalized")
        rows = read_rows(out / "MOCK_raw_data.csv")
        self.assertGreater(len(rows), 50)
        self.assertIn("gsr__cal__kohms", rows[0])
        self.assertIn("timestamp__cal__msecs", rows[0])
        meta = json.loads((out / "MOCK_shimmer_metadata.json").read_text(encoding="utf-8"))
        self.assertTrue(meta["simulated"])
        self.assertEqual(meta["sample_count"], len(rows))
        self.assertAlmostEqual(meta["estimated_rate_from_device_timestamps_hz"], 200, delta=1)
        self.assertEqual({c["name"] for c in meta["channels"]} >= {"GSR", "GSR Conductance", "Internal ADC A1"}, True)
        # second run into the same folder must refuse to overwrite
        again = subprocess.run([sys.executable, str(RECORDER), "--simulate", "--output-dir", str(out), "--duration", "1"],
                               capture_output=True, text=True, timeout=60)
        self.assertNotEqual(again.returncode, 0)
        self.assertEqual(len(read_rows(out / "MOCK_raw_data.csv")), len(rows))

    def test_real_mode_without_dlls_fails_clearly(self):
        proc = subprocess.run([sys.executable, str(RECORDER), "--check", "--api-dir", "C:/nonexistent", "--ports-dll", "C:/nope.dll"],
                              capture_output=True, text=True, timeout=60)
        self.assertEqual(proc.returncode, 2)
        err = [json.loads(l) for l in proc.stdout.splitlines() if '"error"' in l][0]
        self.assertIn("Shimmer API files not found", err["message"])

    def test_baseline_script_help_works_without_pythonnet(self):
        proc = subprocess.run([sys.executable, str(PROJECT_ROOT / "Shimmer" / "test_shimmer.py"), "--help"],
                              capture_output=True, text=True, timeout=60)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("--port", proc.stdout)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp())
        self.events_path = self.out / "events.csv"
        self.events = EventLogger(self.events_path, "S")
        self.addCleanup(self.events.close)

    def make(self, extra=None, cfg=None):
        a = ShimmerAdapter(dict(CFG, **(cfg or {})), sys.executable, RECORDER, simulated=True, extra_args=extra)
        a.bind(self.events, self.out)
        return a

    def test_preflight_start_stop(self):
        a = self.make()
        self.assertTrue(a.preflight().ok)
        a.start()
        self.assertEqual(a.state, "STREAMING")
        time.sleep(1.2)
        self.assertTrue(a.health().ok)
        res = a.stop()
        self.assertTrue(res["verification"]["ok"], res["verification"])
        self.assertEqual(a.state, "STOPPED")
        self.assertGreater(res["verification"]["rows"], 100)
        log = self.events_path.read_text(encoding="utf-8")
        for t in ("GSR_START_REQUESTED", "GSR_RECORDING_CONFIRMED", "GSR_STOP_REQUESTED", "GSR_RECORDING_STOPPED"):
            self.assertIn(t, log)

    def test_connection_failure(self):
        a = self.make(["--simulate-fail-connect"])
        self.assertFalse(a.preflight().ok)
        with self.assertRaises(AcquisitionError):
            a.start()
        self.assertFalse((self.out / "MOCK_raw_data.csv").exists())

    def test_stall_detected_and_partial_data_kept(self):
        a = self.make(["--simulate-stall-after", "60"])
        a.start()
        time.sleep(2.5)
        self.assertFalse(a.health().ok)
        res = a.stop()
        self.assertEqual(res["verification"]["rows"], 60)  # partial data preserved
        self.assertTrue(res["verification"]["ok"])

    def test_recorder_killed_is_reported(self):
        a = self.make()
        a.start()
        a.proc.kill()
        a.proc.wait()
        self.assertFalse(a.health().ok)
        res = a.stop()
        self.assertFalse(res["verification"]["ok"])
        self.assertEqual(a.state, "ERROR")

    def test_controller_death_finalizes_file(self):
        a = self.make()
        self.addCleanup(a.close)
        a.start()
        time.sleep(0.5)
        a.proc.stdin.close()  # EOF == controller gone
        a.proc.wait(timeout=20)
        meta = json.loads((self.out / "MOCK_shimmer_metadata.json").read_text(encoding="utf-8"))
        rows = len(read_rows(self.out / "MOCK_raw_data.csv")) + 1 - 1
        self.assertEqual(meta["sample_count"], rows)
        self.assertGreater(rows, 0)


if __name__ == "__main__":
    unittest.main()
