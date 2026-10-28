# Shimmer testing

Status of every **real-device** step here: **`NOT RUN — HARDWARE VALIDATION PENDING`**.
The recorder and adapter were tested only with the built-in **simulated**
device (`--simulate`; `tests/test_shimmer.py`), which writes `MOCK_raw_data.csv`.
Simulated tests prove the file handling and the controller protocol, **not** that
the Shimmer, Bluetooth link or ShimmerAPI.dll work.

Run from the project root in PowerShell. Installation: [SETUP.md §5](SETUP.md).
In the commands below `$py = ".venv-shimmer\Scripts\python.exe"` and the DLL
paths are the ones in your local config:

```powershell
$py = ".venv-shimmer\Scripts\python.exe"
$api = "C:\ShimmerAPI\netstandard2.0"
$ports = "C:\Users\<you>\.nuget\packages\system.io.ports\9.0.8\runtimes\win\lib\net9.0\System.IO.Ports.dll"
```

## 1. Device and channels

From the existing code (`test_shimmer.py`): device name **A406**, Bluetooth
serial port **COM10**, API class `ShimmerLogAndStreamSystemSerialPort`, signals
`GSR` (RAW, kOhms), `GSR Conductance` (uSiemens), `Internal ADC A1` (RAW, mV,
used as PPG), `Timestamp` and `System Timestamp`. That signal set matches a
**Shimmer3 with GSR+ expansion board** — confirm on the device label. The code
does **not** configure the device: enabled sensors, ranges and the sampling
rate are whatever was last written to the device (with Shimmer's Consensys
software). The recorder records every signal the device sends.

## 2. Pairing (once per PC)

1. Switch the Shimmer on (LED blinking).
2. *Settings → Bluetooth & devices → Add device → Bluetooth* → select
   `Shimmer3-A406` (name may differ by unit). PIN, if asked: `1234`
   (Shimmer default).
3. *Control Panel → Devices and Printers* → right-click the Shimmer →
   *Properties → Services/Hardware*, or *More Bluetooth settings → COM Ports*:
   note the **Outgoing** port (e.g. COM10). Put it in `[shimmer] com_port`.
4. Optional, recommended: in Consensys check/enable GSR (+ Internal ADC A1 if
   PPG is used) and set the sampling rate you want; write the configuration to
   the device; **close Consensys** (it holds the COM port).

## 3. Software check (no device needed)

```powershell
& $py -c "import pythonnet; print('pythonnet', pythonnet.__version__)"
dotnet --list-runtimes          # must list Microsoft.NETCore.App 9.x
Test-Path "$api\ShimmerAPI.dll", "$api\Google.Protobuf.dll", $ports   # True True True
```

## 4. Original baseline script (H5)

```powershell
& $py Shimmer\test_shimmer.py --port COM10 --api-dir $api --ports-dll $ports --duration 10
```

Expected (as before the refactor):

```text
Connecting to A406 on COM10...
[STATE] Connecting
[STATE] Connected
Connected successfully.
Saving CSV to: ...\Shimmer\shimmer_readings.csv
Recording for 10 seconds...
[STATE] Streaming
First recorded sample:
{'system_timestamp_ms': ..., 'device_timestamp_ms': ..., 'ppg_a1_raw': ..., 'gsr_raw': ..., ...}
[DATA] 256 packets saved
...
Packets saved: <≈ rate × 10>
```

(the exact `[STATE]` strings come from ShimmerAPI). If `shimmer_readings.csv`
already exists, a timestamped file name is used — the old file is kept.

## 5. Recorder alone (H6)

```powershell
& $py Shimmer\shimmer_recorder.py --check --port COM10 --api-dir $api --ports-dll $ports
& $py Shimmer\shimmer_recorder.py --port COM10 --api-dir $api --ports-dll $ports --output-dir Shimmer\recordings\hwtest1 --duration 30
```

