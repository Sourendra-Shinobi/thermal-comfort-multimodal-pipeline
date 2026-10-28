"""Configuration loading (TOML, stdlib ``tomllib``)."""

from __future__ import annotations

import copy
import os
import sys
import tomllib
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config" / "experiment_config.toml"


class ConfigError(ValueError):
    pass


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge(out[key], value)
        else:
            out[key] = value
    return out


class Config:
    def __init__(self, data: dict[str, Any], root: Path = PROJECT_ROOT, sources: list[str] | None = None) -> None:
        self.data = data
        self.root = root
        self.sources = sources or []
        self._validate()

    @classmethod
    def load(cls, path: Path | None = None, overrides: dict | None = None, root: Path = PROJECT_ROOT) -> "Config":
        path = Path(path) if path else DEFAULT_CONFIG_PATH
        if not path.is_file():
            raise ConfigError(f"Config file not found: {path}")
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        sources = [str(path)]
        local = path.with_name(path.stem + ".local.toml")
        if local.is_file():
            with open(local, "rb") as fh:
                data = _merge(data, tomllib.load(fh))
            sources.append(str(local))
        if overrides:
            data = _merge(data, overrides)
        return cls(data, root=root, sources=sources)

    def section(self, name: str) -> dict[str, Any]:
        return self.data.get(name, {})

    def path(self, value: str | os.PathLike) -> Path:
        p = Path(value)
        return p if p.is_absolute() else (self.root / p)

    def python_for(self, section: str) -> str:
        """Interpreter for a subprocess; a bare name like "py" is passed through."""
        value = str(self.section(section).get("python") or "")
        if not value:
            return sys.executable
        return str(self.path(value)) if ("/" in value or "\\" in value) else value

    @property
    def output_root(self) -> Path:
        return self.path(self.section("paths").get("output_root", "experiment_output"))

    @property
    def games(self) -> dict[str, dict[str, Any]]:
        return self.section("games")

    def obs_password(self) -> str:
        obs = self.section("obs")
        if obs.get("password"):
            return str(obs["password"])
        env = obs.get("password_env")
        return os.environ.get(env, "") if env else ""

    def snapshot(self) -> dict[str, Any]:
        """Config for metadata.json, with secrets removed."""
        data = copy.deepcopy(self.data)
        if data.get("obs", {}).get("password"):
            data["obs"]["password"] = "***"
        return {"sources": self.sources, "values": data}

    def _validate(self) -> None:
        if not self.games:
            raise ConfigError("No [games.*] sections configured")
        for key, game in self.games.items():
            if "dist_dir" not in game:
                raise ConfigError(f"[games.{key}] needs dist_dir")
        pattern = self.section("sync").get("pattern_ms", [])
        if not isinstance(pattern, list) or not all(isinstance(x, int) and x > 0 for x in pattern):
            raise ConfigError("[sync] pattern_ms must be a list of positive integers")
        port = self.section("server").get("port", 8765)
        if not isinstance(port, int) or not (0 <= port < 65536):
            raise ConfigError("[server] port must be an integer 0-65535")
