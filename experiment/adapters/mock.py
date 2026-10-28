"""Mock camera for MOCK_INTEGRATION_TEST and automated tests.

It records NOTHING. Its only output is MOCK_camera_metadata.json stating so.
(The Shimmer side of MOCK mode uses the real recorder subprocess with a
simulated device instead, see adapters/shimmer.py.)
"""

from __future__ import annotations

import time
from typing import Any

from ..clock import iso_from_unix
from ..session import write_json_atomic
from .base import AcquisitionAdapter, AcquisitionError, CheckResult


class MockCameraAdapter(AcquisitionAdapter):
    modality = "camera"
    is_mock = True

    def __init__(self, fail_preflight: bool = False, fail_start: bool = False,
                 fail_health_after_s: float | None = None, events=None) -> None:
        super().__init__(events)
        self.fail_preflight = fail_preflight
        self.fail_start = fail_start
        self.fail_health_after_s = fail_health_after_s
        self.output_dir = None
        self._started = None
        self.info: dict[str, Any] = {"device": "MOCK camera (no video recorded)", "mock": True}

    def preflight(self) -> CheckResult:
        if self.fail_preflight:
            return CheckResult("camera/mock", False, "MOCK camera: simulated preflight failure")
        return CheckResult("camera/mock", True, "MOCK camera: no video will be recorded")

    def start(self) -> dict[str, Any]:
        self.events.log("CAMERA_START_REQUESTED", {"mock": True})
        if self.fail_start:
            self.state = "ERROR"
            self.last_error = "MOCK camera: simulated start failure"
            self.events.log("DEVICE_ERROR", {"device": "camera", "error": self.last_error, "mock": True}, status="error")
            raise AcquisitionError(self.last_error)
        self._started = time.monotonic()
        self.state = "RECORDING"
        self.info["start_confirmed_wallclock"] = iso_from_unix(time.time())
        self.events.log("CAMERA_RECORDING_CONFIRMED", {"mock": True})
        return self.info

    def health(self) -> CheckResult:
        if self.fail_health_after_s is not None and self._started and time.monotonic() - self._started > self.fail_health_after_s:
            self.last_error = "MOCK camera: simulated disconnection"
            return CheckResult("camera", False, self.last_error)
        return CheckResult("camera", True, "MOCK recording")

    def status_line(self) -> str:
        return f"MOCK {self.state}"

    def stop(self) -> dict[str, Any]:
        self.events.log("CAMERA_STOP_REQUESTED", {"mock": True})
        self.state = "STOPPED"
        self.info["stop_wallclock"] = iso_from_unix(time.time())
        self.info["verification"] = {"ok": True, "mock": True, "note": "no file: mock camera"}
        self.events.log("CAMERA_RECORDING_STOPPED", {"mock": True})
        if self.output_dir is not None:
            write_json_atomic(self.output_dir / "MOCK_camera_metadata.json", self.info)
        return self.info
