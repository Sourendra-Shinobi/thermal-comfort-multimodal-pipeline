"""Shimmer recorder: one acquisition, all channels, raw values preserved.

Run by the experiment controller as a subprocess, or by hand.

Protocol (controller mode): one JSON object per stdout line.
    {"type": "connected", "device": {...}}       device connected, idle
    {"type": "streaming_requested"}
    {"type": "streaming_confirmed", "samples": N} >= --confirm-samples received
    {"type": "progress", "samples": N, "last_host_unix_ms": ...}   every second
    {"type": "state" | "api_message" | "warning" | "error", ...}
    {"type": "finalized", "file": ..., "samples": N, "metadata_file": ...}
    {"type": "check_ok", "device": {...}}        (--check only)
stdin commands: "start", "stop". EOF on stdin is treated as "stop", so the
file is finalised even if the controller dies.

Stand-alone examples (run from BTP_2026/):
    python Shimmer/shimmer_recorder.py --check --port COM10
    python Shimmer/shimmer_recorder.py --port COM10 --output-dir Shimmer/recordings/test1 --duration 30

Output in --output-dir:
    raw_data.csv           (MOCK_raw_data.csv when --simulate)
    shimmer_metadata.json
Never overwrites an existing file.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import statistics
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shimmer_api import (  # noqa: E402
    ShimmerApiError,
    ShimmerDevice,
    SimulatedShimmerDevice,
    default_output_name,
    ensure_dir,
)

_emit_lock = threading.Lock()


def emit(kind: str, **fields) -> None:
    with _emit_lock:
        sys.stdout.write(json.dumps({"type": kind, "t_unix_ms": round(time.time() * 1000.0, 3), **fields}, default=str) + "\n")
        sys.stdout.flush()


def iso(unix_ms: float | None) -> str | None:
    if unix_ms is None:
        return None
    return datetime.fromtimestamp(unix_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def column_name(signal: tuple[str, str, str]) -> str:
    slug = lambda s: re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")  # noqa: E731
    name, fmt, unit = signal
    return f"{slug(name)}__{slug(fmt)}__{slug(unit) or 'none'}"


class Recorder:
    HOST_COLUMNS = ["sample_index", "host_unix_ms", "host_monotonic_ms"]

    def __init__(self, output_dir: Path, simulated: bool) -> None:
        self.output_dir = ensure_dir(output_dir)
        self.simulated = simulated
        self.path = self.output_dir / default_output_name(simulated)
        if self.path.exists():
            raise FileExistsError(f"{self.path} already exists; refusing to overwrite")
        self.lock = threading.Lock()
        self.file = None
        self.writer = None
        self.signals: list[tuple[str, str, str]] = []
        self.samples = 0
        self.unexpected_signals: set = set()
        self.first_host_ms = self.last_host_ms = None
        self.device_ts: list[float] = []  # device "Timestamp" (ms), thinned for rate estimation
        self.first_device_ms = self.last_device_ms = None
        self.callback_errors = 0

    def on_data(self, signals: dict, host_unix_ms: float, host_mono_ms: float) -> None:
        with self.lock:
            if self.writer is None:
                self.signals = list(signals.keys())
                self.file = open(self.path, "x", newline="", encoding="utf-8")
                self.writer = csv.writer(self.file)
                self.writer.writerow(self.HOST_COLUMNS + [column_name(s) for s in self.signals])
            extra = set(signals) - set(self.signals)
            if extra - self.unexpected_signals:
                self.unexpected_signals |= extra
                emit("warning", message="signals not present in first packet are not recorded", signals=sorted(map(str, extra)))
            self.writer.writerow([self.samples, f"{host_unix_ms:.3f}", f"{host_mono_ms:.3f}"]
                                 + [signals.get(s, "") for s in self.signals])
            self.samples += 1
            if self.samples % 64 == 0:
                self.file.flush()
            self.first_host_ms = self.first_host_ms if self.first_host_ms is not None else host_unix_ms
            self.last_host_ms = host_unix_ms
            dev = signals.get(("Timestamp", "CAL", "mSecs"))
            if dev is not None:
                self.first_device_ms = self.first_device_ms if self.first_device_ms is not None else dev
                self.last_device_ms = dev
                if len(self.device_ts) < 20000:
                    self.device_ts.append(dev)

    def close(self) -> None:
        with self.lock:
            if self.file is not None:
                self.file.flush()
                os.fsync(self.file.fileno())
                self.file.close()
                self.file = None

    def summary(self) -> dict:
        diffs = [b - a for a, b in zip(self.device_ts, self.device_ts[1:]) if b > a]
        median_dt = statistics.median(diffs) if diffs else None
        host_span = (self.last_host_ms - self.first_host_ms) / 1000.0 if self.samples > 1 else None
        return {
            "file": self.path.name if self.samples else None,
            "simulated": self.simulated,
            "sample_count": self.samples,
            "channels": [
                {"column": column_name(s), "name": s[0], "format": s[1], "unit": s[2]} for s in self.signals
            ],
            "host_columns": {
                "sample_index": "0-based packet counter assigned by this recorder",
                "host_unix_ms": "PC system clock (ms since Unix epoch, UTC) when the API callback ran in this process",
                "host_monotonic_ms": "time.perf_counter() in this recorder process (ms); only for intervals",
            },
            "native_timestamps": {
                "system_timestamp__cal__msecs": "'System Timestamp' produced by ShimmerAPI on the PC (ms). Verify its epoch on hardware.",
                "timestamp__cal__msecs": "'Timestamp' derived from the device's own clock (ms)",
            },
            "first_sample_host_wallclock": iso(self.first_host_ms),
            "last_sample_host_wallclock": iso(self.last_host_ms),
            "host_span_s": host_span,
            "device_timestamp_span_s": ((self.last_device_ms - self.first_device_ms) / 1000.0
                                        if self.first_device_ms is not None and self.samples > 1 else None),
            "estimated_rate_from_device_timestamps_hz": (1000.0 / median_dt) if median_dt else None,
            "estimated_rate_from_host_clock_hz": ((self.samples - 1) / host_span) if host_span else None,
            "unexpected_signals_not_recorded": sorted(map(str, self.unexpected_signals)),
            "callback_errors": self.callback_errors,
        }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", default="COM10", help="Bluetooth serial port of the Shimmer (default COM10)")
    ap.add_argument("--device-name", default="A406", help="Device name passed to the API (default A406)")
    ap.add_argument("--api-dir", default=None, help="Folder with ShimmerAPI.dll (else SHIMMER_API_DIR / legacy path)")
    ap.add_argument("--ports-dll", default=None, help="System.IO.Ports.dll path (else SHIMMER_PORTS_DLL / legacy path)")
    ap.add_argument("--output-dir", default=None, help="Folder for raw_data.csv + shimmer_metadata.json")
    ap.add_argument("--check", action="store_true", help="Connect, report, disconnect. No recording.")
    ap.add_argument("--duration", type=float, default=None, help="Record this many seconds without waiting for stdin")
    ap.add_argument("--confirm-samples", type=int, default=10)
    ap.add_argument("--simulate", action="store_true", help="SIMULATED device (tests only). Writes MOCK_raw_data.csv")
    ap.add_argument("--simulate-rate", type=float, default=128.0)
    ap.add_argument("--simulate-fail-connect", action="store_true")
    ap.add_argument("--simulate-stall-after", type=int, default=None, help="Stop delivering samples after N (disconnect test)")
    args = ap.parse_args(argv)

    if not args.check and not args.output_dir:
        ap.error("--output-dir is required unless --check is given")

    recorder = None if args.check else Recorder(Path(args.output_dir), args.simulate)
    errors: list[str] = []

    def on_callback_error(msg: str) -> None:
        if recorder is not None:
            recorder.callback_errors += 1
            if recorder.callback_errors <= 5:
                emit("warning", message=f"callback error: {msg}")

    hooks = dict(
        on_state=lambda s: emit("state", state=s),
        on_message=lambda m: emit("api_message", message=m),
        on_data=recorder.on_data if recorder else None,
        on_callback_error=on_callback_error,
    )
    if args.simulate:
        device = SimulatedShimmerDevice(args.simulate_rate, args.simulate_fail_connect, args.simulate_stall_after, **hooks)
    else:
        device = ShimmerDevice(args.device_name, args.port, args.api_dir, args.ports_dll, **hooks)
    emit("starting", simulated=args.simulate, port=None if args.simulate else args.port, pid=os.getpid())

    try:
        device.connect()
        if not device.is_connected():
            raise ShimmerApiError("Connect() returned but IsConnected() is False; see api_message lines")
    except Exception as exc:
        emit("error", stage="connect", message=str(exc))
        return 2
    info = device.device_info()
    emit("connected", device=info)

    if args.check:
        try:
            device.disconnect()
        finally:
            emit("check_ok", device=info)
        return 0

    stop_event = threading.Event()
    start_event = threading.Event()

    def read_stdin() -> None:
        for line in sys.stdin:
            cmd = line.strip().lower()
            if cmd == "start":
                start_event.set()
            elif cmd == "stop":
                stop_event.set()
                start_event.set()
                return
        stop_event.set()  # EOF: controller gone -> finish cleanly
        start_event.set()

    if args.duration is None:
        threading.Thread(target=read_stdin, daemon=True).start()
        start_event.wait()
    if stop_event.is_set():
        device.disconnect()
        emit("finalized", file=None, samples=0, note="stopped before streaming started")
        return 3

    started = time.monotonic()
    streaming_unix_ms = time.time() * 1000.0
    try:
        device.start_streaming()
        emit("streaming_requested")
        confirmed = False
        while not stop_event.is_set():
            time.sleep(0.25 if not confirmed else 1.0)
            n = recorder.samples
            if not confirmed and n >= args.confirm_samples:
                confirmed = True
                emit("streaming_confirmed", samples=n, first_sample_host_wallclock=iso(recorder.first_host_ms))
            if confirmed:
                emit("progress", samples=n, last_host_unix_ms=recorder.last_host_ms, state=device.state_string())
            if args.duration is not None and time.monotonic() - started >= args.duration:
                break
    except Exception as exc:
        errors.append(str(exc))
        emit("error", stage="streaming", message=str(exc))
    finally:
        stop_unix_ms = time.time() * 1000.0
        for step in (device.stop_streaming, device.disconnect):
            try:
                step()
            except Exception as exc:
                errors.append(f"{step.__name__}: {exc}")
                emit("error", stage=step.__name__, message=str(exc))
        recorder.close()
        meta = {
            "recorder": "Shimmer/shimmer_recorder.py",
            "device": info,
            "streaming_requested_wallclock": iso(streaming_unix_ms),
            "stop_requested_wallclock": iso(stop_unix_ms),
            "errors": errors,
            **recorder.summary(),
        }
        meta_path = Path(args.output_dir) / ("MOCK_shimmer_metadata.json" if args.simulate else "shimmer_metadata.json")
        with open(meta_path, "x", encoding="utf-8") as fh:
            json.dump(meta, fh, indent=2)
        emit("finalized", file=str(recorder.path) if recorder.samples else None, samples=recorder.samples,
             metadata_file=str(meta_path), errors=errors)
    return 0 if recorder.samples > 0 and not errors else 4


if __name__ == "__main__":
    sys.exit(main())
