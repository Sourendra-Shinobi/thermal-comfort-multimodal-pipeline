# Data formats

## 1. Session folder

```text
experiment_output/
└── session_<YYYYMMDD-HHMMSS>_<participant>_<MODETAG>_<4 hex>/
    ├── metadata.json            session description, statuses, versions, config snapshot
    ├── events.csv               central event log (controller + game + recorder)
    ├── sync_report.json         clock relationships measured during the session
    ├── manifest.json            every file with size, SHA-256, role; validation results
    ├── camera/
    │   ├── <OBS file name>.mkv|.mp4   the RGB recording, OBS's own file name (not renamed)
    │   └── camera_metadata.json
    ├── shimmer/
    │   ├── raw_data.csv
    │   ├── shimmer_metadata.json
    │   └── recorder_stderr.log  diagnostics from the recorder process (usually empty)
    ├── games/<task>/            task = nogo | odd_one_out
    │   ├── trials.csv           exactly the game's own CSV export
    │   ├── events.csv           the game's own event list
    │   ├── session_export.json  the game's complete JSON export
    │   └── summary.json         status, trial counts, game summary statistics
    ├── processing/              only after `python -m experiment postprocess`
    │   ├── pose_landmarks.csv
    │   ├── behaviour_features.csv
    │   ├── sync_marker_detections.csv, sync_alignment.json   (with --sync-roi)
    │   └── processing_metadata.json
    └── logs/
        ├── experiment.log
        └── postprocess_<step>.log
```

Mode tags: `FULL`, `CAMTEST`, `SHIMTEST`, `GAMEONLY`, `MOCK`. In mock mode
the files are named `camera/MOCK_camera_metadata.json`,
`shimmer/MOCK_raw_data.csv` and `shimmer/MOCK_shimmer_metadata.json`; there is no
video. Validation fails a non-mock session that contains any `MOCK_*` file.

Trials are stored once, under `games/<task>/`; there is no copy at the session root.
If OBS lacks `SetRecordDirectory` (OBS < 30), the video stays in OBS's own
folder and is listed under `external_files` in `manifest.json`.

## 2. What kind of quantity each file holds

| Category | Where | Notes |
|---|---|---|
| **Recorded measurements** | `camera/*.mkv`, `shimmer/raw_data.csv` (RAW and CAL channels), game trial responses and timestamps | CAL values are Shimmer-API calibrations of the RAW values, both kept |
| **Experimental context** | `metadata.json` → `thermal_condition`, `environment` (values the operator typed: `--air-temp`, `--rh`, `--env`) | the condition label does not change any task parameter |
| **Derived features** | `processing/*.csv`, game `summary.json` statistics, `rt_valid` flags | recomputable from the recorded data |
| **Subjective ratings** | *not collected by this software* | thermal sensation/comfort votes must be recorded separately (see note) |
| **Inferred states** | *none* | nothing in this pipeline infers comfort, stress or arousal |

GSR is not a thermal-comfort measurement: it also responds to arousal,
workload, movement and sweating. Note: there is currently **no instrument
for subjective thermal ratings** in the pipeline. If you add one, store it as
its own file, not in `environment`.

## 3. `events.csv` (central log)

One row per event, in the order the controller logged them, flushed per row.

| Column | Meaning |
|---|---|
| `session_id` | session id |
| `event_seq` | 1, 2, 3 … without gaps (validated) |
| `event_type` | e.g. `CAMERA_RECORDING_CONFIRMED`, `STIMULUS_ONSET` |
| `source` | `controller`, `shimmer_recorder`, or `game:<task>` |
| `status` | `ok`, `warning`, `error` |
| `monotonic_s` | controller `time.perf_counter()` seconds since session creation (for intervals) |
| `wallclock` | controller system time when logged, UTC ISO 8601 (`…Z`) |
| `task`, `block`, `trial` | when applicable |
| `source_seq` | the game's own sequence number for that event |
| `source_monotonic_ms` | game event time, browser `performance.now()` ms (**use for RTs and game-event intervals**) |
| `source_wallclock` | game's wall-clock conversion of that time (UTC ISO 8601) |
| `payload` | JSON object with event details |

For game events, `wallclock` is the *receipt* time (events are sent in batches,
so up to ~250 ms + transport later); `source_wallclock` is the event time.

Controller event types: `SESSION_CREATED`, `PREFLIGHT_STARTED/RESULT/PASSED/FAILED`,
`THERMAL_CAMERA_OPERATOR_CONFIRMATION`, `CAMERA_START_REQUESTED`,
`CAMERA_RECORDING_CONFIRMED`, `CAMERA_STOP_REQUESTED`, `CAMERA_RECORDING_STOPPED`,
`CAMERA_WARNING`, `GSR_START_REQUESTED`, `GSR_RECORDING_CONFIRMED`,
`GSR_STOP_REQUESTED`, `GSR_RECORDING_STOPPED`, `GSR_RECORDER_STATE/API_MESSAGE/WARNING/ERROR`,
`ACQUISITION_CONFIRMED`, `GAME_LAUNCH_REQUESTED`, `GAME_CONNECTED`, `GAME_SCREEN`,
`GAME_NOT_CONNECTED`, `GAME_HEARTBEAT_LOST/RESTORED`, `GAME_RESULT_RECEIVED`,
`GAME_TIMEOUT`, `DEVICE_ERROR`, `DEVICE_RECOVERED`, `SESSION_ABORTED`,
`CONTROLLER_ERROR`, `EXPORT_ERROR`, `NO_GAME_RECORDING`, `SESSION_FINALIZED`.
Game event types are the games' own (see each game's README) plus
`ORCHESTRATOR_CONNECTED`, `SYNC_SEQUENCE_STARTED`, `SYNC_MARKER_ONSET`,
`SYNC_MARKER_OFFSET`, `SYNC_SEQUENCE_COMPLETED`. Session sync-flash events have
`payload.marker_source = "session_sync_sequence"`; ODD-ONE-OUT's existing
per-stimulus marker events do not.

