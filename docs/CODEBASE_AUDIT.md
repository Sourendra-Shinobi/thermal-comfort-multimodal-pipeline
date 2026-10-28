# Codebase Audit (initial findings)

Audit date: 2026-10-28. Performed before any modification. Paths are relative to the
project root `BTP_2026/`. Later changes are described in [ARCHITECTURE.md](ARCHITECTURE.md);
this file records what existed at the start of integration and is not updated
afterwards except for the "Resolution" column.

## 1. What was found on disk

```text
BTP_2026/
├── Games/
│   ├── NO-GO/          React 18 + TS + Vite, own git repo (github: Sourendra-Shinobi/NO-GO-color-inhibition-task), clean worktree
│   └── ODD-ONE-OUT/    React 18 + TS + Vite, no git repo; contains browser-side OBS/Shimmer "controllers"
├── Shimmer/
│   └── test_shimmer.py single 30-second acquisition script (pythonnet + Shimmer C# API)
└── hd_camera/
    ├── models/pose_landmarker_full.task   MediaPipe model (9.4 MB)
    ├── videos/raw/test.mp4                1280x720, 29.2 fps, 358 frames
    ├── videos/processed/pose_visualized.mp4
    ├── features/test_landmarks.csv / test_behaviour.csv   (358 rows each, outputs of the scripts)
    ├── results/                           empty
    └── scripts/*.py                       6 standalone scripts
```

There is **no Simon task** anywhere in the workspace. There is **no OBS integration in
`hd_camera/`** — the only OBS code is a browser-side stub in ODD-ONE-OUT. There is **no
`shimmer_bridge.py`**, although ODD-ONE-OUT's code expects one.

## 2. Environment found on this machine

| Item | Found |
|---|---|
| Python | 3.14.7 (`C:\Python314`, has mediapipe 1.0.1, opencv 5.0, pandas 3.0, numpy 2.5); 3.13.5 (bare) |
| Node / npm | v24.20.0 / 11.19.0; `node_modules` already installed in both games |
| pythonnet | **not installed** in any interpreter |
| .NET runtime (`dotnet`) | **not found** |
| Shimmer C# API DLLs | **not found** (script points to `D:\ML Notes\...` and `C:\Users\sreed\.nuget\...`, which do not exist here) |
| OBS Studio | **not installed** (`C:\Program Files\obs-studio` and `%APPDATA%\obs-studio` absent) |
| Shimmer device / COM10 | not present |
| pytest | not installed (the new Python tests therefore use stdlib `unittest`) |

Consequence: every camera-recording and Shimmer-acquisition step is
`NOT RUN — HARDWARE VALIDATION PENDING` on this machine.

## 3. Per-component audit

### 3.1 `Games/NO-GO` — Go/No-Go colour inhibition task

| Aspect | Finding |
|---|---|
| Purpose | README: 150 main trials (75 % GO), 10 practice, fixation 400 / stimulus 1000 / ITI 400 ms, Space key. Standard (1 NO-GO colour) and Advanced (2) modes. **But `src/experiment/experimentConfig.ts` has `NUMBER_OF_TRIALS: 20`** — README and code disagree (development value?). Not changed. |
| Entry points | `npm run dev` (Vite, :5173), `npm run build` → `dist/`, `npm test` (vitest) |
| Timing | rAF-gated phase transitions, `performance.now()` for RT; wall-clock bridge `Date.now()` captured at `initClock()` |
| Outputs | Browser downloads only: `NOGO_<pid>_<sid>_<date>.csv` (30 fixed-order columns) and `.json` (metadata, configuration, events, trials, summary) |
| Event logger | In-memory, pluggable `addSink()` (synchronous), events have no sequence number |
| Session linkage | Operator types `participant_id` / `session_id` manually; nothing ties it to other modalities |
| Hardware | None |
| Tests | 45 vitest tests, all passing; `tsc` clean |
| Gaps | No way to deliver data to a controller; no sync marker; `dist/` built with absolute `/assets` paths (cannot be served from a sub-path) |

### 3.2 `Games/ODD-ONE-OUT` — Odd-one-out symbol selection task

