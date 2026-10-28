# Synchronisation

**Bottom line:** streams are aligned through software timestamps on one PC
clock plus a coded screen flash. The software part is measured (a few ms). The
physical latencies (display, camera exposure and encoding, Bluetooth) are
**not yet measured**. Do not claim millisecond physical synchronisation
until the validation in §4 has been done on the real setup.

## 1. Clock domains

| Stream | Timestamp | Clock | Resolution / notes |
|---|---|---|---|
| Controller events | `monotonic_s`, `wallclock` | `time.perf_counter()`, system clock (`time.time()`) | µs |
| Game events & trials | `*_perf` / `source_monotonic_ms` | browser `performance.now()` (monotonic, page-relative) | ~0.1–1 ms (browser-dependent) |
| | `*_wallclock` / `source_wallclock` | `Date.now()` captured once at `initClock()` + perf offset | system clock |
| Shimmer | `host_unix_ms` | system clock in the recorder process, at callback | callback time, i.e. *after* Bluetooth transfer and API decoding |
| | `system_timestamp__cal__msecs` | ShimmerAPI "System Timestamp" (PC side) | epoch/meaning to be confirmed on hardware |
| | `timestamp__cal__msecs` | device's own oscillator | best for intervals within the recording |
| RGB video | frame index / `timestamp` in pose CSV | OBS encoder, seconds from first frame | 1/fps (33 ms at 30 fps) |
| | `estimated_recording_start_unix_s` | controller confirmation time − OBS `outputDuration` | uncertainty ≈ `estimated_start_uncertainty_s` |
| Fluke thermal camera | its own clock | **not connected** | see §5 |

Everything on the acquisition PC reads the same Windows system clock, so all
`*wallclock` / `host_unix_ms` values are directly comparable. Do not change
the system time or let NTP step it during a session (`sync_report.json`
`anomalies` would flag a jump seen by the game).

## 2. What the software records

* **Acquisition brackets.** `CAMERA_START_REQUESTED → CAMERA_RECORDING_CONFIRMED`
  and `GSR_START_REQUESTED → GSR_RECORDING_CONFIRMED` are logged before the
  game opens; the stop pairs after the game result is received. Every game
  event therefore lies inside both recordings.
* **Coded sync flash.** Both games draw a white 140 px square in the top-left
  corner with the pattern ON 300 / OFF 300 / ON 300 / OFF 300 / ON 900 ms
  (`[sync]` in the config) once when the page connects (`sequence =
  "session_start"`) and once after the task (`"session_end"`). Each ON/OFF is
  applied and logged in the same `requestAnimationFrame` callback, so the
  logged time is the start of the frame in which the change was committed.
  Two sequences allow an offset *and* a drift estimate against the video.
* **Browser↔controller relation.** Every event batch carries the browser's
  `performance.now()` and `Date.now()` at sending; `sync_report.json` gives
  the transport latency and the spread of `Date.now() − performance.now()`
  (the conversion error of the game's wall-clock timestamps).
* ODD-ONE-OUT's original per-stimulus marker (`SyncMarkerOverlay`, top-right,
  every stimulus) is unchanged; its onset is logged from a React effect, so
  treat its timing as approximate.

## 3. Measured so far (software only)

Run on 2026-10-28, development PC, headless Chrome (no camera, no display
latency), MOCK mode (`docs/TEST_RESULTS.md`):

| Quantity | Result |
|---|---|
| Browser → controller event delivery latency | 2.6–4.8 ms (n = 6 batches) |
| Drift of browser `Date.now() − performance.now()` over the session | 0.5 ms |
| Sync flash ON durations, nominal 300 / 300 / 900 ms | 311.2 / 300.5 / 917.1 ms (rAF quantisation, ≤ 1 frame) |
| Sync-flash detector on synthetic 30 fps video with 100 ms injected lag | detected onsets exact; recovered lag within 1 frame (unit test) |

**Not measured:** display latency (render → light), camera exposure and
rolling shutter, OBS encoding/timestamping, the error of the recording-start
estimate, Shimmer Bluetooth/API delay, the Shimmer device-clock drift relative to
the PC.

## 4. Validation procedure (to do on the real setup) — `NOT RUN — HARDWARE VALIDATION PENDING`

1. Position the Logitech camera so the top-left corner of the participant's
   monitor is in the frame (or briefly turn a second camera/phone at 60+ fps
   towards it if the main framing cannot include it).
2. Run a short camera session:
   `python -m experiment run --mode CAMERA_GAME_TEST --game nogo --participant SYNC01 --condition Neutral`
   and complete (or ESC-abort) the task, so that both flash sequences occur.
3. Open the video, find the flash square, read its pixel rectangle `x,y,w,h`.
4. `python -m experiment postprocess experiment_output\session_<id> --sync-roi x,y,w,h`
5. Read `processing\sync_alignment.json`:
   * `sequences.session_start.offset_s_median` — video time minus software
     time. This is the correction to apply to software-derived video times;
     it contains display latency + capture latency + the error of
     `estimated_recording_start`.
   * `offset_s_range` within a sequence should be ≤ 1–2 frames.
   * `offset_change_between_sequences_s` — drift between video clock and PC
     clock over the session.
6. Repeat 3–5 times. Report median and spread; only then quote an alignment
   accuracy (expected: about one camera frame, ±33 ms at 30 fps).

**Shimmer alignment check (hardware):** in `shimmer/raw_data.csv` compare
`host_unix_ms` with `system_timestamp__cal__msecs` (are they the same epoch?)
and the slope of `timestamp__cal__msecs` against `host_unix_ms` over the
session (device clock drift). A physical check needs a common stimulus, e.g.
tapping the electrodes on camera at the start and end (a sharp GSR artefact
visible in the video), then comparing artefact time with the video time.
Until done, treat GSR alignment as accurate to "Bluetooth buffering", i.e.
tens of ms, and use GSR at the ≥ 1 s scale it physiologically varies on anyway.

## 5. Fluke thermal camera

Not controlled by this software and **not integrated**. What exists:

* In `FULL_MULTIMODAL` the operator must confirm it is recording; the answer
  and time are logged (`THERMAL_CAMERA_OPERATOR_CONFIRMATION`,
  `metadata.modalities.thermal_camera`).
* Suggested alignment: at the start and end of the session, briefly hold a
  warm hand (or a warm object) in front of both the RGB and the thermal
  camera, and note the PC time; or set the Fluke clock to the PC clock and
  record the difference in `--notes`.
* Extension point: implement `AcquisitionAdapter` (`experiment/adapters/base.py`)
  for a controllable thermal camera and add it to `build_adapters()`; its
  start/stop will then be bracketed and logged like the others.
