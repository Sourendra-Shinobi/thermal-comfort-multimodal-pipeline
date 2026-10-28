"""Test doubles: a protocol-level fake OBS (obs-websocket v5) and a scripted game client.

The fake OBS speaks real WebSocket frames and the real v5 JSON messages
(Hello/Identify/Identified, Request/RequestResponse, Event) so the production
OBS client and camera adapter are exercised unchanged. It writes a small,
growing file to stand in for the video. It is NOT a substitute for testing
with real OBS (docs/CAMERA_TESTING.md).
"""

from __future__ import annotations

import base64
import csv
import hashlib
import json
import os
import socket
import struct
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

from experiment.adapters.obs_camera import obs_auth_string
from experiment.config import PROJECT_ROOT, Config

_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class _FakeVideo:
    """Grey frames via OpenCV (decodable), or plain bytes when opencv is absent."""

    def __init__(self, path: str, corrupt: bool = False) -> None:
        try:
            if corrupt:
                raise ImportError
            import cv2
            import numpy as np
            self._np = np
            self._w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 20.0, (64, 48))
            self._raw = None
        except ImportError:
            self._w = None
            self._raw = open(path, "wb")

    def write_frame(self) -> None:
        if self._w is not None:
            self._w.write(self._np.full((48, 64, 3), 128, self._np.uint8))
        else:
            self._raw.write(b"\0" * 2048)
            self._raw.flush()

    def close(self) -> None:
        if self._w is not None:
            self._w.release()
        else:
            self._raw.close()


def _send_frame(conn: socket.socket, opcode: int, payload: bytes) -> None:
    header = bytearray([0x80 | opcode])
    n = len(payload)
    if n < 126:
        header.append(n)
    elif n < 65536:
        header += bytes([126]) + struct.pack("!H", n)
    else:
        header += bytes([127]) + struct.pack("!Q", n)
    conn.sendall(bytes(header) + payload)


def _recv_exact(conn: socket.socket, n: int, buf: bytearray) -> bytes:
    while len(buf) < n:
        chunk = conn.recv(65536)
        if not chunk:
            raise ConnectionError("closed")
        buf += chunk
    out = bytes(buf[:n])
    del buf[:n]
    return out


def _recv_frame(conn: socket.socket, buf: bytearray) -> tuple[int, bytes]:
    b1, b2 = _recv_exact(conn, 2, buf)
    n = b2 & 0x7F
    if n == 126:
        n = struct.unpack("!H", _recv_exact(conn, 2, buf))[0]
    elif n == 127:
        n = struct.unpack("!Q", _recv_exact(conn, 8, buf))[0]
    mask = _recv_exact(conn, 4, buf) if b2 & 0x80 else b"\0\0\0\0"
    data = _recv_exact(conn, n, buf)
    return b1 & 0x0F, bytes(b ^ mask[i % 4] for i, b in enumerate(data))


