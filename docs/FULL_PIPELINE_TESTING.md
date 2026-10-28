# Full-pipeline acceptance test (H11)

Status: **`NOT RUN — HARDWARE VALIDATION PENDING`**. The same flow has run in
`MOCK_INTEGRATION_TEST` (mock camera, simulated Shimmer, real browser) and in
automated tests with a fake OBS; see [TEST_RESULTS.md](TEST_RESULTS.md).

Precondition: camera tests ([CAMERA_TESTING.md](CAMERA_TESTING.md)), Shimmer
tests ([SHIMMER_TESTING.md](SHIMMER_TESTING.md)) and game tests
([GAME_TESTING.md](GAME_TESTING.md)) passed individually.

## 0. Software rehearsal (any PC, no hardware)

```powershell
python -m experiment run --mode MOCK_INTEGRATION_TEST --game nogo --participant MOCK01 --condition Neutral
```

Play the task through. Expect `COMPLETE [MOCK - NOT REAL DATA]` and a session
folder ending in `_MOCK_xxxx`. This proves the PC/browser setup, not the devices.

## 1–11. Acceptance run

Use a test participant code (`ACC01`) and run one full game.

| Step | Do | Expected / pass criterion |
|---|---|---|
| 1 Preflight | `python -m experiment check --mode FULL_MULTIMODAL --game nogo` | all `[PASS]`, `ALL REQUIRED CHECKS PASSED` |
| 2 Session creation | start Fluke; `python -m experiment run --mode FULL_MULTIMODAL --game nogo --participant ACC01 --condition Neutral --air-temp <t> --rh <rh>`; answer `yes` | `Session folder: ...\session_<date>_ACC01_FULL_xxxx` |
| 3 Camera recording | watch console + OBS | `camera confirmed: RECORDING`; OBS red dot |
| 4 Shimmer acquisition | watch console | `shimmer confirmed: STREAMING n samples`; status lines with growing counts |
| 5 Game launch/completion | play the whole task | browser opens; strip shows `FULL_MULTIMODAL`; `results delivered ✓`; console `Game finished: status=completed` |
| 6 Event logging | after the run, open `events.csv` | sequence 1…N; controller, `shimmer_recorder` and `game:nogo` sources present; one `STIMULUS_ONSET` per trial |
| 7 Sync markers | `events.csv` | 2 × `SYNC_SEQUENCE_STARTED/COMPLETED` (`session_start`, `session_end`), 3 ONSET + 3 OFFSET each; `sync_report.json` `anomalies: []`, latency median < 50 ms |
| 8 Acquisition shutdown | console | `shimmer: STOPPED, verified=True` then `camera: STOPPED, verified=True`; OBS not recording; OBS recording path restored |
| 9 File validation | `python -m experiment validate <session>` | `VALID`, no `[FAIL]` |
| 10 Manifest | open `manifest.json` | `status: COMPLETE`, `is_mock: false`, every file with sha256; no `MOCK_` file; video under `camera/` (else in `external_files`) |
| 11 Post-processing (optional) | `python -m experiment postprocess <session> --sync-roi x,y,w,h` | landmarks + features CSVs; `sync_alignment.json` with both sequences `matched: true` |

## Comparing expected and actual outputs

```powershell
$s = "experiment_output\session_<id>"
Get-Content "$s\metadata.json" | Select-String '"status"|is_mock|is_test_session'
python -c "import json,sys; m=json.load(open(sys.argv[1]+'/metadata.json')); print(m['status'], m['status_reasons']); [print(k, v.get('state'), (v.get('verification') or {}).get('ok')) for k,v in m['modalities'].items()]" $s
```

Then check by hand:

* **Durations agree:** video duration (`camera_metadata.json` → `verification.probe.duration_s`)
  ≈ Shimmer `host_span_s` ≈ time between `CAMERA_RECORDING_CONFIRMED` and
  `CAMERA_STOP_REQUESTED` in `events.csv`, each within ~2 s (start/stop are sequential).
* **Bracketing:** first and last game event wall-clock times fall between
  Shimmer `first_sample_host_wallclock` and `last_sample_host_wallclock`, and
  between the camera start/stop times.
* **Trial count** in `games/nogo/trials.csv` = configured practice + main trials.
* **Shimmer content**: the checks in SHIMMER_TESTING §7.
* **Video content**: plays, shows the participant for the whole task.

## Pass / fail decision

The acceptance test **passes** only if: status `COMPLETE`; validation
`VALID`; every row of the table above met; the video plays; Shimmer data are
physiologically plausible; the sync flash was found in the video (if the screen
corner is in view). Record the session id, date and operator in
[HARDWARE_TESTING.md](HARDWARE_TESTING.md) (row H11). Anything else is a
fail — keep the folder, note the `status_reasons`, and consult
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).
