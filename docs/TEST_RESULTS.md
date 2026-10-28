# Test results

Recorded 2026-10-28 on the development PC (Windows 11, Python 3.14.7, Node 24.20,
Chrome installed; **no OBS, no Shimmer, no Shimmer DLLs, no .NET, no pythonnet**).

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Python (controller, adapters, server, recorder, camera scripts, post-processing) | `python -m unittest discover -s tests -t .` | **60 / 60 passed**, ~80 s; 5 consecutive full runs passed. One earlier run (before a socket-cleanup fix) reported 1 error that could not be reproduced afterwards; its traceback was not captured. |
| NO-GO (vitest) | `cd Games\NO-GO; npm test` | **57 / 57** (45 pre-existing + 12 new) |
| ODD-ONE-OUT (vitest) | `cd Games\ODD-ONE-OUT; npm test` | **18 / 18** (6 pre-existing + 12 new) |
| Type check + production build | `npm run build` in both games | pass |

Baseline before any change: NO-GO 45/45, ODD-ONE-OUT 6/6, `tsc` clean.

What the Python suite covers: session creation and no-overwrite; event log
sequence, columns and thread safety; config validation and secret masking;
OBS auth (correct/incorrect/missing password), record start confirmation,
stop + file verification (stable size, decodable, inside session folder),
record-directory restore, old OBS without `SetRecordDirectory`, already
recording, no camera source, unconfirmed start, OBS crash during recording,
corrupt video; Shimmer recorder stand-alone run, refusal to overwrite, missing
DLLs, baseline `--help` without pythonnet, adapter start/stop, connection
failure, stalled stream with partial data kept, recorder killed, controller
death (EOF) still finalising the file; HTTP API static serving, path traversal,
CORS, stale-tab rejection, Shimmer-bridge contract, single result write; full
controller runs in MOCK, GAME_ONLY, no-game, FULL_MULTIMODAL flow with fake OBS,
preflight failure, thermal not confirmed, camera start failure, game abort,
device failure mid-session, Ctrl+C, missing end flash; identical integration
files; current builds; camera scripts reproduce original outputs; sync-flash
detection and alignment on synthetic video; post-processing on the existing
test video (video unchanged by hash).

## Manual checks

| Check | Result |
|---|---|
| Refactored `extract_landmarks.py` on all 358 frames of `hd_camera/videos/raw/test.mp4` vs committed `features/test_landmarks.csv` | identical (max abs diff 0.0) |
| Refactored `calculate_features.py` vs committed `features/test_behaviour.csv` | identical |
| `test_video.py`, `pose_test.py`, `check_landmarks.py` with default paths | work as before (pose detected in 300/300 frames) |
| Real browser through the controller: `python -m experiment run --mode MOCK_INTEGRATION_TEST --game odd_one_out` and `--game nogo`, headless Chrome | bundle served, bridge connected, live events + heartbeat + session-start sync flash received; no result (nobody played), so sessions ended `INCOMPLETE` via `GAME_TIMEOUT` as designed |
| Real-time headless Chrome timing | latency 2.6–4.8 ms; Date/perf drift 0.5 ms; flash ON 311.2/300.5/917.1 ms vs 300/300/900 |
| `python -m experiment check --mode FULL_MULTIMODAL --game nogo` on this PC | correctly FAILS: OBS refused connection; Shimmer API files not found |

## Not tested

Everything involving OBS Studio, the Logitech camera, the Shimmer device,
ShimmerAPI.dll, Bluetooth, a physical display/camera latency, the lab
browser/monitor, and the Fluke camera. See [HARDWARE_TESTING.md](HARDWARE_TESTING.md).
