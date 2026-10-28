"""Session validation and manifest.json generation.

``validate_session`` re-reads the files on disk; it trusts nothing the
controller remembered. It can be run again later:
    python -m experiment validate experiment_output/session_<id>
"""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .events import COLUMNS as EVENT_COLUMNS
from .modes import MODE_SPECS, Mode
from .session import write_json_atomic

ROLES = [
    ("metadata.json", "session metadata"),
    ("events.csv", "central event log"),
    ("manifest.json", "this manifest"),
    ("sync_report.json", "clock/synchronisation report"),
    ("logs/", "controller log"),
    ("camera/MOCK_", "MOCK camera metadata (no video)"),
    ("camera/camera_metadata.json", "camera metadata"),
    ("camera/", "RGB video recording"),
    ("shimmer/MOCK_", "SIMULATED Shimmer data (not real)"),
    ("shimmer/raw_data.csv", "Shimmer raw samples"),
    ("shimmer/shimmer_metadata.json", "Shimmer metadata"),
    ("shimmer/recorder_stderr.log", "Shimmer recorder diagnostics"),
    ("games/", "game output"),
    ("processing/", "derived features (post-processing)"),
]


def role_for(rel: str) -> str:
    for prefix, role in ROLES:
        if rel == prefix or (prefix.endswith("/") and rel.startswith(prefix)) or (prefix.endswith("_") and rel.startswith(prefix)):
            return role
    return "other"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        return list(reader.fieldnames or []), rows


class _Checks:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def add(self, name: str, ok: bool, message: str = "", required: bool = True) -> bool:
        self.items.append({"check": name, "ok": bool(ok), "required": required, "message": message})
        return ok

    @property
    def passed(self) -> bool:
        return all(i["ok"] for i in self.items if i["required"])


