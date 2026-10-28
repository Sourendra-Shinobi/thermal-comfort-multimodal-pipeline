# Troubleshooting

Find the message you see; most come straight from the console or from
`status_reasons` in `metadata.json`. Detailed controller log:
`<session>\logs\experiment.log`.

## Controller / general

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot listen on 127.0.0.1:8765 ... Is another controller (or old shimmer bridge) running?` | another controller still running, or something else on 8765 | close the other window; `Get-NetTCPConnection -LocalPort 8765` to find the process; or set `[server] port` (ODD-ONE-OUT stand-alone expects 8765) |
| `[FAIL] disk: ... GB free` | below `min_free_disk_gb` | free space or move `[paths] output_root` |
| `[FAIL] game/nogo: dist/ is older than src/` | game source changed after last build | `cd Games\NO-GO; npm run build` (or `--allow-stale-build` for a deliberate test) |
| `[FAIL] game/...: dist/ was built with absolute asset paths` | build from before `base: './'` | rebuild |
| `Config error: ...` | TOML syntax or invalid value | check the named key; TOML strings need quotes, Windows paths use `/` or `\\` |
| `[FAIL] thermal_camera: operator did NOT confirm Fluke recording` | answered anything but `yes` | start the Fluke recording, rerun |
| Session `INCOMPLETE` with `validation failed` | a file check failed | `python -m experiment validate <session>` lists the failing check |
| Ctrl+C pressed twice, OBS still recording | stop interrupted | stop recording in OBS by hand; restore OBS recording path (*Settings → Output*) |

## Camera / OBS

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot connect to OBS WebSocket at 127.0.0.1:4455: ... refused` | OBS not running or WebSocket server disabled | start OBS; *Tools → WebSocket Server Settings → Enable* |
| `OBS WebSocket requires a password` / `OBS rejected identification (wrong password?)` | password missing/wrong | copy it from *Show Connect Info* into `experiment_config.local.toml` or `$env:OBS_WEBSOCKET_PASSWORD` |
| `no active Video Capture Device source in the current scene` | camera source missing, hidden, in another scene, or camera unplugged | add/enable the source in the live scene; check the preview; or set `[obs] video_input_name` |
| `OBS is already recording` | a manual or previous recording | stop it in OBS |
| `OBS did not confirm recording within timeout` | OBS failed to start the output (disk, encoder, path) | read OBS's error dialog/log (*Help → Log Files*); test *Start Recording* by hand |
| `CAMERA_WARNING ... lacks SetRecordDirectory` | OBS < 30 | upgrade OBS; meanwhile the video stays in OBS's folder and is listed in `manifest.json` → `external_files` |
| `verified=False`, `not decodable` | file truncated (plain MP4 after a crash) or codec not readable by OpenCV | use MKV/Hybrid MP4; check the file plays in VLC |
| camera unplugged but no error | **known limitation**: OBS keeps recording frozen/black frames | watch the OBS preview; see CAMERA_TESTING §5b |
| ODD-ONE-OUT stand-alone readiness: `Cannot reach OBS WebSocket` | stand-alone browser OBS client | same OBS fixes; the password is not configurable in that UI (`obsController.configure({password})`), prefer running through the controller |

## Shimmer

| Symptom | Cause | Fix |
|---|---|---|
| `Shimmer API files not found: ...` | DLL paths wrong (defaults are the original author's paths) | set `[shimmer] api_dir`, `ports_dll` (SETUP §5) |
| `pythonnet is not installed in this interpreter` | `[shimmer] python` points at an interpreter without pythonnet (e.g. 3.14) | create the 3.13 venv (SETUP §5) and set `[shimmer] python` |
| `Could not start the .NET runtime (coreclr)` | .NET runtime missing / wrong major version | install the runtime matching System.IO.Ports.dll (.NET 9 for the net9.0 build); `dotnet --list-runtimes` |
| `recorder did not connect` / `Connect() returned but IsConnected() is False` | device off, out of range, not paired, wrong COM port, port used by Consensys | switch on; check COM port (SHIMMER_TESTING §2); close Consensys; re-pair |
| `no samples received after StartStreaming` | sensors not enabled / device in a logging-only mode | configure in Consensys |
| `!!! SHIMMER PROBLEM: no new samples for ...` during a session | battery, range, Bluetooth drop | data up to the drop are kept; check device; session ends `INCOMPLETE` |
| `signals not present in first packet are not recorded` | device configuration changed mid-stream | should not happen; report with `shimmer_metadata.json` |
| `shimmer_readings.csv` not overwritten | intended: new runs of `test_shimmer.py` get a timestamped name | — |

## Games / browser

| Symptom | Cause | Fix |
|---|---|---|
| Red strip `CONTROLLER NOT CONNECTED` | controller stopped, or page opened from an old link | start a new session; use the URL it prints |
| `WARNING: the game has not connected after 60 s` | browser did not open, or opened another profile/URL | open the printed URL by hand; set `[browser] command` |
| `GAME_HEARTBEAT_LOST` | tab closed, PC asleep, browser frozen | reopen; Ctrl+C to end the session (events so far are kept) |
| strip `RESULTS NOT DELIVERED` | controller gone before the end | use the game's Export screen downloads; copy them into `games/<task>/` manually and note it |
| Fonts look different | Google Fonts not reachable offline | cosmetic; falls back to system fonts |
| `SYNC_END_SEQUENCE_MISSING` warning | tab hidden/closed before the end flash finished | not fatal; that session has only the start flash for video alignment |

## Post-processing

| Symptom | Cause | Fix |
|---|---|---|
| `MOCK session: there is no real video` | by design | — |
| `no unique video found` | video outside the session or several files in `camera/` | check `camera_metadata.json` → `output_path` |
| `... already exists; delete it deliberately to re-run` | outputs are never overwritten | delete/rename `processing\*.csv` yourself |
| `extract_landmarks failed` | wrong interpreter / missing mediapipe | `[postprocess] python`; see `logs\postprocess_extract_landmarks.log` |
| `sync flash not visible in the given ROI` | wrong ROI or screen corner not in view | read ROI from a video frame (pixels, `x,y,w,h`) |
