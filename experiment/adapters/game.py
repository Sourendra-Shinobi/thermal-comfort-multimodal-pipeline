"""Browser game launch.

The controller serves the game's production build (``dist/``) itself, so the
page and the API share one origin. The game detects orchestration from the
``?session=`` query parameter (src/integration/sessionBridge.ts).
"""

from __future__ import annotations

import subprocess
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .base import CheckResult


def newest_mtime(folder: Path) -> float:
    return max((p.stat().st_mtime for p in folder.rglob("*") if p.is_file()), default=0.0)


class GameAdapter:
    def __init__(self, key: str, cfg: dict[str, Any], resolve) -> None:
        self.key = key
        self.label = cfg.get("label", key)
        self.dist_dir: Path = resolve(cfg["dist_dir"])
        self.project_dir: Path | None = resolve(cfg["project_dir"]) if cfg.get("project_dir") else None

    def preflight(self, allow_stale_build: bool = False) -> CheckResult:
        index = self.dist_dir / "index.html"
        if not index.is_file():
            return CheckResult(f"game/{self.key}", False,
                               f"{index} missing - build it: cd {self.project_dir} && npm run build")
        html = index.read_text(encoding="utf-8", errors="replace")
        if 'src="/assets' in html or 'href="/assets' in html:
            return CheckResult(f"game/{self.key}", False,
                               "dist/ was built with absolute asset paths (old vite config); rebuild with npm run build")
        details: dict[str, Any] = {"dist_dir": str(self.dist_dir)}
        if self.project_dir and (self.project_dir / "src").is_dir():
            src_m, dist_m = newest_mtime(self.project_dir / "src"), index.stat().st_mtime
            details["build_is_stale"] = src_m > dist_m
            if src_m > dist_m:
                msg = f"dist/ is older than src/ - rebuild: cd {self.project_dir} && npm run build"
                return CheckResult(f"game/{self.key}", allow_stale_build, msg + (" (allowed by --allow-stale-build)" if allow_stale_build else ""),
                                   details)
        return CheckResult(f"game/{self.key}", True, f"{self.label}: build present", details)

    def url(self, base_url: str, session_id: str) -> str:
        return f"{base_url}/games/{self.key}/index.html?session={quote(session_id)}"

    @staticmethod
    def launch(url: str, browser_command: list[str] | None = None) -> str:
        if browser_command:
            cmd = [part.replace("{url}", url) for part in browser_command]
            if not any("{url}" in part for part in browser_command):
                cmd.append(url)
            subprocess.Popen(cmd)
            return " ".join(cmd)
        webbrowser.open(url, new=1)
        return "system default browser"
