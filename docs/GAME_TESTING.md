# Game testing

Games: `nogo` (Games/NO-GO) and `odd_one_out` (Games/ODD-ONE-OUT). There is
no Simon task in the repository.

> **Trial counts in the current configs look like development values:** NO-GO
> `NUMBER_OF_TRIALS: 20` (its README documents 150), ODD-ONE-OUT
> `NUMBER_OF_TRIALS: 10`, `PRACTICE_TRIALS: 3`. They were **not** changed.
> Set the final values in each `src/experiment/experimentConfig.ts`, rebuild,
> and bump `EXPERIMENT_VERSION` before data collection.

## 1. Automated tests (no hardware) — RUN, passing

```powershell
cd Games\NO-GO;       npm test; cd ..\..     # 57 tests (45 original + 12 integration)
cd Games\ODD-ONE-OUT; npm test; cd ..\..     # 18 tests (6 original + 12 integration)
python -m unittest tests.test_game_integration tests.test_server
```

## 2. Stand-alone (unchanged behaviour)

```powershell
cd Games\NO-GO; npm run dev        # open http://localhost:5173
```

Without `?session=` in the URL there is no bottom status strip and no sync
flash; setup fields are free; data are downloaded from the Export screen as
before. Same for ODD-ONE-OUT (its welcome screen still offers its three
original modes; its readiness check still talks to OBS/the Shimmer bridge
directly in stand-alone mode).

## 3. Through the controller (H9 on the lab PC)

```powershell
cd Games\NO-GO; npm run build; cd ..\..
python -m experiment run --mode GAME_ONLY_TEST --game nogo --participant GT01 --condition Neutral
```

The browser opens `http://127.0.0.1:8765/games/nogo/index.html?session=<id>`.
Check, in order:

1. A white square flashes 3 times in the top-left corner (start sequence).
2. The bottom strip reads `Controller session <id> · GAME_ONLY_TEST · TEST SESSION`.
3. Setup: Participant ID `GT01` and Session ID `<id>` are filled in and read-only;
   thermal condition fixed to `Neutral`.
4. The strip disappears during practice and main task (no distraction).
5. After the task: completion screen, strip shows `results delivered to controller ✓`,
   and the square flashes again (end sequence). The controller prints
   `Game finished: status=completed trials=<n>` and then the session summary.

Repeat with `--game odd_one_out`. In ODD-ONE-OUT the welcome screen shows only
the controller's mode and the readiness check reads `Recording confirmed by
controller` (in `GAME_ONLY_TEST` no device is required, so both are `SKIPPED`).

To test against the Vite dev server instead of the build, start the
controller with `--no-browser`, then open
`http://localhost:5173/?session=<id>&api=http://127.0.0.1:8765`.

## 4. Verify the outputs belong to the session

```powershell
$s = (Get-ChildItem experiment_output -Directory | Sort-Object Name | Select-Object -Last 1).FullName
Get-ChildItem "$s\games\nogo"
python -c "import csv,sys,statistics as st; r=list(csv.DictReader(open(sys.argv[1],encoding='utf-8'))); m=[x for x in r if x['is_practice']=='false']; print(len(r),'rows,',len(m),'main'); print('session ids:', {x['session_id'] for x in r}); rt=[float(x['reaction_time_ms']) for x in m if x['reaction_time_ms']]; print('RTs:',len(rt),'median',round(st.median(rt),1) if rt else None)" "$s\games\nogo\trials.csv"
```

Pass criteria:

* `trials.csv`, `events.csv`, `session_export.json`, `summary.json` present;
* row count = practice trials (× number of practice runs) + `NUMBER_OF_TRIALS`;
* the only `session_id` value is the controller's session id;
* reaction times present for responded GO trials, empty for no-response trials;
* central `events.csv` contains the game's `STIMULUS_ONSET` rows with
  `source = game:nogo` and the same count as trials in the main block;
* `python -m experiment validate $s` → `VALID`.

## 5. Interruption cases

| Action | Expected |
|---|---|
| ESC during main task | completion screen "aborted"; result sent with `status: aborted`; session `ABORTED`; partial trials kept |
| Close the tab mid-task | controller: `WARNING: game heartbeat lost`; events up to that moment are in `events.csv` (streamed live); Ctrl+C → `ABORTED`, no `trials.csv` |
| Controller not running, page opened with `?session=` | red strip `CONTROLLER NOT CONNECTED`; setup is not shown (prevents unlinked data) |
| Old tab from a previous session | its posts are rejected (409); nothing written to the new session |
| Result upload fails | strip `RESULTS NOT DELIVERED — download them on the export screen`; use the Export buttons as backup |
