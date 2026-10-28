"""Minimal RFC 6455 WebSocket client (text frames only), standard library.

Sufficient for OBS-WebSocket v5 JSON messages. Not a general-purpose client:
no TLS, no extensions/compression, binary frames are ignored.
"""

from __future__ import annotations

import base64
import hashlib
import os
import socket
import struct
import threading

_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class WebSocketClosed(ConnectionError):
    pass


class WebSocketClient:
    def __init__(self, host: str, port: int, path: str = "/", timeout: float = 5.0) -> None:
        self.host, self.port, self.path, self.timeout = host, port, path, timeout
        self.sock: socket.socket | None = None
        self._buf = bytearray()
        self._send_lock = threading.Lock()

    # ── connection ──────────────────────────────────────────────────────────
    def connect(self) -> None:
        sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "Sec-WebSocket-Protocol: obswebsocket.json\r\n"
            "\r\n"
        )
        sock.sendall(request.encode())
        self.sock = sock
        header = self._read_until(b"\r\n\r\n")
        lines = header.decode("latin-1").split("\r\n")
        if not lines or " 101 " not in lines[0] + " ":
            self.close()
            raise ConnectionError(f"WebSocket handshake rejected: {lines[0] if lines else header!r}")
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        expected = base64.b64encode(hashlib.sha1((key + _GUID).encode()).digest()).decode()
        if headers.get("sec-websocket-accept") != expected:
            self.close()
            raise ConnectionError("WebSocket handshake: bad Sec-WebSocket-Accept")

    def close(self) -> None:
        if self.sock is None:
            return
        try:
            self._send_frame(0x8, b"")
        except OSError:
            pass
        try:
            self.sock.close()
        finally:
            self.sock = None

    @property
    def connected(self) -> bool:
        return self.sock is not None

    # ── I/O ─────────────────────────────────────────────────────────────────
    def send_text(self, text: str) -> None:
        self._send_frame(0x1, text.encode("utf-8"))

    def recv_text(self, timeout: float | None = None) -> str:
        """Block until one complete text message arrives. Raises socket.timeout."""
        if self.sock is None:
            raise WebSocketClosed("not connected")
        self.sock.settimeout(timeout)
        parts: list[bytes] = []
        while True:
            fin, opcode, payload = self._read_frame()
            if opcode == 0x9:  # ping
                self._send_frame(0xA, payload)
                continue
            if opcode == 0xA:  # pong
                continue
            if opcode == 0x8:
                code = struct.unpack("!H", payload[:2])[0] if len(payload) >= 2 else None
                reason = payload[2:].decode("utf-8", "replace")
                self.sock.close()
                self.sock = None
                raise WebSocketClosed(f"closed by server (code={code}, reason={reason!r})")
            if opcode in (0x1, 0x0):
                parts.append(payload)
                if fin:
                    return b"".join(parts).decode("utf-8")
            # binary frames ignored

    def _send_frame(self, opcode: int, payload: bytes) -> None:
        if self.sock is None:
            raise WebSocketClosed("not connected")
        header = bytearray([0x80 | opcode])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack("!H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack("!Q", n)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        with self._send_lock:
            self.sock.sendall(bytes(header) + mask + masked)

    def _read_frame(self) -> tuple[bool, int, bytes]:
        b1, b2 = self._read_exact(2)
        fin = bool(b1 & 0x80)
        opcode = b1 & 0x0F
        masked = bool(b2 & 0x80)
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack("!H", self._read_exact(2))[0]
        elif n == 127:
            n = struct.unpack("!Q", self._read_exact(8))[0]
        mask = self._read_exact(4) if masked else None
        payload = self._read_exact(n)
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return fin, opcode, payload

    def _read_exact(self, n: int) -> bytes:
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                self.sock.close()
                self.sock = None
                raise WebSocketClosed("connection lost")
            self._buf += chunk
        out = bytes(self._buf[:n])
        del self._buf[:n]
        return out

    def _read_until(self, marker: bytes) -> bytes:
        while marker not in self._buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("connection closed during handshake")
            self._buf += chunk
        idx = self._buf.index(marker) + len(marker)
        out = bytes(self._buf[:idx])
        del self._buf[:idx]
        return out
