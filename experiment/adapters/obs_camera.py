"""RGB camera recording through OBS Studio (obs-websocket protocol v5).

OBS owns the Logitech camera (a "Video Capture Device" source) and writes the
video file; this adapter only drives OBS and verifies what it reports.
Requests used: GetVersion, GetRecordStatus, StartRecord, StopRecord,
GetRecordDirectory, SetRecordDirectory (>= 5.3), GetInputList, GetSourceActive.
"""

from __future__ import annotations

import base64
import hashlib
import itertools
import json
import socket
import threading
import time
from pathlib import Path
from typing import Any, Callable

from ..clock import iso_from_unix
from ..session import write_json_atomic
from .base import AcquisitionAdapter, AcquisitionError, CheckResult
from .ws_client import WebSocketClient, WebSocketClosed

EVENT_SUB_OUTPUTS = 1 << 6
VIDEO_CAPTURE_KINDS = ("dshow_input", "av_capture_input", "v4l2_input")


class OBSError(RuntimeError):
    pass


def obs_auth_string(password: str, salt: str, challenge: str) -> str:
    secret = base64.b64encode(hashlib.sha256((password + salt).encode()).digest()).decode()
    return base64.b64encode(hashlib.sha256((secret + challenge).encode()).digest()).decode()


class OBSClient:
    def __init__(self, host: str, port: int, password: str = "", timeout: float = 5.0) -> None:
        self.ws = WebSocketClient(host, port, timeout=timeout)
        self.password = password
        self.timeout = timeout
        self._ids = itertools.count(1)
        self._pending: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._event_cond = threading.Condition()
        self._events: list[tuple[float, dict]] = []
        self._reader: threading.Thread | None = None
        self.closed_reason: str | None = None
        self.hello: dict[str, Any] = {}

    def connect(self) -> None:
        try:
            self.ws.connect()
            hello = json.loads(self.ws.recv_text(self.timeout))
        except (OSError, WebSocketClosed, ValueError) as exc:
            self.ws.close()
            raise OBSError(f"Cannot connect to OBS WebSocket at {self.ws.host}:{self.ws.port}: {exc}") from exc
        if hello.get("op") != 0:
            raise OBSError(f"Unexpected first message from OBS: {hello}")
        self.hello = hello.get("d", {})
        identify: dict[str, Any] = {"rpcVersion": 1, "eventSubscriptions": EVENT_SUB_OUTPUTS}
        auth = self.hello.get("authentication")
        if auth:
            if not self.password:
                self.ws.close()
                raise OBSError("OBS WebSocket requires a password; set [obs] password or OBS_WEBSOCKET_PASSWORD")
            identify["authentication"] = obs_auth_string(self.password, auth["salt"], auth["challenge"])
        try:
            self.ws.send_text(json.dumps({"op": 1, "d": identify}))
            reply = json.loads(self.ws.recv_text(self.timeout))
        except WebSocketClosed as exc:
            raise OBSError(f"OBS rejected identification (wrong password?): {exc}") from exc
        except (OSError, ValueError) as exc:
            raise OBSError(f"OBS identification failed: {exc}") from exc
        if reply.get("op") != 2:
            raise OBSError(f"OBS identification failed: {reply}")
        self._reader = threading.Thread(target=self._read_loop, name="obs-ws-reader", daemon=True)
        self._reader.start()

    @property
    def connected(self) -> bool:
        return self.ws.connected and self.closed_reason is None

    def close(self) -> None:
        self.closed_reason = self.closed_reason or "closed by client"
        self.ws.close()

    def request(self, request_type: str, data: dict | None = None, timeout: float | None = None) -> dict[str, Any]:
        if not self.connected:
            raise OBSError(f"OBS not connected ({self.closed_reason})")
        rid = f"r{next(self._ids)}"
        slot: dict[str, Any] = {"event": threading.Event(), "response": None}
        with self._lock:
            self._pending[rid] = slot
        msg = {"op": 6, "d": {"requestType": request_type, "requestId": rid}}
        if data:
            msg["d"]["requestData"] = data
        try:
            self.ws.send_text(json.dumps(msg))
        except OSError as exc:
            raise OBSError(f"{request_type}: send failed: {exc}") from exc
        if not slot["event"].wait(timeout or self.timeout):
            with self._lock:
                self._pending.pop(rid, None)
            raise OBSError(f"{request_type}: no response within {timeout or self.timeout}s")
        resp = slot["response"]
        if resp is None:
            raise OBSError(f"{request_type}: connection lost ({self.closed_reason})")
        status = resp.get("requestStatus", {})
        if not status.get("result"):
            raise OBSError(f"{request_type} failed: code={status.get('code')} {status.get('comment', '')}".strip())
        return resp.get("responseData") or {}

    def wait_for_event(self, event_type: str, predicate: Callable[[dict], bool], since: float, timeout: float) -> dict | None:
        deadline = time.monotonic() + timeout
        with self._event_cond:
            while True:
                for t, ev in self._events:
                    if t >= since and ev.get("eventType") == event_type and predicate(ev.get("eventData") or {}):
                        return ev.get("eventData") or {}
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not self.connected:
                    return None
                self._event_cond.wait(min(remaining, 0.5))

    def _read_loop(self) -> None:
        while True:
            try:
                text = self.ws.recv_text(timeout=1.0)
            except socket.timeout:
                continue
            except (WebSocketClosed, OSError) as exc:
                self.closed_reason = str(exc) or exc.__class__.__name__
                break
            try:
                msg = json.loads(text)
            except ValueError:
                continue
            op, d = msg.get("op"), msg.get("d", {})
            if op == 7:
                with self._lock:
                    slot = self._pending.pop(d.get("requestId"), None)
                if slot:
                    slot["response"] = d
                    slot["event"].set()
            elif op == 5:
                with self._event_cond:
                    self._events.append((time.monotonic(), d))
                    del self._events[:-200]
                    self._event_cond.notify_all()
        with self._lock:
            for slot in self._pending.values():
                slot["event"].set()
            self._pending.clear()
        with self._event_cond:
            self._event_cond.notify_all()


