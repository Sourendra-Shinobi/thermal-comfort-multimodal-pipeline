# experiment — session controller

`python -m experiment <command>` from the project root. Standard library only
(Python ≥ 3.11). Commands: `modes`, `games`, `list`, `check`, `run`,
`validate`, `postprocess` (`python -m experiment <command> --help`).

| Module | Role |
|---|---|
| `cli.py` | argument parsing, operator prompts |
| `controller.py` | `ExperimentController`: preflight → start/confirm → game → stop/verify → finalise |
| `session.py` | session folder, `metadata.json`, statuses |
| `events.py` | `events.csv` writer |
| `server.py` | HTTP server for game builds + session API (127.0.0.1:8765) |
| `sync.py` | `sync_report.json` |
| `validation.py` | re-validation from disk, `manifest.json` |
| `postprocess.py` | runs `hd_camera/scripts` on the session video |
| `adapters/` | `obs_camera.py` (OBS-WebSocket v5), `shimmer.py` (recorder subprocess), `game.py`, `mock.py`, `base.py` (contract) |

Design and contracts: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
Tests: `python -m unittest discover -s tests -t .`
