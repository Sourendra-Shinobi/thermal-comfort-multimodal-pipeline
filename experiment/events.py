"""Central session event log (``events.csv``).

Every row is flushed immediately so a crash loses at most the row being
written. Events from the games keep their own timestamps in the ``source_*``
columns; the controller's columns record when the controller received them.
"""

from __future__ import annotations

import csv
import json
import logging
import threading
from pathlib import Path
from typing import Any

from .clock import Clock

log = logging.getLogger(__name__)

COLUMNS = [
    "session_id",
    "event_seq",
    "event_type",
    "source",
    "status",
    "monotonic_s",
    "wallclock",
    "task",
    "block",
    "trial",
    "source_seq",
    "source_monotonic_ms",
    "source_wallclock",
    "payload",
]


class EventLogger:
    def __init__(self, path: Path | None, session_id: str, clock: Clock | None = None) -> None:
        self.session_id = session_id
        self.clock = clock or Clock()
        self._lock = threading.Lock()
        self._seq = 0
        self._file = None
        self._writer = None
        self.write_failures = 0
        self.counts: dict[str, int] = {}
        if path is not None:
            self._file = open(path, "x", newline="", encoding="utf-8")
            self._writer = csv.DictWriter(self._file, fieldnames=COLUMNS)
            self._writer.writeheader()
            self._file.flush()

    def log(
        self,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        source: str = "controller",
        status: str = "ok",
        task: str | None = None,
        block: Any = None,
        trial: Any = None,
        source_seq: Any = None,
        source_monotonic_ms: Any = None,
        source_wallclock: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._seq += 1
            row = {
                "session_id": self.session_id,
                "event_seq": self._seq,
                "event_type": event_type,
                "source": source,
                "status": status,
                "monotonic_s": f"{self.clock.mono():.6f}",
                "wallclock": self.clock.wall_iso(),
                "task": task or "",
                "block": "" if block is None else block,
                "trial": "" if trial is None else trial,
                "source_seq": "" if source_seq is None else source_seq,
                "source_monotonic_ms": "" if source_monotonic_ms is None else source_monotonic_ms,
                "source_wallclock": source_wallclock or "",
                "payload": json.dumps(payload, default=str, ensure_ascii=False) if payload else "",
            }
            self.counts[source] = self.counts.get(source, 0) + 1
            if self._writer is not None:
                try:
                    self._writer.writerow(row)
                    self._file.flush()
                except (OSError, ValueError) as exc:
                    self.write_failures += 1
                    log.error("events.csv write failed (%s): %s %s", exc, event_type, payload)
        level = logging.WARNING if status in ("error", "warning") else logging.INFO
        if source == "controller" or status != "ok":
            log.log(level, "[%s] %s %s", source, event_type, row["payload"])
        return row

    @property
    def count(self) -> int:
        return self._seq

    def close(self) -> None:
        with self._lock:
            if self._file is not None:
                self._file.close()
                self._file = None
                self._writer = None


class NullEventLogger(EventLogger):
    """Used by stand-alone preflight checks, where no session exists yet."""

    def __init__(self) -> None:
        super().__init__(None, session_id="")