`--check` must end with a line `{"type": "check_ok", "device": {...}}`; note
`sampling_rate_hz` / `firmware` (or `null` if this API build does not expose
them). The 30 s run prints `connected`, `streaming_requested`,
`streaming_confirmed`, then one `progress` line per second, and ends with
`finalized` and exit code 0 (`$LASTEXITCODE`).

## 6. Through the controller (H7)

```powershell
python -m experiment check --mode SHIMMER_GAME_TEST
python -m experiment run --mode SHIMMER_GAME_TEST --no-game --duration 30 --participant SHIMTEST01 --condition Neutral
```

Expected: `[PASS] shimmer: Shimmer A406 on COM10: connected and released ...`,
`shimmer confirmed: STREAMING <n> samples`, status lines with growing sample
counts, `shimmer: STOPPED, verified=True`, `Session ...: COMPLETE [TEST SESSION]`.
During the 30 s, touch/squeeze the GSR electrodes a few times.

## 7. Verify that the samples are genuine

```powershell
$s = (Get-ChildItem experiment_output -Directory | Sort-Object Name | Select-Object -Last 1).FullName
Get-Content "$s\shimmer\shimmer_metadata.json"
python -c "import csv,sys,statistics as st; r=list(csv.DictReader(open(sys.argv[1],encoding='utf-8'))); print(len(r),'samples'); print(list(r[0])); g=[float(x['gsr__cal__kohms']) for x in r if x.get('gsr__cal__kohms')]; print('GSR kOhm min/median/max', min(g), st.median(g), max(g)); d=[float(x['timestamp__cal__msecs']) for x in r]; print('device ts increasing:', all(b>a for a,b in zip(d,d[1:])))" "$s\shimmer\raw_data.csv"
```

Pass criteria:

* the file is `raw_data.csv` (not `MOCK_...`) and `"simulated": false`;
* `channels` contains GSR (and Internal ADC A1 if PPG enabled) with the units above;
* `sample_count` ≈ configured rate × duration (e.g. 128 Hz × 30 s ≈ 3840) and
  `estimated_rate_from_device_timestamps_hz` ≈ the configured rate;
* `timestamp__cal__msecs` strictly increasing; gaps > 2 sample periods indicate
  lost packets (count them);
* GSR values vary and show responses when the electrodes were touched,
  and are not constant / not at the range limit;
* record whether `system_timestamp__cal__msecs` ≈ `host_unix_ms` (same epoch,
  difference = API delay) — needed for [SYNCHRONIZATION.md](SYNCHRONIZATION.md).

## 8. Failure behaviour (H8)

* **Device switched off mid-recording**: run the 30 s command with
  `--duration 60` and switch the Shimmer off after 15 s. Expected within
  `stall_timeout_s` (5 s): `!!! SHIMMER PROBLEM: no new samples for 5.x s ... !!!`;
  end status `INCOMPLETE`; `raw_data.csv` keeps the samples up to the
  switch-off. Note what ShimmerAPI reports (`GSR_RECORDER_STATE` /
  `GSR_RECORDER_API_MESSAGE` rows in `events.csv`) and whether stopping took
  long (the controller waits up to `stop_timeout_s`).
* **Device off at start**: `check` must `[FAIL]` with the API's connection
  error (may take up to `connect_timeout_s`).
* **Missing channel**: if `channels` lacks `GSR`, the device configuration is
  wrong — fix it in Consensys; the recorder never invents columns.
* **COM port busy** (Consensys open): connection fails; close Consensys.

## 9. Mock vs real

| | Simulated (`--simulate`, MOCK mode) | Real device |
|---|---|---|
| data file | `MOCK_raw_data.csv` | `raw_data.csv` |
| metadata | `MOCK_shimmer_metadata.json`, `"simulated": true` | `shimmer_metadata.json`, `"simulated": false` |
| session tag | `_MOCK_`, `is_mock: true` | `_FULL_` / `_SHIMTEST_` |
| values | sine-wave GSR, sawtooth ADC | physiological |

Validation rejects MOCK files in any non-mock session.
