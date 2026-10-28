"""Shimmer C# API access through pythonnet, extracted from test_shimmer.py.

Requirements (Windows):
  * .NET runtime matching System.IO.Ports.dll (the original setup used the
    net9.0 build, i.e. the .NET 9 runtime)
  * pythonnet 3.x  (``pip install pythonnet``; Python <= 3.13)
  * ShimmerAPI.dll + Google.Protobuf.dll built from Shimmer-C-API (netstandard2.0)
  * System.IO.Ports.dll from the system.io.ports NuGet package

DLL locations: argument > environment variable (SHIMMER_API_DIR,
SHIMMER_PORTS_DLL) > the paths hard-coded in the original script.
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Callable

# Paths from the original test_shimmer.py (the machine it was written on).
LEGACY_API_DIR = r"D:\ML Notes\Shimmer-C-API-master\ShimmerAPI\ShimmerAPI\bin\Debug\netstandard2.0"
LEGACY_PORTS_DLL = (
    r"C:\Users\sreed\.nuget\packages\system.io.ports\9.0.8"
    r"\runtimes\win\lib\net9.0\System.IO.Ports.dll"
)
SHIMMER_TYPE = "ShimmerAPI.ShimmerLogAndStreamSystemSerialPort"

# ShimmerBluetooth message identifiers delivered through UICallback.
INDICATOR_STATE = 0
INDICATOR_MESSAGE = 1
INDICATOR_DATA = 2

Signal = tuple[str, str, str]  # (name, format, unit), e.g. ("GSR", "CAL", "kOhms")
DataCallback = Callable[[dict[Signal, float], float, float], None]


class ShimmerApiError(RuntimeError):
    pass


def resolve_paths(api_dir: str | None = None, ports_dll: str | None = None) -> tuple[str, str]:
    return (
        api_dir or os.environ.get("SHIMMER_API_DIR") or LEGACY_API_DIR,
        ports_dll or os.environ.get("SHIMMER_PORTS_DLL") or LEGACY_PORTS_DLL,
    )


def load_shimmer_api(api_dir: str, ports_dll: str):
    """Load the .NET assemblies. Returns (shimmer_type, System)."""
    missing = [p for p in (ports_dll, os.path.join(api_dir, "Google.Protobuf.dll"), os.path.join(api_dir, "ShimmerAPI.dll"))
               if not os.path.isfile(p)]
    if missing:
        raise ShimmerApiError("Shimmer API files not found: " + "; ".join(missing)
                              + ". Set SHIMMER_API_DIR / SHIMMER_PORTS_DLL or [shimmer] api_dir / ports_dll.")
    try:
        from pythonnet import load
    except ImportError as exc:
        raise ShimmerApiError("pythonnet is not installed in this interpreter (pip install pythonnet)") from exc
    try:
        load("coreclr")
    except Exception as exc:  # already loaded, or no .NET runtime
        if "already" not in str(exc).lower():
            raise ShimmerApiError(f"Could not start the .NET runtime (coreclr): {exc}") from exc
    import clr  # noqa: F401  (provided by pythonnet)
    import System

    clr.AddReference(ports_dll)
    clr.AddReference(os.path.join(api_dir, "Google.Protobuf.dll"))
    clr.AddReference(os.path.join(api_dir, "ShimmerAPI.dll"))
    assembly = System.Reflection.Assembly.LoadFrom(os.path.join(api_dir, "ShimmerAPI.dll"))
    shimmer_type = assembly.GetType(SHIMMER_TYPE)
    if shimmer_type is None:
        raise ShimmerApiError(f"{SHIMMER_TYPE} not found in ShimmerAPI.dll")
    return shimmer_type, System


def decode_cluster(obj) -> dict[Signal, float]:
    """ObjectCluster -> {(name, format, unit): value}, exactly as test_shimmer.py did."""
    names = list(obj.GetNames())
    formats = list(obj.GetFormats())
    units = list(obj.GetUnits())
    values = list(obj.GetData())
    return {(str(n), str(f), str(u)): float(v) for n, f, u, v in zip(names, formats, units, values)}


class ShimmerDevice:
    """Thin wrapper over ShimmerLogAndStreamSystemSerialPort."""

    simulated = False

    def __init__(self, device_name: str, com_port: str, api_dir: str | None = None, ports_dll: str | None = None,
                 on_state: Callable[[str], None] | None = None,
                 on_message: Callable[[str], None] | None = None,
                 on_data: DataCallback | None = None,
                 on_callback_error: Callable[[str], None] | None = None) -> None:
        self.device_name, self.com_port = device_name, com_port
        self.api_dir, self.ports_dll = resolve_paths(api_dir, ports_dll)
        self.on_state, self.on_message, self.on_data = on_state, on_message, on_data
        self.on_callback_error = on_callback_error
        self._shimmer = None
        self._callback = None  # keep the delegate alive while streaming

    def _ensure(self):
        if self._shimmer is None:
            shimmer_type, System = load_shimmer_api(self.api_dir, self.ports_dll)
            self._shimmer = System.Activator.CreateInstance(
                shimmer_type, System.Array[System.Object]([self.device_name, self.com_port]))
            self._callback = System.EventHandler(self._on_event)
            self._shimmer.UICallback = self._callback
        return self._shimmer

    def _on_event(self, sender, args) -> None:
        try:
            indicator = int(args.getIndicator())
            if indicator == INDICATOR_STATE:
                if self.on_state:
                    self.on_state(str(sender.GetStateString()))
            elif indicator == INDICATOR_MESSAGE:
                if self.on_message:
                    self.on_message(str(args.getObject()))
            elif indicator == INDICATOR_DATA and self.on_data:
                host_unix_ms = time.time() * 1000.0
                host_mono_ms = time.perf_counter() * 1000.0
                self.on_data(decode_cluster(args.getObject()), host_unix_ms, host_mono_ms)
        except Exception as exc:  # never let an exception cross into .NET
            if self.on_callback_error:
                self.on_callback_error(repr(exc))

    def connect(self) -> None:
        self._ensure().Connect()

    def is_connected(self) -> bool:
        return bool(self._shimmer is not None and self._shimmer.IsConnected())

    def state_string(self) -> str:
        return str(self._shimmer.GetStateString()) if self._shimmer is not None else "NotCreated"

    def start_streaming(self) -> None:
        self._ensure().StartStreaming()

    def stop_streaming(self) -> None:
        if self._shimmer is not None and self.state_string() == "Streaming":
            self._shimmer.StopStreaming()
            time.sleep(1)

    def disconnect(self) -> None:
        if self._shimmer is not None:
            self._shimmer.Disconnect()
            time.sleep(0.5)

    def device_info(self) -> dict:
        """Best-effort device description. Methods missing from the API build are reported as None."""
        info: dict = {"device_name": self.device_name, "com_port": self.com_port, "api_dir": self.api_dir,
                      "api_type": SHIMMER_TYPE, "simulated": False}
        for key, method in (("sampling_rate_hz", "GetSamplingRate"), ("firmware", "GetFirmwareVersionFullName"),
                            ("hardware_version", "GetShimmerVersion"), ("enabled_sensors_bitmap", "GetEnabledSensors"),
                            ("state", "GetStateString")):
            try:
                value = getattr(self._shimmer, method)()
                info[key] = value if isinstance(value, (int, float)) else str(value)
            except Exception:
                info[key] = None
        return info


class SimulatedShimmerDevice:
    """Generates synthetic samples. ONLY for MOCK_INTEGRATION_TEST and tests.

    Output produced through this class is always written to MOCK_raw_data.csv
    with "simulated": true in its metadata, so it cannot be mistaken for data.
    """

    simulated = True
    SIGNALS: list[Signal] = [
        ("System Timestamp", "CAL", "mSecs"),
        ("Timestamp", "CAL", "mSecs"),
        ("Internal ADC A1", "RAW", "no units"),
        ("Internal ADC A1", "CAL", "mVolts"),
        ("GSR", "RAW", "no units"),
        ("GSR", "CAL", "kOhms"),
        ("GSR Conductance", "CAL", "uSiemens"),
    ]

    def __init__(self, rate_hz: float = 128.0, fail_connect: bool = False, stall_after: int | None = None,
                 on_state=None, on_message=None, on_data: DataCallback | None = None, **_ignored) -> None:
        self.rate_hz = rate_hz
        self.fail_connect = fail_connect
        self.stall_after = stall_after
        self.on_state, self.on_message, self.on_data = on_state, on_message, on_data
        self._connected = False
        self._streaming = threading.Event()
        self._thread: threading.Thread | None = None

    def connect(self) -> None:
        if self.fail_connect:
            raise ShimmerApiError("SIMULATED connection failure")
        self._connected = True
        if self.on_state:
            self.on_state("Connected")

    def is_connected(self) -> bool:
        return self._connected

    def state_string(self) -> str:
        return "Streaming" if self._streaming.is_set() else ("Connected" if self._connected else "None")

    def start_streaming(self) -> None:
        self._streaming.set()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        if self.on_state:
            self.on_state("Streaming")

    def _run(self) -> None:
        import math
        n = 0
        t0_dev = 0.0
        period = 1.0 / self.rate_hz
        next_t = time.perf_counter()
        while self._streaming.is_set():
            if self.stall_after is not None and n >= self.stall_after:
                time.sleep(0.05)
                continue
            now_unix = time.time() * 1000.0
            dev_ms = t0_dev + n * period * 1000.0
            gsr_k = 300.0 + 20.0 * math.sin(n / self.rate_hz)
            values = [now_unix, dev_ms, 2000 + n % 50, 1500.0 + (n % 50), 2500 + n % 30, gsr_k, 1000.0 / gsr_k]
            if self.on_data:
                self.on_data(dict(zip(self.SIGNALS, values)), now_unix, time.perf_counter() * 1000.0)
            n += 1
            next_t += period
            time.sleep(max(0.0, next_t - time.perf_counter()))

    def stop_streaming(self) -> None:
        self._streaming.clear()
        if self._thread:
            self._thread.join(timeout=2)

    def disconnect(self) -> None:
        self._connected = False

    def device_info(self) -> dict:
        return {"device_name": "SIMULATED", "com_port": None, "sampling_rate_hz": self.rate_hz, "simulated": True}


def default_output_name(simulated: bool) -> str:
    return "MOCK_raw_data.csv" if simulated else "raw_data.csv"


def ensure_dir(path: str | Path) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p
