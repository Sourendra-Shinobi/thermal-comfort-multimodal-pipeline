# Thermal-comfort multimodal experiment pipeline

A participant performs a cognitive task (Go/No-Go or Odd-One-Out) under a
controlled thermal condition while an RGB camera (OBS + Logitech) and a
Shimmer GSR/PPG sensor record. One command runs a session: it checks every
device, starts and **confirms** each recording, opens the game, collects its
data, stops the devices, verifies the files and writes a manifest, all into one
session folder.

> **Validation status (2026-10-28):** software fully tested with mocks, a
> protocol-level fake OBS, a simulated Shimmer and real (headless) Chrome.
> **No camera, OBS or Shimmer hardware test has been run yet** — see
> [docs/HARDWARE_TESTING.md](docs/HARDWARE_TESTING.md). Do not use for
> participants before those tests pass.

## Quick start

```powershell
cd ...\BTP_2026
python -m experiment modes                                   # Python >= 3.11, no packages needed
python -m unittest discover -s tests -t .                    # software self-test (~75 s)

# rehearse the whole flow without hardware (mock camera, SIMULATED Shimmer):
python -m experiment run --mode MOCK_INTEGRATION_TEST --game nogo --participant MOCK01 --condition Neutral

# a real session, once hardware is validated:
python -m experiment check --mode FULL_MULTIMODAL --game nogo
python -m experiment run   --mode FULL_MULTIMODAL --game nogo --participant P001 --condition Warm --air-temp 30.5 --rh 50
```

Output: `experiment_output\session_<date>_<participant>_<MODE>_<id>\` with
`metadata.json`, `events.csv`, `camera\`, `shimmer\`, `games\<task>\`,
`manifest.json` ([docs/DATA_FORMATS.md](docs/DATA_FORMATS.md)).

## Components

| Folder | What | Stand-alone use (still works) |
|---|---|---|
| [`experiment/`](experiment/README.md) | controller: sessions, devices, event log, local game server, validation | — |
| [`Games/NO-GO`](Games/NO-GO/README.md), [`Games/ODD-ONE-OUT`](Games/README.md) | React/TS browser tasks | `npm run dev` |
| [`Shimmer/`](Shimmer/README.md) | Shimmer C# API via pythonnet; baseline script + session recorder | `python Shimmer\test_shimmer.py` |
| [`hd_camera/`](hd_camera/README.md) | MediaPipe pose landmarks, behaviour features, sync-flash detection | `cd hd_camera; python scripts\extract_landmarks.py` |
| `config/` | `experiment_config.toml` (+ your `experiment_config.local.toml`) | |
| `tests/` | Python test suite | |

## Documentation

| | |
|---|---|
| [SETUP](docs/SETUP.md) | installation of each environment, OBS, Shimmer prerequisites |
| [RUN_EXPERIMENT](docs/RUN_EXPERIMENT.md) | operator procedure for a real session |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | components, contracts, what changed in existing code |
| [DATA_FORMATS](docs/DATA_FORMATS.md) | every output file and column |
| [SYNCHRONIZATION](docs/SYNCHRONIZATION.md) | clock domains, sync flash, measured and unmeasured latencies |
| [HARDWARE_TESTING](docs/HARDWARE_TESTING.md) → [CAMERA](docs/CAMERA_TESTING.md), [SHIMMER](docs/SHIMMER_TESTING.md), [GAME](docs/GAME_TESTING.md), [FULL_PIPELINE](docs/FULL_PIPELINE_TESTING.md) | step-by-step validation, status of each test |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) | message → fix |
| [CODEBASE_AUDIT](docs/CODEBASE_AUDIT.md), [TEST_RESULTS](docs/TEST_RESULTS.md) | starting point; what was actually tested |

Scientific note: GSR reflects arousal, workload, movement and heat, not
thermal comfort itself. The pipeline records measurements and context; it
does not infer comfort, and it does not yet collect subjective thermal votes.
