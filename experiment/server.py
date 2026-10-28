"""Local HTTP server: serves the game builds and the session API.

Bound to 127.0.0.1 only. Endpoints:

  GET  /games/<key>/...        static files from the game's dist/
  GET  /api/session            session context for the game
  POST /api/events             batch of game events -> events.csv
  POST /api/heartbeat          game alive + current screen
  POST /api/result             final trials/events/summary -> games/<task>/
  GET  /api/status             acquisition status (game readiness screen)
  GET  /status                 ODD-ONE-OUT shimmerController contract
  POST /start, /stop           refused (409): acquisition is controller-owned

Every POST must carry the current session_id; a stale browser tab from an
earlier session is rejected instead of writing into the wrong folder.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import mimetypes
import re
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlparse

from . import __version__
from .events import EventLogger
from .session import Session, write_json_atomic
from .sync import SyncManager

log = logging.getLogger(__name__)

MAX_BODY = 64 * 1024 * 1024
_LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")
_TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html",
          ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon",
          ".woff2": "font/woff2", ".map": "application/json"}
SYNC_EVENT_TYPES = {"SYNC_SEQUENCE_STARTED", "SYNC_MARKER_ONSET", "SYNC_MARKER_OFFSET", "SYNC_SEQUENCE_COMPLETED"}


class GameLink:
    """Shared state between the HTTP handler threads and the controller."""

    def __init__(self, session: Session, events: EventLogger, sync: SyncManager, context: dict[str, Any],
                 static_dirs: dict[str, Path], status_provider: Callable[[], dict[str, Any]],
                 shimmer_status_provider: Callable[[], dict[str, Any]]) -> None:
        self.session = session
        self.events = events
        self.sync = sync
        self.context = context
        self.static_dirs = static_dirs
        self.status_provider = status_provider
        self.shimmer_status_provider = shimmer_status_provider
        self.lock = threading.Lock()
        self.connected_at: float | None = None
        self.last_heartbeat: float | None = None
        self.screen: str | None = None
        self.result: dict[str, Any] | None = None
        self.result_event = threading.Event()
        self.end_sync_done = threading.Event()
        self.events_received = 0
        self.accepting = True

    # ── handlers called by the request handler ──────────────────────────────
    def touch(self, screen: str | None = None) -> None:
        with self.lock:
            first = self.connected_at is None
            self.last_heartbeat = time.monotonic()
            if first:
                self.connected_at = self.last_heartbeat
            if screen and screen != self.screen:
                self.screen = screen
                changed = True
            else:
                changed = False
        if first:
            self.events.log("GAME_CONNECTED", {"task": self.session.game}, task=self.session.game)
        if changed:
            self.events.log("GAME_SCREEN", {"screen": screen}, task=self.session.game)

    def ingest_events(self, body: dict[str, Any]) -> int:
        recv = time.time()
        self.sync.record_batch(body.get("client") or {}, recv)
        source = f"game:{self.session.game}"
        n = 0
        for ev in body.get("events") or []:
            if not isinstance(ev, dict) or not ev.get("event_type"):
                continue
            detail = ev.get("detail") if isinstance(ev.get("detail"), dict) else ({"detail": ev["detail"]} if ev.get("detail") else None)
            row = self.events.log(
                str(ev["event_type"]), detail, source=source, task=self.session.game,
                block=(detail or {}).get("block_id", self.session.block),
                trial=ev.get("trial_number"), source_seq=ev.get("bridge_seq", ev.get("event_sequence")),
                source_monotonic_ms=ev.get("timestamp_perf"), source_wallclock=ev.get("timestamp_wallclock"),
            )
            if ev["event_type"] == "SYNC_SEQUENCE_COMPLETED" and (detail or {}).get("sequence") == "session_end":
                self.end_sync_done.set()
            if ev["event_type"] in SYNC_EVENT_TYPES:
                self.sync.record_sync_event({"event_type": ev["event_type"], "game_perf_ms": ev.get("timestamp_perf"),
                                             "game_wallclock": ev.get("timestamp_wallclock"),
                                             "controller_seq": row["event_seq"], "detail": detail})
            n += 1
        with self.lock:
            self.events_received += n
        return n

    def store_result(self, body: dict[str, Any]) -> tuple[bool, str]:
        with self.lock:
            if self.result is not None:
                return False, "result already received for this session"
            if not self.accepting:
                return False, "session already finalized"
            self.result = {"status": body.get("status"), "received_wallclock": self.events.clock.wall_iso()}
        out = self.session.game_dir()
        written = []
        try:
            trials_csv = body.get("trials_csv")
            if not isinstance(trials_csv, str):
                trials_csv = rows_to_csv(body.get("trials") or [])
            written.append(_write_new(out / "trials.csv", trials_csv))
            events_csv = body.get("events_csv")
            if not isinstance(events_csv, str):
                events_csv = rows_to_csv([_flatten_event(e) for e in body.get("events") or []])
            written.append(_write_new(out / "events.csv", events_csv))
            if body.get("session_export") is not None:
                written.append(_write_new(out / "session_export.json", json.dumps(body["session_export"], indent=2, ensure_ascii=False)))
            summary = {
                "task": self.session.game,
                "status": body.get("status"),
                "reason": body.get("reason"),
                "trial_count": len(body.get("trials") or []),
                "main_trial_count": sum(1 for t in body.get("trials") or [] if not t.get("is_practice")),
                "event_count": len(body.get("events") or []),
                "game_summary": body.get("summary"),
                "game_metadata": body.get("metadata"),
            }
            path = out / "summary.json"
            write_json_atomic(path, summary)
            written.append(str(path))
        except OSError as exc:
            self.events.log("EXPORT_ERROR", {"error": str(exc), "written": written}, status="error", task=self.session.game)
            with self.lock:
                self.result["write_error"] = str(exc)
        with self.lock:
            self.result.update(files=written, trial_count=len(body.get("trials") or []))
        self.events.log("GAME_RESULT_RECEIVED", {"status": body.get("status"), "files": written,
                                                 "trials": len(body.get("trials") or [])}, task=self.session.game)
        self.result_event.set()
        return True, "stored"


def _write_new(path: Path, text: str) -> str:
    with open(path, "x", encoding="utf-8", newline="") as fh:
        fh.write(text)
    return str(path)


def _flatten_event(ev: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in ev.items() if k != "detail"}
    out["detail"] = json.dumps(ev.get("detail")) if ev.get("detail") is not None else ""
    return out


def rows_to_csv(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    columns: list[str] = []
    for r in rows:
        for k in r:
            if k not in columns:
                columns.append(k)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, lineterminator="\r\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in columns})
    return buf.getvalue()


class _Handler(BaseHTTPRequestHandler):
    server_version = f"ExperimentController/{__version__}"
    link: GameLink  # set on the subclass created per server

    def log_message(self, fmt: str, *args: Any) -> None:
        log.debug("http %s - " + fmt, self.address_string(), *args)

    # ── helpers ─────────────────────────────────────────────────────────────
    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin and _LOCAL_ORIGIN.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")

    def _json(self, code: int, data: Any) -> None:
        body = json.dumps(data, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict[str, Any] | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "missing or oversized body"})
            return None
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid JSON"})
            return None
        if not isinstance(data, dict):
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "JSON object expected"})
            return None
        return data

    def _check_session(self, data: dict[str, Any]) -> bool:
        if data.get("session_id") != self.link.session.session_id:
            self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "session_id does not match the active session",
                                             "active_session": self.link.session.session_id})
            return False
        return True

    # ── verbs ───────────────────────────────────────────────────────────────
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        link = self.link
        if path == "/api/session":
            self._json(200, link.context)
        elif path == "/api/status":
            self._json(200, link.status_provider())
        elif path == "/status":
            self._json(200, link.shimmer_status_provider())
        elif path.startswith("/games/"):
            self._static(path)
        elif path == "/":
            self._index()
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        link = self.link
        if path in ("/start", "/stop"):
            self._json(HTTPStatus.CONFLICT, {"success": False, "output_file": None,
                                             "error": "Acquisition is controlled by the experiment controller "
                                                      "(python -m experiment run); the game must not start/stop it."})
            return
        data = self._body()
        if data is None or not self._check_session(data):
            return
        if path == "/api/events":
            link.touch()
            self._json(200, {"ok": True, "received": link.ingest_events(data)})
        elif path == "/api/heartbeat":
            link.touch(data.get("screen"))
            self._json(200, {"ok": True})
        elif path == "/api/result":
            link.touch()
            ok, msg = link.store_result(data)
            self._json(200 if ok else HTTPStatus.CONFLICT, {"ok": ok, "message": msg})
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def _static(self, path: str) -> None:
        parts = unquote(path).split("/", 3)  # ['', 'games', key, rest]
        key = parts[2] if len(parts) > 2 else ""
        base = self.link.static_dirs.get(key)
        rest = parts[3] if len(parts) > 3 and parts[3] else "index.html"
        if base is None:
            self._json(404, {"ok": False, "error": f"unknown game {key!r}"})
            return
        target = (base / rest).resolve()
        if not target.is_relative_to(base.resolve()) or not target.is_file():
            self._json(404, {"ok": False, "error": "not found"})
            return
        data = target.read_bytes()
        ctype = _TYPES.get(target.suffix.lower()) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _index(self) -> None:
        ctx = self.link.context
        html = (f"<!doctype html><title>Experiment controller</title><h1>Session {ctx['session_id']}</h1>"
                f"<p>Mode: {ctx['mode']}{' (MOCK)' if ctx.get('is_mock') else ''}</p>"
                f"<p><a href='{ctx.get('game_url', '#')}'>Open game</a> · <a href='/api/status'>status</a></p>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


class ControllerServer:
    def __init__(self, host: str, port: int, link: GameLink) -> None:
        handler = type("BoundHandler", (_Handler,), {"link": link})
        try:
            self.httpd = ThreadingHTTPServer((host, port), handler)
        except OSError as exc:
            raise OSError(f"Cannot listen on {host}:{port} ({exc}). Is another controller (or old shimmer bridge) running?") from exc
        self.httpd.daemon_threads = True
        self.link = link
        self.thread = threading.Thread(target=self.httpd.serve_forever, name="http", daemon=True)

    @property
    def base_url(self) -> str:
        host, port = self.httpd.server_address[:2]
        return f"http://{host}:{port}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.link.accepting = False
        self.httpd.shutdown()
        self.httpd.server_close()
