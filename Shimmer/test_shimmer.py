"""Baseline Shimmer recording (original stand-alone workflow).

Connects to the Shimmer (default A406 on COM10), streams for 30 seconds and
saves the 7 columns below to shimmer_readings.csv next to this script.

Changes from the original version (2026-10-28):
  * DLL loading moved to shimmer_api.py (same calls, same default paths);
    paths can now come from --api-dir/--ports-dll or SHIMMER_API_DIR/SHIMMER_PORTS_DLL.
  * Optional --port, --device-name, --duration, --output arguments.
  * An existing shimmer_readings.csv is no longer overwritten; a timestamped
    name is used instead.
For session recordings with all channels use shimmer_recorder.py (or the
experiment controller), not this script.
"""

import argparse
import csv
import os
import sys
import threading
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shimmer_api import ShimmerDevice  # noqa: E402

DURATION_SECONDS = 30

columns = [
    "system_timestamp_ms",
    "device_timestamp_ms",
    "ppg_a1_raw",
    "ppg_a1_mV",
    "gsr_raw",
    "gsr_resistance_kOhms",
    "gsr_conductance_uSiemens",
]

# column -> (signal name, format, unit), as in the original script
SIGNAL_MAP = {
    "system_timestamp_ms": ("System Timestamp", "CAL", "mSecs"),
    "device_timestamp_ms": ("Timestamp", "CAL", "mSecs"),
    "ppg_a1_raw": ("Internal ADC A1", "RAW", "no units"),
    "ppg_a1_mV": ("Internal ADC A1", "CAL", "mVolts"),
    "gsr_raw": ("GSR", "RAW", "no units"),
    "gsr_resistance_kOhms": ("GSR", "CAL", "kOhms"),
    "gsr_conductance_uSiemens": ("GSR Conductance", "CAL", "uSiemens"),
}


def output_path(requested):
    if requested:
        return requested
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shimmer_readings.csv")
    if os.path.exists(path):
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = path.replace(".csv", f"_{stamp}.csv")
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description="30-second baseline Shimmer recording (7 columns).")
    ap.add_argument("--port", default="COM10")
    ap.add_argument("--device-name", default="A406")
    ap.add_argument("--duration", type=float, default=DURATION_SECONDS)
    ap.add_argument("--output", default=None, help="CSV path (default: Shimmer/shimmer_readings.csv)")
    ap.add_argument("--api-dir", default=None)
    ap.add_argument("--ports-dll", default=None)
    args = ap.parse_args(argv)

    csv_path = output_path(args.output)
    if os.path.exists(csv_path):
        sys.exit(f"Refusing to overwrite existing file: {csv_path}")

    csv_file = open(csv_path, "x", newline="", encoding="utf-8")
    writer = csv.DictWriter(csv_file, fieldnames=columns)
    writer.writeheader()

    write_lock = threading.Lock()
    state = {"count": 0, "first": True, "error_printed": False}

    def on_data(signals, _host_unix_ms, _host_mono_ms):
        row = {col: signals.get(sig, "") for col, sig in SIGNAL_MAP.items()}
        with write_lock:
            writer.writerow(row)
            state["count"] += 1
            current_count = state["count"]
            csv_file.flush()
        if state["first"]:
            state["first"] = False
            print("\nFirst recorded sample:")
            print(row, flush=True)
        if current_count % 256 == 0:
            print(f"[DATA] {current_count} packets saved", flush=True)

    def on_error(msg):
        if not state["error_printed"]:
            state["error_printed"] = True
            print(f"[CALLBACK ERROR] {msg}", flush=True)

    shimmer = ShimmerDevice(
        args.device_name, args.port, args.api_dir, args.ports_dll,
        on_state=lambda s: print(f"[STATE] {s}", flush=True),
        on_message=lambda m: print(f"[API MESSAGE] {m}", flush=True),
        on_data=on_data,
        on_callback_error=on_error,
    )

    try:
        print(f"Connecting to {args.device_name} on {args.port}...")
        shimmer.connect()

        if not shimmer.is_connected():
            raise RuntimeError("Shimmer connection failed; see API messages above.")

        print("Connected successfully.")
        print(f"Saving CSV to: {csv_path}")

        time.sleep(1)

        print(f"\nRecording for {args.duration:g} seconds...")
        shimmer.start_streaming()

        time.sleep(args.duration)

    finally:
        try:
            shimmer.stop_streaming()
        except Exception as exc:
            print("Error stopping stream:", exc)

        try:
            shimmer.disconnect()
        except Exception as exc:
            print("Error disconnecting:", exc)

        with write_lock:
            csv_file.flush()
            csv_file.close()

        print(f"\nPackets saved: {state['count']}")
        print(f"CSV saved: {csv_path}")


if __name__ == "__main__":
    main()
