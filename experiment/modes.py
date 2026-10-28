"""Acquisition modes. Only FULL_MULTIMODAL is a research recording."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Mode(str, Enum):
    FULL_MULTIMODAL = "FULL_MULTIMODAL"
    CAMERA_GAME_TEST = "CAMERA_GAME_TEST"
    SHIMMER_GAME_TEST = "SHIMMER_GAME_TEST"
    GAME_ONLY_TEST = "GAME_ONLY_TEST"
    MOCK_INTEGRATION_TEST = "MOCK_INTEGRATION_TEST"


@dataclass(frozen=True)
class ModeSpec:
    camera: str | None  # "obs" | "mock" | None
    shimmer: str | None  # "device" | "simulated" | None
    is_test: bool
    is_mock: bool
    tag: str  # short label embedded in the session folder name
    description: str


MODE_SPECS: dict[Mode, ModeSpec] = {
    Mode.FULL_MULTIMODAL: ModeSpec(
        "obs", "device", False, False, "FULL",
        "OBS camera + Shimmer + game. The only mode for real participant data.",
    ),
    Mode.CAMERA_GAME_TEST: ModeSpec(
        "obs", None, True, False, "CAMTEST",
        "OBS camera + game, no Shimmer.",
    ),
    Mode.SHIMMER_GAME_TEST: ModeSpec(
        None, "device", True, False, "SHIMTEST",
        "Shimmer + game, no camera.",
    ),
    Mode.GAME_ONLY_TEST: ModeSpec(
        None, None, True, False, "GAMEONLY",
        "Game only; no hardware.",
    ),
    Mode.MOCK_INTEGRATION_TEST: ModeSpec(
        "mock", "simulated", True, True, "MOCK",
        "Mock camera + simulated Shimmer subprocess + game. Produces NO real data.",
    ),
}


def parse_mode(value: str) -> Mode:
    try:
        return Mode(value.strip().upper())
    except ValueError:
        valid = ", ".join(m.value for m in Mode)
        raise ValueError(f"Unknown mode {value!r}. Valid modes: {valid}") from None
