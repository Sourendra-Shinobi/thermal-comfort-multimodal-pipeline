# Running a real session (operator guide)

Prerequisites: [SETUP.md](SETUP.md) done, and the hardware validated once with
[HARDWARE_TESTING.md](HARDWARE_TESTING.md). Run everything from the project root
in PowerShell.

## Modes

| Mode | Camera | Shimmer | Use |
|---|---|---|---|
| `FULL_MULTIMODAL` | OBS (real) | device (real) | **participant sessions — the only research mode** |
| `CAMERA_GAME_TEST` | OBS | – | camera rehearsal |
| `SHIMMER_GAME_TEST` | – | device | GSR rehearsal |
| `GAME_ONLY_TEST` | – | – | task rehearsal, software checks |
| `MOCK_INTEGRATION_TEST` | mock (no video) | simulated | software pipeline check; **produces no real data** |

Test and mock sessions are tagged in the folder name (`_CAMTEST_`, `_MOCK_`, …)
and in `metadata.json` (`is_test_session`, `is_mock`).

## Checklist before the participant arrives

1. Thermal chamber/room at the target condition; note the measured air
   temperature and humidity.
2. OBS open, Logitech camera visible in the OBS preview, framed as required.
   If you want video-based synchronisation, make sure the **top-left corner
   of the participant's screen** is visible in the camera image (see
   [SYNCHRONIZATION.md](SYNCHRONIZATION.md)).
3. Shimmer charged, switched on, electrodes attached, not connected to any
   other software (Consensys must be closed).
4. Fluke thermal camera ready (it is started by hand).
5. Preflight:

```powershell
python -m experiment check --mode FULL_MULTIMODAL --game nogo
```

Every line must read `[PASS]` and the last line `ALL REQUIRED CHECKS PASSED`.
If not, fix it now ([TROUBLESHOOTING.md](TROUBLESHOOTING.md)); do not start.

## Running the session

1. Start the Fluke recording by hand.
2. Start the session (one game per session; run the command again for the next task):

```powershell
python -m experiment run --mode FULL_MULTIMODAL --game nogo `
    --participant P007 --condition Warm --air-temp 30.5 --rh 52 --block 1 `
    --notes "camera 1280x720@30, chair B"
```

   * `--participant`: pseudonym only, never a name.
   * `--game`: `nogo` or `odd_one_out` (`python -m experiment games`).
   * More environmental values: `--env globe_temp_c=31.2 --env air_speed_ms=0.1`.

3. Answer `yes` when asked whether the Fluke camera is recording (the answer is logged).
4. The controller runs preflight again, then starts and **confirms** the OBS
   recording and the Shimmer stream, then opens the game in the browser.
   Watch for:

```text
  camera confirmed: RECORDING
  shimmer confirmed: STREAMING 12 samples
Game URL: http://127.0.0.1:8765/games/nogo/index.html?session=...
```

5. In the browser: press F11 / *Enter fullscreen*, check the bottom strip says
   `Controller session <id> · FULL_MULTIMODAL`, then go through Setup
   (participant/session are pre-filled and locked; choose the task options as
   usual), Instructions, Practice, Main task. A white square flashes in the
   top-left corner when the page opens and again after the task — that is the
   sync marker.
6. Every 10 s the console prints a status line; any device problem prints
   `!!! CAMERA PROBLEM ... !!!` or `!!! SHIMMER PROBLEM ... !!!`. Recording
   continues; decide whether to continue the participant and note it.
7. When the task ends the game sends its data automatically
   (`results delivered to controller ✓` in the bottom strip). The controller
   then stops the Shimmer, then OBS, verifies both files and prints:

```text
Session 20261103-101500_P007_FULL_3fa2: COMPLETE
Validation: PASSED (<n> checks, 0 not ok)
```

8. Stop the Fluke recording by hand.

**To abort** at any point press `Ctrl+C` once in the controller window. It
stops and finalises both recordings and marks the session `ABORTED`; nothing
recorded so far is deleted. ESC in the game aborts the task (session `ABORTED`,
partial trials kept).

## After the session

```powershell
python -m experiment list                                         # all sessions + status
python -m experiment validate experiment_output\session_<id>      # re-check files any time
python -m experiment postprocess experiment_output\session_<id>   # optional pose features
```

Statuses: `COMPLETE` (everything confirmed and verified) · `INCOMPLETE`
(something failed during or after recording — see `status_reasons` in
`metadata.json`) · `ABORTED` · `FAILED` (a device would not start) ·
`PREFLIGHT_FAILED` (nothing recorded).

Back up `experiment_output\` after each day. The folder contains participant
video: store it according to your ethics approval.