def probe_video(path: Path) -> dict[str, Any]:
    """Open the file with OpenCV if available. Absence of cv2 is reported, not hidden."""
    info: dict[str, Any] = {"probed_with": None}
    try:
        import cv2  # type: ignore
    except ImportError:
        info["note"] = "opencv not installed in controller interpreter; file not decoded"
        return info
    cap = cv2.VideoCapture(str(path))
    info["probed_with"] = f"opencv {cv2.__version__}"
    info["opened"] = bool(cap.isOpened())
    if cap.isOpened():
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ok, _ = cap.read()
        info.update(
            fps=fps, frame_count=frames,
            width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            duration_s=(frames / fps) if fps > 0 and frames > 0 else None,
            first_frame_decoded=bool(ok),
        )
    cap.release()
    return info


def wait_file_stable(path: Path, timeout: float, settle: float = 1.0) -> tuple[bool, int]:
    deadline = time.monotonic() + timeout
    last, stable_since = -1, None
    while time.monotonic() < deadline:
        size = path.stat().st_size if path.is_file() else -1
        if size > 0 and size == last:
            stable_since = stable_since or time.monotonic()
            if time.monotonic() - stable_since >= settle:
                return True, size
        else:
            stable_since = None
        last = size
        time.sleep(0.25)
    return False, max(last, 0)


