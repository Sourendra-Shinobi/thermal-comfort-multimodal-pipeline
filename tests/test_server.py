"""HTTP API used by the games."""

import csv
import json
import tempfile
import unittest
import urllib.request
from pathlib import Path

from experiment.events import EventLogger
from experiment.modes import Mode
from experiment.server import ControllerServer, GameLink
from experiment.session import SessionManager
from experiment.sync import SyncManager
from tests.helpers import SimulatedGame, read_rows


class ServerTests(unittest.TestCase):
    def setUp(self):
        tmp = Path(tempfile.mkdtemp())
        self.dist = tmp / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<html>game</html>", encoding="utf-8")
        (self.dist / "assets").mkdir()
        (self.dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
        (tmp / "secret.txt").write_text("secret", encoding="utf-8")
        self.session = SessionManager(tmp / "out").create(mode=Mode.GAME_ONLY_TEST, participant="P9", condition="Cool", game="nogo")
        self.events = EventLogger(self.session.events_path, self.session.session_id)
        self.sync = SyncManager()
        ctx = {"session_id": self.session.session_id, "participant_id": "P9", "mode": "GAME_ONLY_TEST"}
        self.link = GameLink(self.session, self.events, self.sync, ctx, {"nogo": self.dist},
                             lambda: {"ok": "status"}, lambda: {"status": "DEVICE_DISCONNECTED", "device_connected": False})
        self.server = ControllerServer("127.0.0.1", 0, self.link)
        self.server.start()
        self.game = SimulatedGame(self.server.base_url, self.session.session_id)

    def tearDown(self):
        self.server.stop()
        self.events.close()

    def raw_get(self, path, headers=None):
        req = urllib.request.Request(self.server.base_url + path, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_static_files_and_types(self):
        code, headers, body = self.raw_get("/games/nogo/index.html?session=x")
        self.assertEqual((code, body), (200, b"<html>game</html>"))
        code, headers, _ = self.raw_get("/games/nogo/assets/app.js")
        self.assertEqual(headers["Content-Type"], "text/javascript")

    def test_path_traversal_blocked(self):
        for p in ("/games/nogo/../secret.txt", "/games/nogo/%2e%2e/secret.txt", "/games/nogo/..%5Csecret.txt", "/games/other/index.html"):
            code, _, body = self.raw_get(p)
            self.assertEqual(code, 404, p)
            self.assertNotIn(b"secret", body)

    def test_session_context_and_cors(self):
        code, headers, body = self.raw_get("/api/session", {"Origin": "http://localhost:5173"})
        self.assertEqual(json.loads(body)["session_id"], self.session.session_id)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
        _, headers, _ = self.raw_get("/api/session", {"Origin": "http://evil.example"})
        self.assertIsNone(headers["Access-Control-Allow-Origin"])

    def test_stale_tab_rejected(self):
        code, body = self.game.post("/api/events", {"session_id": "OLD", "events": [{"event_type": "X"}]})
        self.assertEqual(code, 409)
        self.assertEqual(self.link.events_received, 0)

    def test_shimmer_bridge_contract(self):
        code, body = self.game.get("/status")
        self.assertEqual(body["status"], "DEVICE_DISCONNECTED")
        code, body = self.game.post("/start", {"session_id": self.session.session_id})
        self.assertEqual(code, 409)
        self.assertFalse(body["success"])
        self.assertIn("controlled by the experiment controller", body["error"])

    def test_play_writes_files_once(self):
        self.game.play(n_trials=3)
        self.assertTrue(self.link.result_event.is_set())
        gdir = self.session.root / "games" / "nogo"
        trials = read_rows(gdir / "trials.csv")
        self.assertEqual(len(trials), 3)
        self.assertTrue((gdir / "events.csv").is_file())
        self.assertTrue((gdir / "session_export.json").is_file())
        summary = json.loads((gdir / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["main_trial_count"], 3)
        # second result refused, files untouched
        before = (gdir / "trials.csv").read_bytes()
        code, _ = self.game.post("/api/result", {"session_id": self.session.session_id, "status": "completed", "trials": []})
        self.assertEqual(code, 409)
        self.assertEqual((gdir / "trials.csv").read_bytes(), before)
        # game events are in the central log with their own timestamps
        self.events.close()
        rows = read_rows(self.session.events_path)
        game_rows = [r for r in rows if r["source"] == "game:nogo"]
        self.assertTrue(any(r["event_type"] == "STIMULUS_ONSET" and r["trial"] == "2" for r in game_rows))
        self.assertTrue(all(r["source_monotonic_ms"] for r in game_rows))
        self.assertEqual(len(self.sync.sync_events), 6)  # 5 flash edges + end-sequence completion
        self.assertTrue(self.link.end_sync_done.is_set())
        self.assertIsNotNone(self.sync.report()["browser_to_controller_latency_ms"])

    def test_bad_json(self):
        req = urllib.request.Request(self.server.base_url + "/api/events", data=b"{not json", method="POST")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=5)
        self.assertEqual(ctx.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
