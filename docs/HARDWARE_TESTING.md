# Hardware validation — overview

Status of every hardware-dependent test as of 2026-10-28. The development PC had **no
OBS, no Shimmer, no Shimmer DLLs, no .NET runtime and no pythonnet**, so every
test below that touches a device has **not** been run. What has been run is
listed in [TEST_RESULTS.md](TEST_RESULTS.md).

| # | Test | Guide | Needs | Status |
|---|---|---|---|---|
| H1 | OBS WebSocket connection + camera source detected | CAMERA_TESTING §2 | OBS, Logitech camera | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H2 | 15 s controller recording, file verified & playable | CAMERA_TESTING §3–4 | OBS, camera | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H3 | OBS closed / camera unplugged during recording | CAMERA_TESTING §5 | OBS, camera | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H4 | Pose extraction on a controller recording | CAMERA_TESTING §6 | H2 output | `NOT RUN — HARDWARE VALIDATION PENDING` (pipeline verified on the existing `test.mp4`) |
| H5 | Shimmer pairing + baseline `test_shimmer.py` | SHIMMER_TESTING §2–4 | Shimmer, BT, DLLs, .NET, pythonnet | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H6 | Recorder `--check` and 30 s stand-alone recording | SHIMMER_TESTING §5 | as H5 | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H7 | Controller Shimmer session, sample verification | SHIMMER_TESTING §6–7 | as H5 | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H8 | Shimmer switched off during recording | SHIMMER_TESTING §8 | as H5 | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H9 | Games in the lab browser/monitor, through the controller | GAME_TESTING §3 | lab PC + monitor | `NOT RUN` (verified in headless Chrome on the dev PC) |
| H10 | Sync flash visible in RGB video + alignment | SYNCHRONIZATION §4 | H2 | `NOT RUN — HARDWARE VALIDATION PENDING` |
| H11 | Full FULL_MULTIMODAL acceptance session | FULL_PIPELINE_TESTING | everything | `NOT RUN — HARDWARE VALIDATION PENDING` |

Do them **in this order**: camera alone, Shimmer alone, games, then the full
pipeline. Write the outcome (date, who, PASS/FAIL, session id) into the table
when you run a test.

## Equipment

* Acquisition PC (Windows 10/11), with Bluetooth, ≥ 5 GB free disk on the
  drive of `experiment_output\` (configurable `[paths] min_free_disk_gb`).
  Prefer a local, non-synced folder for `experiment_output\` (OneDrive syncing
  a growing video file wastes bandwidth and can lock files): set
  `[paths] output_root = "D:/experiment_output"` in the local config.
* Logitech HD webcam on a USB port directly on the PC (not an unpowered hub).
* Shimmer3 with GSR+ expansion (device name **A406** in the existing code),
  charged; GSR electrodes/finger straps; optical pulse probe on Internal ADC A1
  if PPG is used.
* Participant monitor showing the game; Fluke thermal camera (manual).

## Software

OBS Studio ≥ 30, Python ≥ 3.11 (controller), Python 3.13 venv with pythonnet
(Shimmer), .NET 9 runtime, Shimmer-C-API DLLs, Node ≥ 18 (to build games),
Chrome or Edge. Installation: [SETUP.md](SETUP.md).

## General rules for every hardware test

* Run from the project root in PowerShell: `cd ...\BTP_2026`.
* Use a test participant code (`CAMTEST01`, `SHIMTEST01`, …), never a real one.
* A test has **passed only if the files exist and were inspected** as the guide
  says — a green console line alone is not enough.
* Stopping safely: `Ctrl+C` once in the controller window. Wait for the
  `Session ...: ABORTED` summary. Pressing it a second time while devices are
  being stopped may leave a recording running; then stop OBS by hand
  (*Stop Recording*) and switch the Shimmer off/on.
* After a failed test: check OBS is not still recording (red dot in OBS),
  check no `python` recorder process remains (`Get-Process python`), check
  OBS's recording path was restored (*Settings → Output*). The session folder
  is kept as evidence; delete test folders deliberately when no longer needed.