| Aspect | Finding |
|---|---|
| Purpose | 4×4 grid, one odd symbol, mouse/keyboard selection, 3000 ms response window |
| Entry points | as NO-GO |
| Outputs | Browser downloads: `OOO_..._trials.csv`, `_events.csv`, `_session.json` |
| Acquisition code | `src/acquisition/obsController.ts` (browser OBS-WebSocket v5 client), `shimmerController.ts` (HTTP client for a non-existent Python bridge on `http://localhost:8765`: `GET /status`, `POST /start`, `POST /stop`), `acquisitionStatus.ts` |
| What is actually wired | Only `ReadinessCheck.tsx` uses the controllers, and only to *check* status. **Nothing ever calls `startRecording()`/`stopRecording()`.** In FULL_MULTIMODAL the game would therefore never record anything. |
| OBS controller defects | No authentication (OBS ≥ 28 enables a password by default → identify fails); `connect()` logs `CAMERA_START_REQUESTED` and `CAMERA_RECORDING_CONFIRMED` although no recording is requested; recording "confirmation" is only the request status code. Labelled "STUB / NOT HARDWARE TESTED" by its author. |
| Sync marker | `SyncMarkerOverlay` shows a white 60 px square (top-right) during every STIMULUS phase; onset logged from a React effect (not frame-accurate), offset from `setTimeout` |
| Config oddities | `NUMBER_OF_TRIALS: 10`, `PRACTICE_TRIALS: 3` look like development values; `RT_MAX_VALID_MS: 4800` exceeds `RESPONSE_WINDOW_MS: 3000`, so the "too slow" flag can never fire. **Not changed** (experimental parameters are the researchers' decision) — flagged here. |
| Tests | 6 vitest tests, passing; `tsc` clean |

### 3.3 `Shimmer/test_shimmer.py` — Shimmer baseline acquisition

| Aspect | Finding |
|---|---|
| Mechanism | `pythonnet` (`load("coreclr")`) loads `ShimmerAPI.dll` (Shimmer-C-API, netstandard2.0) + `System.IO.Ports.dll` + `Google.Protobuf.dll`; instantiates `ShimmerAPI.ShimmerLogAndStreamSystemSerialPort("A406", "COM10")` |
| Device | Device name "A406" on Bluetooth serial port COM10. Channels read: `Internal ADC A1` (labelled PPG), `GSR` (raw + kOhms), `GSR Conductance` (uSiemens) — consistent with a Shimmer3 GSR+ unit; the device model is **not** stated in code. |
| Sampling rate | Never set or read; whatever is configured on the device is used |
| Timestamps | `System Timestamp` (CAL, mSecs — PC-side timestamp produced by ShimmerAPI) and `Timestamp` (CAL, mSecs — device clock) |
| Output | `Shimmer/shimmer_readings.csv` (7 columns), **overwritten on every run**; fixed 30 s duration |
| Problems | Hard-coded absolute DLL paths of another user's machine; only 7 of the streamed signals are kept (others discarded); errors in the callback are printed once then silenced; no metadata file; no confirmation besides console prints |
| Tests | none |

### 3.4 `hd_camera/` — RGB video → pose → behaviour features

| Script | Function | Paths |
|---|---|---|
| `test_video.py` | print resolution/fps/frames | `videos/raw/test.mp4` |
| `pose_test.py` | detection rate on first 300 frames | same + model |
| `extract_landmarks.py` | MediaPipe PoseLandmarker (VIDEO mode) → 33 landmarks × (x,y,z,visibility) per frame | → `features/test_landmarks.csv` |
| `check_landmarks.py` | prints missing values / visibility | reads landmarks CSV |
| `calculate_features.py` | 7 behaviour features (head movement/offset, torso lean, shoulder asymmetry, hand movement) | → `features/test_behaviour.csv` |
| `visualize_pose.py` | skeleton overlay video | → `videos/processed/pose_visualized.mp4` |

* All paths are hard-coded relative paths → scripts only work when run from `hd_camera/`.
* `timestamp` column = `(frame-1)/fps`, i.e. **video-relative seconds**, not wall clock.
* No recording code at all: video was recorded externally (presumably OBS, manually).
* Verified working here: `python scripts/test_video.py` → 1280×720, 29.21 fps, 358 frames.

## 4. Integration gaps identified

| # | Gap | Resolution (see ARCHITECTURE.md) |
|---|---|---|
| G1 | No central controller / session concept | `experiment/` Python package: `ExperimentController`, `SessionManager` |
| G2 | Games can only "download" files; no route to a session folder | Local HTTP API served by the controller; games POST events + results (`src/integration/sessionBridge.ts`) |
| G3 | Shimmer bridge expected by ODD-ONE-OUT does not exist | Controller serves the same `/status` contract; acquisition is controller-owned |
| G4 | Shimmer code not reusable, hard-coded paths, drops channels | `Shimmer/shimmer_api.py` (loader) + `Shimmer/shimmer_recorder.py` (subprocess, all channels, metadata); `test_shimmer.py` kept as thin baseline |
| G5 | No working OBS recording control | Python OBS-WebSocket v5 client with auth, start/confirm/stop/verify |
| G6 | Camera scripts tied to cwd | CLI arguments with the old values as defaults |
| G7 | No synchronisation beyond per-trial software marker in ODD-ONE-OUT | Coded corner-flash sequence at session start/end in both games, clock-offset estimation for browser events, `hd_camera/scripts/detect_sync_marker.py` |
| G8 | No manifest / validation | `manifest.json` with SHA-256, `python -m experiment validate` |
| G9 | No Simon task | Not created (would be new experimental software, not integration). Game registry is open for it. |