class FakeOBS:
    def __init__(self, password: str = "", video_input: bool = True, video_active: bool = True,
                 supports_set_record_directory: bool = True, already_recording: bool = False,
                 never_confirm: bool = False, corrupt_video: bool = False) -> None:
        self.corrupt_video = corrupt_video
        self.password = password
        self.video_input = video_input
        self.video_active = video_active
        self.supports_set_dir = supports_set_record_directory
        self.never_confirm = never_confirm
        self.record_dir = tempfile.mkdtemp(prefix="fakeobs_default_")
        self.recording = already_recording
        self.output_path: str | None = None
        self._fh = None
        self._bytes = 0
        self._started_at = 0.0
        self.requests: list[str] = []
        self.conns: list[socket.socket] = []
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        self.port = self.sock.getsockname()[1]
        self._alive = True
        self._lock = threading.Lock()
        threading.Thread(target=self._accept, daemon=True).start()
        threading.Thread(target=self._writer, daemon=True).start()

    # ── server plumbing ─────────────────────────────────────────────────────
    def _accept(self) -> None:
        while self._alive:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            self.conns.append(conn)
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn: socket.socket) -> None:
        buf = bytearray()
        try:
            while b"\r\n\r\n" not in buf:
                buf += conn.recv(4096)
            head, _, rest = bytes(buf).partition(b"\r\n\r\n")
            buf = bytearray(rest)
            key = next(l.split(":", 1)[1].strip() for l in head.decode().split("\r\n") if l.lower().startswith("sec-websocket-key"))
            accept = base64.b64encode(hashlib.sha1((key + _GUID).encode()).digest()).decode()
            conn.sendall(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
            hello = {"obsWebSocketVersion": "5.5.2", "rpcVersion": 1}
            salt, challenge = "c2FsdA==", base64.b64encode(os.urandom(8)).decode()
            if self.password:
                hello["authentication"] = {"salt": salt, "challenge": challenge}
            self._send(conn, {"op": 0, "d": hello})
            while self._alive:
                op, payload = _recv_frame(conn, buf)
                if op == 0x8:
                    return
                if op != 0x1:
                    continue
                msg = json.loads(payload)
                if msg["op"] == 1:
                    if self.password and msg["d"].get("authentication") != obs_auth_string(self.password, salt, challenge):
                        _send_frame(conn, 0x8, struct.pack("!H", 4009) + b"Authentication failed.")
                        conn.close()
                        return
                    self._send(conn, {"op": 2, "d": {"negotiatedRpcVersion": 1}})
                elif msg["op"] == 6:
                    self._request(conn, msg["d"])
        except (OSError, ConnectionError, StopIteration, ValueError):
            pass

    def _send(self, conn: socket.socket, obj: dict) -> None:
        with self._lock:
            _send_frame(conn, 0x1, json.dumps(obj).encode())

    def _broadcast_event(self, event_type: str, data: dict) -> None:
        for c in list(self.conns):
            try:
                self._send(c, {"op": 5, "d": {"eventType": event_type, "eventIntent": 64, "eventData": data}})
            except OSError:
                pass

    def _writer(self) -> None:
        """Write a real (tiny) video when opencv is available, so decode checks are meaningful."""
        while self._alive:
            time.sleep(0.05)
            with self._lock:
                if self.recording and self._fh is not None:
                    self._fh.write_frame()
                    self._bytes = os.path.getsize(self.output_path) or self._bytes + 1

    # ── obs-websocket requests ──────────────────────────────────────────────
    def _request(self, conn: socket.socket, d: dict) -> None:
        rtype, data = d["requestType"], d.get("requestData") or {}
        self.requests.append(rtype)
        ok, resp, code = True, {}, 100
        if rtype == "GetVersion":
            reqs = ["GetVersion", "GetRecordStatus", "StartRecord", "StopRecord", "GetRecordDirectory", "GetInputList", "GetSourceActive"]
            if self.supports_set_dir:
                reqs.append("SetRecordDirectory")
            resp = {"obsVersion": "30.2.0-fake", "obsWebSocketVersion": "5.5.2-fake", "availableRequests": reqs}
        elif rtype == "GetRecordStatus":
            active = self.recording and not self.never_confirm
            resp = {"outputActive": active, "outputPaused": False,
                    "outputBytes": self._bytes if active else 0,
                    "outputDuration": int((time.time() - self._started_at) * 1000) if active else 0,
                    "outputTimecode": "00:00:01.000"}
        elif rtype == "GetRecordDirectory":
            resp = {"recordDirectory": self.record_dir}
        elif rtype == "SetRecordDirectory":
            if not self.supports_set_dir:
                ok, code = False, 204
            else:
                self.record_dir = data["recordDirectory"]
        elif rtype == "GetInputList":
            resp = {"inputs": [{"inputName": "Logitech", "inputKind": "dshow_input", "unversionedInputKind": "dshow_input"}]
                    if self.video_input else []}
        elif rtype == "GetSourceActive":
            resp = {"videoActive": self.video_active, "videoShowing": self.video_active}
        elif rtype == "StartRecord":
            if self.recording:
                ok, code = False, 500
            else:
                self.output_path = os.path.join(self.record_dir, time.strftime("%Y-%m-%d %H-%M-%S") + ".mp4")
                with self._lock:
                    self._fh = _FakeVideo(self.output_path, self.corrupt_video)
                self._bytes, self._started_at, self.recording = 0, time.time(), True
                self._broadcast_event("RecordStateChanged", {"outputActive": True, "outputState": "OBS_WEBSOCKET_OUTPUT_STARTED",
                                                             "outputPath": self.output_path})
        elif rtype == "StopRecord":
            if not self.recording:
                ok, code = False, 501
            else:
                self.recording = False
                with self._lock:
                    self._fh.close()
                    self._fh = None
                resp = {"outputPath": self.output_path}
                self._broadcast_event("RecordStateChanged", {"outputActive": False, "outputState": "OBS_WEBSOCKET_OUTPUT_STOPPED",
                                                             "outputPath": self.output_path})
        else:
            ok, code = False, 204
        self._send(conn, {"op": 7, "d": {"requestType": rtype, "requestId": d["requestId"],
                                         "requestStatus": {"result": ok, "code": code}, "responseData": resp}})

    # ── test controls ───────────────────────────────────────────────────────
    def crash(self) -> None:
        """Simulate OBS closing: drop every connection, refuse new ones."""
        self._alive = False
        try:
            self.sock.close()
        except OSError:
            pass
        for c in self.conns:
            try:
                c.shutdown(socket.SHUT_RDWR)
                c.close()
            except OSError:
                pass

    def close(self) -> None:
        self.crash()
        if self._fh:
            self._fh.close()


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def make_config(output_root: Path, obs_port: int | None = None, **sections) -> Config:
    """Real config file + test overrides (temp output, fast timeouts, free ports)."""
    overrides = {
        "paths": {"output_root": str(output_root), "min_free_disk_gb": 0.01},
        "server": {"port": free_port()},
        "session": {"heartbeat_timeout_s": 3, "status_print_interval_s": 60, "watchdog_interval_s": 0.3, "max_game_duration_s": 60},
        "obs": {"port": obs_port or free_port(), "start_confirm_timeout_s": 3, "stop_confirm_timeout_s": 5, "connect_timeout_s": 2},
        "shimmer": {"stall_timeout_s": 1.5, "stream_confirm_timeout_s": 10, "connect_timeout_s": 20, "simulated_rate_hz": 200},
        "thermal_camera": {"mode": "none"},
    }
    for name, values in sections.items():
        overrides.setdefault(name, {}).update(values)
    return Config.load(PROJECT_ROOT / "config" / "experiment_config.toml", overrides=overrides)


class SimulatedGame:
    """Plays the browser game's side of the HTTP protocol (same payloads as sessionBridge.ts)."""

    def __init__(self, base_url: str, session_id: str) -> None:
        self.base, self.sid = base_url, session_id

    def post(self, path: str, body: dict) -> tuple[int, dict]:
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def get(self, path: str) -> tuple[int, dict]:
        try:
            with urllib.request.urlopen(self.base + path, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def play(self, n_trials: int = 4, status: str = "completed", end_sync: bool = True) -> None:
        ctx = self.get("/api/session")[1]
        assert ctx["session_id"] == self.sid
        self.post("/api/heartbeat", {"session_id": self.sid, "screen": "MAIN_TASK"})
        events, perf, seq = [], 1000.0, 0
        def add(t, trial=None, detail=None):
            nonlocal perf, seq
            perf += 50
            seq += 1
            events.append({"event_type": t, "timestamp_perf": perf, "timestamp_wallclock": "2026-10-28T10:00:00.000Z",
                           "trial_number": trial, "detail": detail, "bridge_seq": seq})
        for i in range(5):
            add("SYNC_MARKER_ONSET" if i % 2 == 0 else "SYNC_MARKER_OFFSET", None,
                {"marker_source": "session_sync_sequence", "sequence": "session_start", "pulse_index": i // 2, "duration_ms": 300})
        add("MAIN_TASK_START")
        trials = []
        for t in range(1, n_trials + 1):
            add("TRIAL_START", t)
            add("STIMULUS_ONSET", t, {"color": "BLUE"})
            add("TRIAL_END", t)
            trials.append({"participant_id": ctx["participant_id"], "session_id": self.sid, "trial_number": t,
                           "is_practice": False, "reaction_time_ms": 300 + t, "correct": True})
        status_code, _ = self.post("/api/events", {"session_id": self.sid, "events": events,
                                                   "client": {"sent_perf_ms": perf, "sent_wall_ms": time.time() * 1000}})
        assert status_code == 200
        header = "participant_id,session_id,trial_number,is_practice,reaction_time_ms,correct"
        rows = [f"{r['participant_id']},{r['session_id']},{r['trial_number']},false,{r['reaction_time_ms']},true" for r in trials]
        code, body = self.post("/api/result", {"session_id": self.sid, "status": status, "trials": trials,
                                               "trials_csv": "\r\n".join([header] + rows), "events": events,
                                               "summary": {"total_trials": n_trials}, "metadata": {"session_id": self.sid},
                                               "session_export": {"trials": trials}})
        assert code == 200, body
        if end_sync:
            self.post("/api/events", {"session_id": self.sid, "client": {}, "events": [
                {"event_type": "SYNC_SEQUENCE_COMPLETED", "timestamp_perf": perf + 2000, "timestamp_wallclock": "2026-10-28T10:00:02.000Z",
                 "trial_number": None, "detail": {"marker_source": "session_sync_sequence", "sequence": "session_end"}, "bridge_seq": seq + 1}]})


def wait_until(predicate, timeout: float = 10.0, interval: float = 0.05) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(interval)
    return False


def read_rows(path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))
