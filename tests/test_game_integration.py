"""Static checks on the game integration (no browser)."""

import unittest

from experiment.config import PROJECT_ROOT, Config
from experiment.adapters.game import GameAdapter

GAMES = PROJECT_ROOT / "Games"
SHARED = ["src/integration/sessionBridge.ts", "src/integration/SyncFlash.tsx", "src/integration/OrchestratorBanner.tsx",
          "src/test/sessionBridge.test.ts", "src/test/syncFlash.test.tsx"]


class GameIntegrationTests(unittest.TestCase):
    def test_shared_integration_files_identical(self):
        for rel in SHARED:
            a = (GAMES / "NO-GO" / rel).read_bytes()
            b = (GAMES / "ODD-ONE-OUT" / rel).read_bytes()
            self.assertEqual(a, b, f"{rel} differs between NO-GO and ODD-ONE-OUT; copy the edited one over")

    def test_builds_use_relative_assets_and_are_current(self):
        cfg = Config.load()
        for key, gcfg in cfg.games.items():
            r = GameAdapter(key, gcfg, cfg.path).preflight()
            self.assertTrue(r.ok, f"{key}: {r.message}")

    def test_vite_base_relative(self):
        for g in ("NO-GO", "ODD-ONE-OUT"):
            self.assertIn("base: './'", (GAMES / g / "vite.config.ts").read_text(encoding="utf-8"))

    def test_odd_one_out_shimmer_contract_matches_server(self):
        ts = (GAMES / "ODD-ONE-OUT" / "src" / "acquisition" / "shimmerController.ts").read_text(encoding="utf-8")
        self.assertIn("http://localhost:8765", ts)
        self.assertEqual(Config.load().section("server")["port"], 8765)
        for field in ("status", "device_connected", "sensor_config", "output_file", "error", "bridge_version"):
            self.assertIn(f"{field}:", ts)


if __name__ == "__main__":
    unittest.main()
