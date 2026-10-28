"""Controller clock.

Two readings are kept for every controller event:

* ``monotonic_s`` -- ``time.perf_counter()`` relative to the session origin.
  Use for durations; never jumps.
* ``wallclock`` -- system time (UTC, ISO 8601). The browser's ``Date.now()``,
  the Shimmer recorder's ``host_unix_ms`` and OBS all read this same OS clock
  on the acquisition PC, which is what makes cross-stream alignment possible.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone


def iso_from_unix(unix_s: float) -> str:
    """UTC ISO 8601 with microseconds and a trailing Z (matches JS toISOString style)."""
    return datetime.fromtimestamp(unix_s, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class Clock:
    def __init__(self) -> None:
        self.origin_perf = time.perf_counter()
        self.origin_unix = time.time()

    def mono(self) -> float:
        return time.perf_counter() - self.origin_perf

    @staticmethod
    def unix() -> float:
        return time.time()

    def wall_iso(self) -> str:
        return iso_from_unix(time.time())

    def describe(self) -> dict:
        return {
            "monotonic_source": "time.perf_counter() (seconds, relative to origin)",
            "wallclock_source": "time.time() system clock, UTC",
            "origin_perf_counter_s": self.origin_perf,
            "origin_unix_s": self.origin_unix,
            "origin_wallclock": iso_from_unix(self.origin_unix),
        }