class OBSCameraAdapter(AcquisitionAdapter):
    modality = "camera"

    def __init__(self, cfg: dict[str, Any], password: str, events=None) -> None:
        super().__init__(events)
        self.cfg = cfg
        self.password = password
        self.client: OBSClient | None = None
        self.output_dir: Path | None = None
        self.original_record_dir: str | None = None
        self.record_dir_changed = False
        self.info: dict[str, Any] = {"device": "OBS Studio (obs-websocket v5)", "mock": False}
        self._last_bytes = -1
        self._last_bytes_change = 0.0
        self._lock = threading.Lock()

    # ── helpers ─────────────────────────────────────────────────────────────
    def _connect(self) -> OBSClient:
        if self.client and self.client.connected:
            return self.client
        client = OBSClient(self.cfg.get("host", "127.0.0.1"), int(self.cfg.get("port", 4455)),
                           self.password, float(self.cfg.get("connect_timeout_s", 5)))
        client.connect()
        self.client = client
        return client

    def _video_inputs(self, client: OBSClient) -> list[dict[str, Any]]:
        inputs = client.request("GetInputList").get("inputs", [])
        wanted = self.cfg.get("video_input_name") or ""
        found = []
        for inp in inputs:
            kind = inp.get("unversionedInputKind") or inp.get("inputKind") or ""
            if (wanted and inp.get("inputName") == wanted) or (not wanted and kind in VIDEO_CAPTURE_KINDS):
                try:
                    active = client.request("GetSourceActive", {"sourceName": inp["inputName"]})
                except OBSError as exc:
                    active = {"error": str(exc)}
                found.append({"name": inp.get("inputName"), "kind": kind,
                              "video_active": active.get("videoActive"), "video_showing": active.get("videoShowing")})
        return found

    # ── contract ────────────────────────────────────────────────────────────
    def preflight(self) -> CheckResult:
        try:
            client = self._connect()
            version = client.request("GetVersion")
            status = client.request("GetRecordStatus")
            record_dir = client.request("GetRecordDirectory").get("recordDirectory")
            inputs = self._video_inputs(client)
        except OBSError as exc:
            self.last_error = str(exc)
            return CheckResult("camera/obs", False, str(exc))
        details = {
            "obs_version": version.get("obsVersion"),
            "obs_websocket_version": version.get("obsWebSocketVersion"),
            "supports_set_record_directory": "SetRecordDirectory" in version.get("availableRequests", []),
            "record_directory": record_dir,
            "video_inputs": inputs,
        }
        self.info.update(obs_version=details["obs_version"], obs_websocket_version=details["obs_websocket_version"])
        if status.get("outputActive"):
            return CheckResult("camera/obs", False, "OBS is already recording; stop that recording first.", details)
        active = [i for i in inputs if i.get("video_active")]
        if self.cfg.get("require_video_capture_input", True) and not active:
            what = f"source {self.cfg.get('video_input_name')!r}" if self.cfg.get("video_input_name") else "Video Capture Device source"
            return CheckResult("camera/obs", False,
                               f"OBS reachable but no active {what} in the current scene (camera unplugged or not added?).", details)
        names = ", ".join(i["name"] for i in active) or "none required"
        return CheckResult("camera/obs", True, f"OBS {details['obs_version']} connected; idle; video input(s): {names}", details)

    def start(self) -> dict[str, Any]:
        client = self._connect()
        assert self.output_dir is not None
        version = client.request("GetVersion")
        self.original_record_dir = client.request("GetRecordDirectory").get("recordDirectory")
        target_dir = self.original_record_dir
        if self.cfg.get("set_record_directory", True):
            if "SetRecordDirectory" in version.get("availableRequests", []):
                client.request("SetRecordDirectory", {"recordDirectory": str(self.output_dir)})
                self.record_dir_changed = True
                target_dir = str(self.output_dir)
            else:
                self.events.log("CAMERA_WARNING", {"message": "OBS lacks SetRecordDirectory (< v5.3); recording goes to OBS default directory",
                                                   "record_directory": self.original_record_dir}, status="warning")
        self.info.update(record_directory=target_dir, original_record_directory=self.original_record_dir)

        request_unix = time.time()
        self.events.log("CAMERA_START_REQUESTED", {"record_directory": target_dir})
        since = time.monotonic()
        try:
            client.request("StartRecord")
        except OBSError as exc:
            self._restore_dir()
            raise AcquisitionError(f"OBS StartRecord failed: {exc}") from exc

        deadline = time.monotonic() + float(self.cfg.get("start_confirm_timeout_s", 10))
        status: dict[str, Any] = {}
        while time.monotonic() < deadline:
            status = client.request("GetRecordStatus")
            if status.get("outputActive") and int(status.get("outputBytes") or 0) > 0:
                break
            time.sleep(0.2)
        else:
            self.last_error = f"OBS did not confirm recording within timeout (last status {status})"
            self.events.log("DEVICE_ERROR", {"device": "camera", "error": self.last_error}, status="error")
            try:
                client.request("StopRecord")
            except OBSError:
                pass
            self._restore_dir()
            raise AcquisitionError(self.last_error)
        confirm_unix = time.time()
        started = client.wait_for_event("RecordStateChanged", lambda d: d.get("outputState") == "OBS_WEBSOCKET_OUTPUT_STARTED", since, 0.5)
        est_start = confirm_unix - float(status.get("outputDuration") or 0) / 1000.0
        self.state = "RECORDING"
        self._last_bytes, self._last_bytes_change = int(status.get("outputBytes") or 0), time.monotonic()
        self.info.update(
            start_requested_wallclock=iso_from_unix(request_unix),
            start_confirmed_wallclock=iso_from_unix(confirm_unix),
            estimated_recording_start_wallclock=iso_from_unix(est_start),
            estimated_recording_start_unix_s=est_start,
            estimated_start_uncertainty_s=round(confirm_unix - request_unix, 3),
            output_path_reported_at_start=(started or {}).get("outputPath"),
        )
        self.events.log("CAMERA_RECORDING_CONFIRMED", {
            "output_active": True, "output_bytes": status.get("outputBytes"),
            "output_duration_ms": status.get("outputDuration"), "estimated_recording_start": self.info["estimated_recording_start_wallclock"],
        })
        return self.info

    def health(self) -> CheckResult:
        with self._lock:
            try:
                status = self._connect().request("GetRecordStatus")
            except OBSError as exc:
                self.last_error = str(exc)
                return CheckResult("camera", False, f"OBS unreachable: {exc}")
            if not status.get("outputActive"):
                self.last_error = "OBS reports recording is NOT active"
                return CheckResult("camera", False, self.last_error, status)
            b = int(status.get("outputBytes") or 0)
            if b != self._last_bytes:
                self._last_bytes, self._last_bytes_change = b, time.monotonic()
            elif time.monotonic() - self._last_bytes_change > 10:
                self.last_error = "OBS output bytes not increasing for >10 s"
                return CheckResult("camera", False, self.last_error, status)
            self.info["last_status"] = status
            return CheckResult("camera", True, f"recording {status.get('outputTimecode', '')} {b / 1e6:.1f} MB", status)

    def status_line(self) -> str:
        st = self.info.get("last_status") or {}
        if self.state == "RECORDING" and st:
            return f"RECORDING {st.get('outputTimecode', '')} {int(st.get('outputBytes') or 0) / 1e6:.0f} MB"
        return self.state

    def stop(self) -> dict[str, Any]:
        stop_unix = time.time()
        self.events.log("CAMERA_STOP_REQUESTED", {})
        output_path = None
        try:
            client = self._connect()
            since = time.monotonic()
            final = client.request("GetRecordStatus")
            self.info["final_output_duration_ms"] = final.get("outputDuration")
            resp = client.request("StopRecord", timeout=float(self.cfg.get("stop_confirm_timeout_s", 30)))
            output_path = resp.get("outputPath")
            ev = client.wait_for_event("RecordStateChanged", lambda d: d.get("outputState") == "OBS_WEBSOCKET_OUTPUT_STOPPED",
                                       since, float(self.cfg.get("stop_confirm_timeout_s", 30)))
            output_path = output_path or (ev or {}).get("outputPath")
            status = client.request("GetRecordStatus")
            if status.get("outputActive"):
                raise AcquisitionError("OBS still reports recording active after StopRecord")
        except OBSError as exc:
            self.last_error = f"StopRecord failed: {exc}"
            self.state = "ERROR"
            self.events.log("DEVICE_ERROR", {"device": "camera", "error": self.last_error}, status="error")
        finally:
            self._restore_dir()
        self.info["stop_requested_wallclock"] = iso_from_unix(stop_unix)
        self.info["output_path"] = output_path
        verification = self._verify(output_path)
        self.info["verification"] = verification
        if self.state != "ERROR":
            self.state = "STOPPED"
        self.events.log("CAMERA_RECORDING_STOPPED", {"output_path": output_path, "verified": verification.get("ok")},
                        status="ok" if verification.get("ok") else "error")
        if self.output_dir is not None:
            write_json_atomic(self.output_dir / "camera_metadata.json", self.info)
        return self.info

    def _verify(self, output_path: str | None) -> dict[str, Any]:
        if not output_path:
            return {"ok": False, "reason": "OBS did not report an output path"}
        path = Path(output_path)
        stable, size = wait_file_stable(path, timeout=float(self.cfg.get("stop_confirm_timeout_s", 30)))
        result: dict[str, Any] = {"path": str(path), "exists": path.is_file(), "size_bytes": size, "size_stable": stable}
        if self.output_dir is not None:
            try:
                result["inside_session_folder"] = path.resolve().is_relative_to(self.output_dir.resolve())
            except OSError:
                result["inside_session_folder"] = False
        if path.is_file():
            result["probe"] = probe_video(path)
        probe = result.get("probe", {})
        # Without opencv the file is not decoded (reported in probe.note); with it, it must decode.
        probe_ok = probe.get("probed_with") is None or bool(probe.get("first_frame_decoded"))
        result["ok"] = bool(path.is_file() and size > 0 and stable and probe_ok)
        if not result["ok"]:
            result["reason"] = "file missing, empty, still growing, or not decodable"
        return result

    def _restore_dir(self) -> None:
        if not self.record_dir_changed or self.original_record_dir is None:
            return
        try:
            self._connect().request("SetRecordDirectory", {"recordDirectory": self.original_record_dir})
            self.record_dir_changed = False
        except OBSError as exc:
            self.events.log("CAMERA_WARNING", {"message": f"could not restore OBS record directory to {self.original_record_dir}: {exc}"},
                            status="warning")

    def close(self) -> None:
        self._restore_dir()
        if self.client:
            self.client.close()
            self.client = None
