# Camera (OBS + Logitech) testing

Status of everything in this file: **`NOT RUN — HARDWARE VALIDATION PENDING`**
(no OBS or camera on the development PC). The controller code was tested
against a protocol-level fake OBS (`tests/test_obs_camera.py`), which proves
the message handling, not OBS itself.

Run from the project root (`cd ...\BTP_2026`) in PowerShell. Setup of OBS:
[SETUP.md §4](SETUP.md).

## 1. What the controller does with OBS

Preflight: `GetVersion`, `GetRecordStatus` (must be idle),
`GetRecordDirectory`, `GetInputList` + `GetSourceActive` (a *Video Capture
Device* must be active in the program scene). Start: `SetRecordDirectory` to
`<session>\camera` → `StartRecord` → poll `GetRecordStatus` until
`outputActive` and `outputBytes > 0`. Stop: `StopRecord` → wait for
`RecordStateChanged: OBS_WEBSOCKET_OUTPUT_STOPPED` → file size stable for
1 s → decode the first frame with OpenCV (if installed in the controller
interpreter) → restore the original recording directory.

## 2. Connection and camera availability (H1)

1. Start OBS. Check the Logitech image is visible in the OBS preview.
2. *Tools → WebSocket Server Settings → Show Connect Info*: port 4455 and the
   password must match `config/experiment_config.local.toml` (or
   `$env:OBS_WEBSOCKET_PASSWORD`).
3. Run:

```powershell
python -m experiment check --mode CAMERA_GAME_TEST
```

Expected (versions/names will differ):

```text
Preflight for CAMERA_GAME_TEST:
  [PASS] camera/obs: OBS 31.0.2 connected; idle; video input(s): Video Capture Device
        obs_version: 31.0.2
        obs_websocket_version: 5.5.4
        supports_set_record_directory: True
        record_directory: C:/Users/<you>/Videos
        video_inputs: [{'name': 'Video Capture Device', 'kind': 'dshow_input', 'video_active': True, 'video_showing': True}]
ALL REQUIRED CHECKS PASSED
```

Pass criteria: `[PASS]`, `supports_set_record_directory: True`,
the camera source listed with `video_active: True`.
If the camera source has a different name or another capture source is also
active, set `[obs] video_input_name = "<exact source name>"`.

## 3. Short test recording (H2)

```powershell
python -m experiment run --mode CAMERA_GAME_TEST --no-game --duration 15 --participant CAMTEST01 --condition Neutral
```

While it runs, wave at the camera and hold up a sheet with the current time.
Expected console (abridged):

```text
*** CAMERA_GAME_TEST: test session, not a research recording. ***
Preflight:
  [PASS] disk: ...
  [PASS] camera/obs: OBS ... connected; idle; video input(s): ...
Starting camera...
  camera confirmed: RECORDING
Recording for 15 s without a game (Ctrl+C to stop early)...
Stopping camera...
  camera: STOPPED, verified=True
Session <id>: COMPLETE [TEST SESSION]
Validation: PASSED (...)
```

OBS shows the red recording indicator for ~15 s.

## 4. Verify the file independently

```powershell
$s = (Get-ChildItem experiment_output -Directory | Sort-Object Name | Select-Object -Last 1).FullName
Get-ChildItem "$s\camera"                                   # <date time>.mkv (or .mp4) + camera_metadata.json
Get-Content "$s\camera\camera_metadata.json"
python hd_camera\scripts\test_video.py --video (Get-ChildItem "$s\camera" -Exclude *.json).FullName
```

Pass criteria:

* exactly one video file in `camera\` (if it is in OBS's default folder
  instead, OBS is older than 30 — see TROUBLESHOOTING);
* `verification.ok: true`, `size_stable: true`, `probe.first_frame_decoded: true`;
* `probe.duration_s` (or frames ÷ FPS from `test_video.py`) ≈ 15–17 s;
* the file plays in VLC / Films & TV and shows you waving; the clock sheet
  agrees with `start_confirmed_wallclock` within a second or two
  (note: `*_wallclock` values are **UTC**);
* resolution/FPS are what you configured in the OBS source;
* OBS *Settings → Output → Recording Path* is back to its previous value.

## 5. Failure behaviour (H3)

a) **OBS closed during recording.** Start
`python -m experiment run --mode CAMERA_GAME_TEST --no-game --duration 60 --participant CAMTEST02 --condition Neutral`
and close OBS after ~15 s. Expected within ~3 s:
`!!! CAMERA PROBLEM: OBS unreachable: ... !!!`; at the end
`Session ...: INCOMPLETE` with reasons `camera: 1 error(s) during recording`
and `camera: output not verified`. Reopen OBS and check whether it kept a
partial file (MKV/Hybrid MP4 normally do).

b) **Camera unplugged during recording.** Same command, unplug the USB
cable after ~15 s, replug after ~10 s. **Known limitation:** OBS keeps
recording (frozen or black frames), so the controller sees an active output
and does **not** report an error. Verify in the video what OBS did; record
the observed behaviour here. Until checked, the operator must watch the
OBS preview during sessions.

c) **OBS already recording at start.** Click *Start Recording* in OBS, then run
`python -m experiment check --mode CAMERA_GAME_TEST` → `[FAIL] camera/obs: OBS is already recording`.

## 6. Pose extraction on the test recording (H4)

```powershell
python -m experiment postprocess $s
Get-ChildItem "$s\processing"
python hd_camera\scripts\check_landmarks.py --input "$s\processing\pose_landmarks.csv"
```

Expected: `pose_landmarks.csv` with one row per video frame,
`behaviour_features.csv` with the same number of rows, and
`processing_metadata.json` with both steps `returncode: 0`. `check_landmarks.py`
should show high mean `*_visibility` for nose/shoulders/wrists when the person
is in frame (the existing test video gave 100 % detection on 300 frames with
`python hd_camera\scripts\pose_test.py`). Low visibility of hips/knees is normal
for a seated, desk-height camera.

Timestamps in these files are seconds from the first frame; convert with
`video_time_origin.estimated_recording_start_wallclock` in
`processing_metadata.json`, or better with the sync-flash offset
([SYNCHRONIZATION.md §4](SYNCHRONIZATION.md)).
