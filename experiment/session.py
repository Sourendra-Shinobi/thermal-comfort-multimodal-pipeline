"""Session folder creation and metadata.

A session folder is created exactly once (``mkdir`` without ``exist_ok``),
so an existing session can never be overwritten.
"""

from __future__ import annotations

import json
import os
import platform
import re
import secrets
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from . import __version__
from .modes import MODE_SPECS, Mode

SUBDIRS = ("camera", "shimmer", "games", "processing", "logs")

_SAFE = re.compile(r"[^A-Za-z0-9-]+")


def safe_token(value: str, limit: int = 24) -> str:
    token = _SAFE.sub("-", value.strip()).strip("-")
    return token[:limit] or "X"


class SessionStatus:
    CREATED = "CREATED"
    PREFLIGHT_FAILED = "PREFLIGHT_FAILED"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    INCOMPLETE = "INCOMPLETE"
    ABORTED = "ABORTED"
    FAILED = "FAILED"


def make_session_id(participant: str, mode: Mode, now: datetime | None = None) -> str:
    now = now or datetime.now()
    return "_".join([
        now.strftime("%Y%m%d-%H%M%S"),
        safe_token(participant),
        MODE_SPECS[mode].tag,
        secrets.token_hex(2),
    ])


def write_json_atomic(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False, default=str)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def _git_commit(path: Path) -> str | None:
    if not (path / ".git").exists():
        return None
    try:
        out = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5)
        dirty = subprocess.run(["git", "-C", str(path), "status", "--porcelain"], capture_output=True, text=True, timeout=5)
        if out.returncode != 0:
            return None
        return out.stdout.strip() + ("-dirty" if dirty.stdout.strip() else "")
    except (OSError, subprocess.SubprocessError):
        return None


def software_versions(game_project_dir: Path | None) -> dict[str, Any]:
    info: dict[str, Any] = {
        "controller_version": __version__,
        "python": sys.version.split()[0],
        "python_executable": sys.executable,
        "platform": platform.platform(),
        "hostname": platform.node(),
    }
    if game_project_dir is not None:
        pkg = game_project_dir / "package.json"
        if pkg.is_file():
            try:
                meta = json.loads(pkg.read_text(encoding="utf-8"))
                info["game_package"] = {"name": meta.get("name"), "version": meta.get("version")}
            except (OSError, ValueError):
                pass
        info["game_git_commit"] = _git_commit(game_project_dir)
    return info


@dataclass
class Session:
    session_id: str
    root: Path
    mode: Mode
    participant: str
    condition: str
    game: str | None
    block: str = "1"
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def metadata_path(self) -> Path:
        return self.root / "metadata.json"

    @property
    def events_path(self) -> Path:
        return self.root / "events.csv"

    @property
    def log_path(self) -> Path:
        return self.root / "logs" / "experiment.log"

    def dir(self, name: str) -> Path:
        return self.root / name

    def game_dir(self) -> Path:
        d = self.root / "games" / (self.game or "none")
        d.mkdir(parents=True, exist_ok=True)
        return d

    def update(self, **fields: Any) -> None:
        self.metadata.update(fields)
        self.save()

    def update_modality(self, name: str, **fields: Any) -> None:
        self.metadata.setdefault("modalities", {}).setdefault(name, {}).update(fields)
        self.save()

    def save(self) -> None:
        write_json_atomic(self.metadata_path, self.metadata)


class SessionManager:
    def __init__(self, output_root: Path) -> None:
        self.output_root = output_root

    def create(
        self,
        *,
        mode: Mode,
        participant: str,
        condition: str,
        game: str | None,
        block: str = "1",
        notes: str = "",
        environment: dict[str, Any] | None = None,
        config_snapshot: dict[str, Any] | None = None,
        clock_info: dict[str, Any] | None = None,
        game_project_dir: Path | None = None,
    ) -> Session:
        if not participant.strip():
            raise ValueError("participant pseudonym is required")
        self.output_root.mkdir(parents=True, exist_ok=True)
        session_id = make_session_id(participant, mode)
        root = self.output_root / f"session_{session_id}"
        root.mkdir(exist_ok=False)  # never reuse an existing folder
        for sub in SUBDIRS:
            (root / sub).mkdir()
        spec = MODE_SPECS[mode]
        session = Session(session_id, root, mode, participant.strip(), condition.strip(), game, block)
        session.metadata = {
            "schema_version": 1,
            "session_id": session_id,
            "status": SessionStatus.CREATED,
            "mode": mode.value,
            "is_test_session": spec.is_test,
            "is_mock": spec.is_mock,
            "participant_pseudonym": session.participant,
            "thermal_condition": session.condition,
            "block": block,
            "task": game,
            "notes": notes,
            "environment": environment or {},
            "created_wallclock": datetime.now().astimezone().isoformat(),
            "ended_wallclock": None,
            "clock": clock_info or {},
            "modalities": {},
            "software": software_versions(game_project_dir),
            "config": config_snapshot or {},
            "status_reasons": [],
        }
        session.save()
        return session

    def list_sessions(self) -> list[dict[str, Any]]:
        rows = []
        if not self.output_root.is_dir():
            return rows
        for d in sorted(self.output_root.glob("session_*")):
            try:
                m = json.loads((d / "metadata.json").read_text(encoding="utf-8"))
            except (OSError, ValueError):
                m = {}
            rows.append({"dir": str(d), "status": m.get("status", "?"), "mode": m.get("mode", "?"),
                         "task": m.get("task"), "is_mock": m.get("is_mock")})
        return rows
