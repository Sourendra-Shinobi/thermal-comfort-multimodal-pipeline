"""Session creation, event log, config and modes."""

import csv
import json
import tempfile
import threading
import unittest
from pathlib import Path

from tests.helpers import read_rows
from experiment.config import PROJECT_ROOT, Config, ConfigError
from experiment.events import COLUMNS, EventLogger
from experiment.modes import MODE_SPECS, Mode, parse_mode
from experiment.session import SessionManager, safe_token


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_creates_structure_and_metadata(self):
        s = SessionManager(self.tmp).create(mode=Mode.GAME_ONLY_TEST, participant="P001", condition="Warm", game="nogo",
                                            environment={"air_temperature_c": 30.5})
        for sub in ("camera", "shimmer", "games", "processing", "logs"):
            self.assertTrue((s.root / sub).is_dir())
        meta = json.loads(s.metadata_path.read_text(encoding="utf-8"))
        self.assertEqual(meta["participant_pseudonym"], "P001")
        self.assertEqual(meta["thermal_condition"], "Warm")
        self.assertTrue(meta["is_test_session"])
        self.assertFalse(meta["is_mock"])
        self.assertEqual(meta["environment"]["air_temperature_c"], 30.5)
        self.assertIn("GAMEONLY", s.session_id)
        self.assertTrue(s.root.name.startswith("session_"))

    def test_ids_unique_and_never_overwrite(self):
        mgr = SessionManager(self.tmp)
        ids = {mgr.create(mode=Mode.MOCK_INTEGRATION_TEST, participant="P1", condition="c", game=None).session_id for _ in range(20)}
        self.assertEqual(len(ids), 20)
        existing = next(self.tmp.iterdir())
        marker = existing / "metadata.json"
        before = marker.read_text(encoding="utf-8")
        # a forced collision must raise instead of reusing the folder
        import experiment.session as sess
        orig = sess.make_session_id
        sess.make_session_id = lambda *a, **k: existing.name[len("session_"):]
        try:
            with self.assertRaises(FileExistsError):
                mgr.create(mode=Mode.MOCK_INTEGRATION_TEST, participant="P1", condition="c", game=None)
        finally:
            sess.make_session_id = orig
        self.assertEqual(marker.read_text(encoding="utf-8"), before)

    def test_participant_required_and_sanitised(self):
        with self.assertRaises(ValueError):
            SessionManager(self.tmp).create(mode=Mode.GAME_ONLY_TEST, participant="  ", condition="c", game=None)
        self.assertEqual(safe_token("P 01/../x"), "P-01-x")


class EventLoggerTests(unittest.TestCase):
    def test_columns_sequence_and_flush(self):
        path = Path(tempfile.mkdtemp()) / "events.csv"
        log = EventLogger(path, "S1")
        log.log("SESSION_CREATED", {"a": 1})
        log.log("STIMULUS_ONSET", {"color": "RED"}, source="game:nogo", trial=3, source_monotonic_ms=12.5, source_wallclock="2026-01-01T00:00:00.000Z")
        # readable before close (flushed per row)
        rows = read_rows(path)
        self.assertEqual(list(rows[0].keys()), COLUMNS)
        self.assertEqual([r["event_seq"] for r in rows], ["1", "2"])
        self.assertEqual(rows[1]["trial"], "3")
        self.assertEqual(json.loads(rows[1]["payload"]), {"color": "RED"})
        self.assertTrue(rows[0]["wallclock"].endswith("Z"))
        log.close()

    def test_thread_safe_sequence(self):
        path = Path(tempfile.mkdtemp()) / "events.csv"
        log = EventLogger(path, "S1")
        threads = [threading.Thread(target=lambda: [log.log("E") for _ in range(200)]) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        log.close()
        seqs = [int(r["event_seq"]) for r in read_rows(path)]
        self.assertEqual(seqs, list(range(1, 1001)))

    def test_refuses_existing_file(self):
        path = Path(tempfile.mkdtemp()) / "events.csv"
        path.write_text("keep", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            EventLogger(path, "S1")
        self.assertEqual(path.read_text(encoding="utf-8"), "keep")


class ConfigAndModeTests(unittest.TestCase):
    def test_default_config_loads(self):
        cfg = Config.load()
        self.assertIn("nogo", cfg.games)
        self.assertIn("odd_one_out", cfg.games)
        self.assertEqual(cfg.section("server")["port"], 8765)

    def test_invalid_config_rejected(self):
        with self.assertRaises(ConfigError):
            Config.load(overrides={"sync": {"pattern_ms": [100, -1]}})
        with self.assertRaises(ConfigError):
            Config.load(Path("does/not/exist.toml"))

    def test_password_not_in_snapshot(self):
        cfg = Config.load(overrides={"obs": {"password": "secret"}})
        self.assertEqual(cfg.obs_password(), "secret")
        self.assertNotIn("secret", json.dumps(cfg.snapshot()))

    def test_modes(self):
        self.assertEqual(parse_mode("full_multimodal"), Mode.FULL_MULTIMODAL)
        with self.assertRaises(ValueError):
            parse_mode("FULL")
        self.assertFalse(MODE_SPECS[Mode.FULL_MULTIMODAL].is_test)
        self.assertTrue(all(MODE_SPECS[m].is_test for m in Mode if m is not Mode.FULL_MULTIMODAL))
        self.assertTrue(MODE_SPECS[Mode.MOCK_INTEGRATION_TEST].is_mock)
        self.assertEqual(MODE_SPECS[Mode.FULL_MULTIMODAL].camera, "obs")
        self.assertEqual(MODE_SPECS[Mode.FULL_MULTIMODAL].shimmer, "device")


if __name__ == "__main__":
    unittest.main()
