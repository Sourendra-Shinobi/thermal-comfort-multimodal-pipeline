"""Shimmer acquisition via the Shimmer/shimmer_recorder.py subprocess.

The recorder runs in its own interpreter ([shimmer] python) because pythonnet
and the .NET runtime need not be installed where the controller runs.
Communication: JSON lines on the recorder's stdout, "start"/"stop" on stdin.
"""

from __future__ import annotations

import json
import queue
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from ..clock import iso_from_unix
from .base import AcquisitionAdapter, AcquisitionError, CheckResult

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class ShimmerAdapter(AcquisitionAdapter):
    modality = "shimmer"

    def __init__(self, cfg: dict[str, Any], python: str, recorder_script: Path, simulated: bool = False,
                 extra_args: list[str] | None = None, events=None) -> None:
        super().__init__(events)
        self.cfg = cfg
        self.python = python
        self.script = recorder_script
        self.simulated = simulated
        self.is_mock = simulated
        self.extra_args = extra_args or []
        self.proc: subprocess.Popen | None = None
        self.output_dir: Path | None = None
        self.messages: "queue.Queue[dict]" = queue.Queue()
        self.samples = 0
        self.last_progress_mono = 0.0
        self.last_sample_count_change = 0.0
        self.finalized: dict | None = None
        self.device_info: dict[str, Any] = {}
        self.info: dict[str, Any] = {"simulated": simulated, "mock": simulated}
        self._stderr_file = None

    # ── subprocess plumbing ─────────────────────────────────────────────────
    def _command(self, *extra: str) -> list[str]:
        cmd = [self.python, "-u", str(self.script),
               "--port", str(self.cfg.get("com_port", "COM10")),
               "--device-name", str(self.cfg.get("device_name", "A406")),
               "--confirm-samples", str(self.cfg.get("stream_confirm_min_samples", 10))]
        if self.cfg.get("api_dir"):
            cmd += ["--api-dir", str(self.cfg["api_dir"])]
        if self.cfg.get("ports_dll"):
            cmd += ["--ports-dll", str(self.cfg["ports_dll"])]
        if self.simulated:
            cmd += ["--simulate", "--simulate-rate", str(self.cfg.get("simulated_rate_hz", 128))]
        return cmd + self.extra_args + list(extra)

    def _spawn(self, cmd: list[str], stderr_path: Path | None) -> subprocess.Popen:
        stderr = subprocess.DEVNULL
        if stderr_path is not None:
            self._stderr_file = open(stderr_path, "a", encoding="utf-8")
            stderr = self._stderr_file
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr,
                                    text=True, encoding="utf-8", bufsize=1, creationflags=_NO_WINDOW)
        except OSError as exc:
            raise AcquisitionError(f"Cannot start Shimmer recorder ({cmd[0]}): {exc}") from exc
        threading.Thread(target=self._read_stdout, args=(proc,), name="shimmer-stdout", daemon=True).start()
        return proc

    def _read_stdout(self, proc: subprocess.Popen) -> None:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                msg = {"type": "stdout", "text": line}
            self._handle(msg)
            self.messages.put(msg)
        proc.stdout.close()
        self.messages.put({"type": "_exit", "returncode": proc.wait()})

    def _handle(self, msg: dict) -> None:
        kind = msg.get("type")
        if kind in ("progress", "streaming_confirmed"):
            n = int(msg.get("samples") or 0)
            now = time.monotonic()
            if n != self.samples:
                self.last_sample_count_change = now
            self.samples = n
            self.last_progress_mono = now
        elif kind == "connected":
            self.device_info = msg.get("device") or {}
        elif kind == "finalized":
            self.finalized = msg
        elif kind in ("error", "warning", "state", "api_message") and self.state not in ("IDLE",):
            status = {"error": "error", "warning": "warning"}.get(kind, "ok")
            self.events.log(f"GSR_RECORDER_{kind.upper()}", {k: v for k, v in msg.items() if k != "type"},
                            source="shimmer_recorder", status=status)

    def _wait_for(self, kinds: set[str], timeout: float) -> dict:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return {"type": "_timeout"}
            try:
                msg = self.messages.get(timeout=remaining)
            except queue.Empty:
                return {"type": "_timeout"}
            if msg.get("type") in kinds | {"error", "_exit"}:
                return msg

    def _send(self, command: str) -> None:
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.stdin.write(command + "\n")
                self.proc.stdin.flush()
            except OSError:
                pass

    # ── contract ────────────────────────────────────────────────────────────
    def preflight(self) -> CheckResult:
        if not self.script.is_file():
            return CheckResult("shimmer", False, f"recorder script not found: {self.script}")
        label = "SIMULATED shimmer" if self.simulated else f"Shimmer {self.cfg.get('device_name')} on {self.cfg.get('com_port')}"
        try:
            proc = subprocess.run(self._command("--check"), capture_output=True, text=True, encoding="utf-8",
                                  timeout=float(self.cfg.get("connect_timeout_s", 40)) + 10, creationflags=_NO_WINDOW)
        except subprocess.TimeoutExpired:
            return CheckResult("shimmer", False, f"{label}: connection check timed out")
        except OSError as exc:
            return CheckResult("shimmer", False, f"cannot run {self.python}: {exc}")
        msgs = []
        for line in proc.stdout.splitlines():
            try:
                msgs.append(json.loads(line))
            except ValueError:
                pass
        ok = next((m for m in msgs if m.get("type") == "check_ok"), None)
        if ok and proc.returncode == 0:
            dev = ok.get("device", {})
            return CheckResult("shimmer", True, f"{label}: connected and released "
                               f"(sampling rate reported: {dev.get('sampling_rate_hz')})", {"device": dev})
        err = next((m.get("message") for m in msgs if m.get("type") == "error"), None)
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        return CheckResult("shimmer", False, f"{label}: {err or 'check failed'}", {"returncode": proc.returncode, "stderr_tail": tail})

    def start(self) -> dict[str, Any]:
        assert self.output_dir is not None
        self.state = "CONNECTING"
        self.events.log("GSR_START_REQUESTED", {"simulated": self.simulated, "port": self.cfg.get("com_port")})
        self.proc = self._spawn(self._command("--output-dir", str(self.output_dir)), self.output_dir / "recorder_stderr.log")
        msg = self._wait_for({"connected"}, float(self.cfg.get("connect_timeout_s", 40)))
        if msg.get("type") != "connected":
            return self._fail_start(f"recorder did not connect: {msg.get('message') or msg.get('type')}")
        request_unix = time.time()
        self._send("start")
        self.state = "STARTING"
        msg = self._wait_for({"streaming_confirmed"}, float(self.cfg.get("stream_confirm_timeout_s", 15)))
        if msg.get("type") != "streaming_confirmed":
            return self._fail_start(f"no samples received after StartStreaming ({msg.get('message') or msg.get('type')})")
        self.state = "STREAMING"
        self.last_sample_count_change = time.monotonic()
        self.info.update(device=self.device_info, streaming_requested_wallclock=iso_from_unix(request_unix),
                         streaming_confirmed_wallclock=iso_from_unix(time.time()),
                         first_sample_host_wallclock=msg.get("first_sample_host_wallclock"))
        self.events.log("GSR_RECORDING_CONFIRMED", {"samples_at_confirmation": msg.get("samples"),
                                                    "first_sample_host_wallclock": msg.get("first_sample_host_wallclock"),
                                                    "simulated": self.simulated})
        return self.info

    def _fail_start(self, reason: str) -> dict:
        self.last_error = reason
        self.state = "ERROR"
        self.events.log("DEVICE_ERROR", {"device": "shimmer", "error": reason}, status="error")
        self._terminate()
        raise AcquisitionError(reason)

    def health(self) -> CheckResult:
        if self.proc is None or self.proc.poll() is not None:
            self.last_error = f"recorder process exited (code {self.proc.poll() if self.proc else None})"
            return CheckResult("shimmer", False, self.last_error)
        stall = float(self.cfg.get("stall_timeout_s", 5))
        idle = time.monotonic() - self.last_sample_count_change
        if idle > stall:
            self.last_error = f"no new samples for {idle:.1f} s (device disconnected or out of range?)"
            return CheckResult("shimmer", False, self.last_error, {"samples": self.samples})
        return CheckResult("shimmer", True, f"{self.samples} samples", {"samples": self.samples})

    def status_line(self) -> str:
        tag = "SIMULATED " if self.simulated else ""
        return f"{tag}{self.state} {self.samples:,} samples" if self.state == "STREAMING" else f"{tag}{self.state}"

    def stop(self) -> dict[str, Any]:
        self.events.log("GSR_STOP_REQUESTED", {"samples_so_far": self.samples})
        if self.proc is None:
            return self.info
        self._send("stop")
        msg = self._wait_for({"finalized"}, float(self.cfg.get("stop_timeout_s", 20)))
        while msg.get("type") == "error":  # stop-time errors are reported, then "finalized" follows
            msg = self._wait_for({"finalized"}, float(self.cfg.get("stop_timeout_s", 20)))
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        final = self.finalized
        if final is None:
            self.last_error = f"recorder did not finalize ({msg.get('type')})"
            self.events.log("DEVICE_ERROR", {"device": "shimmer", "error": self.last_error}, status="error")
            self._terminate()
            self.state = "ERROR"
        else:
            self.state = "STOPPED" if final.get("samples") else "ERROR"
        self.info.update(finalized=final, returncode=self.proc.poll(), verification=self._verify(final))
        self.events.log("GSR_RECORDING_STOPPED", {"samples": (final or {}).get("samples"), "file": (final or {}).get("file"),
                                                  "verified": self.info["verification"]["ok"]},
                        status="ok" if self.info["verification"]["ok"] else "error")
        self._close_stderr()
        return self.info

    def _verify(self, final: dict | None) -> dict[str, Any]:
        if not final or not final.get("file"):
            return {"ok": False, "reason": "no data file produced"}
        path = Path(final["file"])
        if not path.is_file():
            return {"ok": False, "reason": f"{path} missing"}
        with open(path, encoding="utf-8") as fh:
            rows = sum(1 for _ in fh) - 1
        meta_ok = bool(final.get("metadata_file")) and Path(final["metadata_file"]).is_file()
        ok = rows > 0 and rows == final.get("samples") and meta_ok
        return {"ok": ok, "path": str(path), "rows": rows, "reported_samples": final.get("samples"), "metadata_file": final.get("metadata_file"),
                **({} if ok else {"reason": "row count mismatch or metadata missing"})}

    def _terminate(self) -> None:
        if self.proc and self.proc.poll() is None:
            self._send("stop")
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self._close_stderr()

    def _close_stderr(self) -> None:
        if self._stderr_file:
            self._stderr_file.close()
            self._stderr_file = None

    def close(self) -> None:
        self._terminate()
        if self.proc and self.proc.stdin and not self.proc.stdin.closed:
            try:
                self.proc.stdin.close()
            except OSError:
                pass
