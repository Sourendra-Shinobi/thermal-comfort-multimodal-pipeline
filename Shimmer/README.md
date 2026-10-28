# Shimmer

Shimmer3 (GSR+; device "A406" on COM10 in the existing code) through the
official Shimmer C# API, loaded with pythonnet.

| File | Purpose |
|---|---|
| `test_shimmer.py` | original 30 s baseline recording → `shimmer_readings.csv` (7 columns). Unchanged output format; now takes `--port --device-name --duration --output --api-dir --ports-dll`; never overwrites an existing CSV |
| `shimmer_api.py` | DLL loading, `ShimmerDevice` wrapper (same API calls as the original script), `SimulatedShimmerDevice` (tests/mock only) |
| `shimmer_recorder.py` | session recorder used by the controller: all channels, native + host timestamps, `shimmer_metadata.json`, JSON-lines protocol on stdout |
| `requirements.txt` | `pythonnet` (needs Python ≤ 3.13 and a .NET runtime) |

DLL paths: `--api-dir/--ports-dll`, or `SHIMMER_API_DIR` / `SHIMMER_PORTS_DLL`,
else the paths hard-coded in the original script.

```powershell
.venv-shimmer\Scripts\python Shimmer\test_shimmer.py --port COM10 --duration 30
.venv-shimmer\Scripts\python Shimmer\shimmer_recorder.py --check --port COM10
.venv-shimmer\Scripts\python Shimmer\shimmer_recorder.py --port COM10 --output-dir Shimmer\recordings\t1 --duration 30
python Shimmer\shimmer_recorder.py --simulate --output-dir $env:TEMP\shimsim --duration 5   # SIMULATED, no device
```

Setup: [../docs/SETUP.md §5](../docs/SETUP.md). Hardware validation (pending):
[../docs/SHIMMER_TESTING.md](../docs/SHIMMER_TESTING.md).
