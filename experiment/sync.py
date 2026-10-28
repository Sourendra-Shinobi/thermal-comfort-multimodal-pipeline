"""Clock relationships between the controller, the browser game and devices.

All streams on the acquisition PC ultimately read the same OS system clock:
  controller wallclock      time.time()
  browser wallclock         Date.now()  (game's toWallclock() is anchored to it)
  Shimmer host_unix_ms      time.time() in the recorder process
  OBS                       start/stop confirmed by the controller (time.time())
What is measured here, from every event batch the game posts:
  * transport latency  = controller receive time - browser Date.now() at send
  * browser drift      = variation of (Date.now() - performance.now()) over the
    session; game events carry performance.now() timestamps, so drift between
    the two browser clocks is the error of their wall-clock conversion.
Physical latencies (screen refresh, camera exposure, OBS encoder, Bluetooth)
are NOT measurable here; see docs/SYNCHRONIZATION.md and the sync-flash
detection in hd_camera/scripts/detect_sync_marker.py.
"""

from __future__ import annotations

import statistics
import threading
from typing import Any


def _stats(values: list[float]) -> dict[str, float] | None:
    if not values:
        return None
    s = sorted(values)
    return {
        "n": len(s),
        "min": round(s[0], 3),
        "median": round(statistics.median(s), 3),
        "p95": round(s[min(len(s) - 1, int(0.95 * len(s)))], 3),
        "max": round(s[-1], 3),
    }


class SyncManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.latencies_ms: list[float] = []
        self.browser_offsets_ms: list[float] = []  # Date.now() - performance.now()
        self.browser_clock_origin: dict[str, Any] | None = None
        self.sync_events: list[dict[str, Any]] = []
        self.anchors: dict[str, Any] = {}

    def record_batch(self, client: dict[str, Any], server_recv_unix: float) -> None:
        sent_wall = client.get("sent_wall_ms")
        sent_perf = client.get("sent_perf_ms")
        with self._lock:
            if isinstance(sent_wall, (int, float)):
                self.latencies_ms.append(server_recv_unix * 1000.0 - sent_wall)
                if isinstance(sent_perf, (int, float)):
                    self.browser_offsets_ms.append(sent_wall - sent_perf)
            if client.get("clock_origin") and self.browser_clock_origin is None:
                self.browser_clock_origin = client["clock_origin"]

    def record_sync_event(self, event: dict[str, Any]) -> None:
        with self._lock:
            self.sync_events.append(event)

    def anchor(self, name: str, value: Any) -> None:
        with self._lock:
            self.anchors[name] = value

    def report(self) -> dict[str, Any]:
        with self._lock:
            offsets = self.browser_offsets_ms
            drift = (max(offsets) - min(offsets)) if len(offsets) > 1 else None
            anomalies = []
            if self.latencies_ms and min(self.latencies_ms) < -5.0:
                anomalies.append("negative browser->controller latency: the browser's Date.now() ran ahead of the "
                                 "controller clock (system clock change, or a headless browser with virtual time). "
                                 "Browser wall-clock timestamps of this session are not trustworthy.")
            return {
                "anomalies": anomalies,
                "method": "software timestamps on a shared OS system clock + coded screen flash (see docs/SYNCHRONIZATION.md)",
                "browser_to_controller_latency_ms": _stats(self.latencies_ms),
                "browser_perf_to_wallclock_offset_ms": {
                    "first": round(offsets[0], 3) if offsets else None,
                    "last": round(offsets[-1], 3) if offsets else None,
                    "range_over_session": round(drift, 3) if drift is not None else None,
                    "note": "wallclock_ms ~= performance.now() + offset; the range bounds the conversion error",
                },
                "browser_clock_origin": self.browser_clock_origin,
                "sync_flash_events_logged": len(self.sync_events),
                "sync_flash_events": self.sync_events,
                "acquisition_anchors": self.anchors,
                "not_measured": [
                    "display latency (render -> photons)",
                    "camera exposure / OBS encoding delay",
                    "Bluetooth transport delay of Shimmer packets",
                    "Fluke thermal camera clock (not controlled by this software)",
                ],
            }