def validate_session(root: Path) -> dict[str, Any]:
    root = Path(root)
    c = _Checks()
    try:
        meta = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
        c.add("metadata.json readable", True)
    except (OSError, ValueError) as exc:
        c.add("metadata.json readable", False, str(exc))
        return {"passed": False, "checks": c.items}

    mode = Mode(meta.get("mode"))
    spec = MODE_SPECS[mode]
    session_id = meta.get("session_id")
    c.add("mock flag matches mode", bool(meta.get("is_mock")) == spec.is_mock)

    # events.csv
    ev_path = root / "events.csv"
    if c.add("events.csv exists", ev_path.is_file()):
        header, rows = _csv_rows(ev_path)
        c.add("events.csv header", header == EVENT_COLUMNS, f"got {header[:4]}...")
        seqs = [int(r["event_seq"]) for r in rows if r.get("event_seq", "").isdigit()]
        c.add("events.csv sequence 1..n without gaps", seqs == list(range(1, len(rows) + 1)), f"{len(rows)} rows")
        c.add("events.csv session_id consistent", all(r["session_id"] == session_id for r in rows))
        types = {r["event_type"] for r in rows}
        c.add("SESSION_CREATED logged", "SESSION_CREATED" in types)
        c.add("SESSION_FINALIZED logged", "SESSION_FINALIZED" in types, required=meta.get("status") != "RUNNING")
        errors = [r for r in rows if r["status"] == "error"]
        c.add("no error events", not errors, f"{len(errors)} error events", required=False)

    modalities = meta.get("modalities", {})
    status = meta.get("status")
    recorded = status not in ("PREFLIGHT_FAILED",)

    # camera
    if spec.camera and recorded:
        cam = modalities.get("camera", {})
        if spec.camera == "mock":
            c.add("MOCK camera metadata present", (root / "camera" / "MOCK_camera_metadata.json").is_file())
        else:
            c.add("camera_metadata.json present", (root / "camera" / "camera_metadata.json").is_file())
            ver = cam.get("verification") or {}
            p = Path(ver.get("path") or "")
            exists = bool(ver.get("path")) and p.is_file()
            c.add("video file exists and is non-empty", exists and p.stat().st_size > 0, str(p))
            c.add("video verified at stop (stable size, decodable)", bool(ver.get("ok")), ver.get("reason", ""))
            c.add("video inside session folder", bool(ver.get("inside_session_folder")),
                  "OBS default directory used; see camera_metadata.json output_path", required=False)
    elif not spec.camera:
        c.add("no camera files in camera-less mode", not any((root / "camera").glob("*")), required=False)

    # shimmer
    if spec.shimmer and recorded:
        name = "MOCK_raw_data.csv" if spec.shimmer == "simulated" else "raw_data.csv"
        meta_name = "MOCK_shimmer_metadata.json" if spec.shimmer == "simulated" else "shimmer_metadata.json"
        raw = root / "shimmer" / name
        if c.add(f"shimmer/{name} exists", raw.is_file()):
            header, rows = _csv_rows(raw)
            c.add("shimmer samples present", len(rows) > 0, f"{len(rows)} samples")
            host = [float(r["host_unix_ms"]) for r in rows if r.get("host_unix_ms")]
            c.add("shimmer host timestamps non-decreasing", all(b >= a for a, b in zip(host, host[1:])))
            mpath = root / "shimmer" / meta_name
            if c.add(f"shimmer/{meta_name} exists", mpath.is_file()):
                smeta = json.loads(mpath.read_text(encoding="utf-8"))
                c.add("shimmer metadata sample_count matches file", smeta.get("sample_count") == len(rows))
                c.add("shimmer simulated flag matches mode", bool(smeta.get("simulated")) == (spec.shimmer == "simulated"))
    if not spec.is_mock:
        mocks = [str(p.relative_to(root)) for p in root.rglob("MOCK_*")]
        c.add("no MOCK files in a non-mock session", not mocks, ", ".join(mocks))

    # game
    task = meta.get("task")
    if task and recorded and meta.get("game_expected", True):
        gdir = root / "games" / task
        trials = gdir / "trials.csv"
        if c.add(f"games/{task}/trials.csv exists", trials.is_file(), required=status in ("COMPLETE",)):
            _, rows = _csv_rows(trials) if trials.stat().st_size else ([], [])
            c.add("trial rows present", len(rows) > 0, f"{len(rows)} trials", required=status == "COMPLETE")
            sid_cols = [r.get("session_id") for r in rows if "session_id" in r]
            c.add("trials carry the controller session_id", all(s == session_id for s in sid_cols),
                  "game session_id differs" if sid_cols else "no session_id column", required=bool(sid_cols))
        c.add(f"games/{task}/summary.json exists", (gdir / "summary.json").is_file(), required=status == "COMPLETE")

    return {"passed": c.passed, "validated_wallclock": datetime.now().astimezone().isoformat(), "checks": c.items}


def build_manifest(root: Path, validation: dict[str, Any] | None = None) -> dict[str, Any]:
    root = Path(root)
    meta = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
    files = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.name in ("manifest.json",) or p.suffix == ".tmp":
            continue
        rel = p.relative_to(root).as_posix()
        files.append({"path": rel, "role": role_for(rel), "bytes": p.stat().st_size, "sha256": sha256(p)})
    external = []
    ver = (meta.get("modalities", {}).get("camera", {}) or {}).get("verification") or {}
    if ver.get("path") and not ver.get("inside_session_folder"):
        p = Path(ver["path"])
        external.append({"path": str(p), "role": "RGB video recording (outside session folder)",
                         "bytes": p.stat().st_size if p.is_file() else None, "sha256": sha256(p) if p.is_file() else None})
    manifest = {
        "session_id": meta.get("session_id"),
        "status": meta.get("status"),
        "mode": meta.get("mode"),
        "is_mock": meta.get("is_mock"),
        "is_test_session": meta.get("is_test_session"),
        "generated_wallclock": datetime.now().astimezone().isoformat(),
        "files": files,
        "external_files": external,
        "validation": validation,
    }
    write_json_atomic(root / "manifest.json", manifest)
    return manifest
