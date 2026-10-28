"""Contract shared by acquisition adapters (camera, Shimmer).

Life cycle, driven by ExperimentController:

    preflight() -> start() -> health()* -> stop() -> close()

* ``preflight`` must not start recording and must leave the device idle.
* ``start`` returns only after the device has *confirmed* acquisition
  (OBS output active with bytes written; Shimmer samples arriving).
  Otherwise it raises AcquisitionError.
* ``stop`` returns only after the output file is finalised and verified,
  and returns a dict that is stored under metadata.modalities.<name>.
* ``health`` is polled by the watchdog while recording.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from ..events import EventLogger, NullEventLogger


class AcquisitionError(RuntimeError):
    pass


@dataclass
class CheckResult:
    name: str
    ok: bool
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    required: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AcquisitionAdapter:
    modality = "base"
    is_mock = False

    def __init__(self, events: EventLogger | None = None) -> None:
        self.events = events or NullEventLogger()
        self.state = "IDLE"
        self.last_error: str | None = None

    def bind(self, events: EventLogger, output_dir) -> None:
        self.events = events
        self.output_dir = output_dir

    def preflight(self) -> CheckResult:
        raise NotImplementedError

    def start(self) -> dict[str, Any]:
        raise NotImplementedError

    def health(self) -> CheckResult:
        raise NotImplementedError

    def stop(self) -> dict[str, Any]:
        raise NotImplementedError

    def close(self) -> None:
        pass

    def status_line(self) -> str:
        return self.state

    def status_dict(self) -> dict[str, Any]:
        return {"state": self.state, "error": self.last_error, "mock": self.is_mock}