## 4. `metadata.json`

Key fields: `session_id`, `status` (`CREATED` → `RUNNING` → `COMPLETE` |
`INCOMPLETE` | `ABORTED` | `FAILED`, or `PREFLIGHT_FAILED`), `status_reasons[]`,
`mode`, `is_test_session`, `is_mock`, `participant_pseudonym`, `thermal_condition`,
`block`, `task`, `notes`, `environment{}`, `created_wallclock`, `ended_wallclock`
(local ISO), `clock{}` (controller clock origin), `preflight[]` (every check with
details), `modalities.camera|shimmer|game|thermal_camera{}` (start/stop times,
verification, errors during recording), `software{}` (controller version,
Python, OS, host, game package version, NO-GO git commit), `config{}` (full
configuration used, password masked), `event_counts{}`, `event_write_failures`.

## 5. `camera/camera_metadata.json`

`obs_version`, `obs_websocket_version`, `record_directory`,
`original_record_directory`, `start_requested_wallclock`,
`start_confirmed_wallclock`, `estimated_recording_start_wallclock` /
`_unix_s` (confirmation time minus OBS's reported `outputDuration`),
`estimated_start_uncertainty_s` (request→confirmation interval),
`final_output_duration_ms`, `stop_requested_wallclock`, `output_path`,
`verification{path, exists, size_bytes, size_stable, inside_session_folder,
probe{opened, fps, frame_count, width, height, duration_s, first_frame_decoded}, ok}`.

## 6. `shimmer/raw_data.csv` and `shimmer_metadata.json`

Columns: `sample_index` (recorder counter), `host_unix_ms` (PC system clock when
the API callback ran), `host_monotonic_ms` (recorder `perf_counter`), then **every
signal of the first packet**, named `<name>__<format>__<unit>` in lower case,
e.g. for the GSR+ configuration used so far:

| Column | Shimmer API signal |
|---|---|
| `system_timestamp__cal__msecs` | `System Timestamp` CAL mSecs (PC-side timestamp from ShimmerAPI) |
| `timestamp__cal__msecs` | `Timestamp` CAL mSecs (device clock) |
| `internal_adc_a1__raw__no_units` / `__cal__mvolts` | `Internal ADC A1` (PPG input) |
| `gsr__raw__no_units` / `gsr__cal__kohms` | `GSR` |
| `gsr_conductance__cal__usiemens` | `GSR Conductance` |

The real column set depends on the sensors enabled on the device; the
authoritative list (original names, formats, units) is `channels[]` in
`shimmer_metadata.json`. Values are written exactly as delivered by the API.
Metadata also holds: `device{}` (name, port, sampling rate / firmware if the
API exposes them, else `null`), `sample_count`, first/last sample times,
`estimated_rate_from_device_timestamps_hz`, `estimated_rate_from_host_clock_hz`,
`unexpected_signals_not_recorded`, `callback_errors`, `errors[]`.

The baseline script `Shimmer/test_shimmer.py` keeps its original 7-column
format (`system_timestamp_ms, device_timestamp_ms, ppg_a1_raw, ppg_a1_mV, gsr_raw,
gsr_resistance_kOhms, gsr_conductance_uSiemens`).

## 7. Game files

* `trials.csv` — NO-GO: the 30 fixed columns in `Games/NO-GO/README.md` §9.
  ODD-ONE-OUT: columns of `Games/ODD-ONE-OUT/src/utils/csv.ts`. Practice and
  main trials, `is_practice` distinguishes them. Times in `*_perf` columns are
  browser `performance.now()` ms; `*_wallclock` are UTC ISO.
* `events.csv` — NO-GO: `event_type, timestamp_perf, timestamp_wallclock,
  trial_number, detail`; ODD-ONE-OUT: its own `events.csv` export format.
* `session_export.json` — identical to the game's "Download JSON".
* `summary.json` — `{task, status: completed|aborted, reason, trial_count,
  main_trial_count, event_count, game_summary, game_metadata}`.

## 8. `processing/`

* `pose_landmarks.csv` — `frame` (1-based), `timestamp` (**seconds since the
  first video frame**, `(frame-1)/fps`), then `<landmark>_{x,y,z,visibility}` for
  the 33 MediaPipe pose landmarks (normalised image coordinates); empty when no
  pose was detected.
* `behaviour_features.csv` — `frame, timestamp, head_movement, head_offset,
  torso_lean, shoulder_asymmetry, left_hand_movement, right_hand_movement,
  hand_activity` (definitions in `hd_camera/scripts/calculate_features.py`).
* `processing_metadata.json` — inputs, commands, exit codes and the
  video-time origin to convert `timestamp` to wall clock.

## 9. `sync_report.json` and `manifest.json`

`sync_report.json`: `anomalies[]`, `browser_to_controller_latency_ms{n,min,median,p95,max}`,
`browser_perf_to_wallclock_offset_ms{first,last,range_over_session}`, the logged
sync-flash events, acquisition anchors, and a list of what was **not** measured.
See [SYNCHRONIZATION.md](SYNCHRONIZATION.md).

`manifest.json`: `session_id, status, mode, is_mock, is_test_session,
generated_wallclock, files[{path, role, bytes, sha256}], external_files[],
validation{passed, checks[{check, ok, required, message}]}`. Regenerate any time
with `python -m experiment validate <session>`.
