"""ExperimentController: one session, start to finish.

    create session -> preflight (all required checks must pass)
      -> start camera (confirmed) -> start Shimmer (confirmed)
      -> launch game, wait for its result (or --no-game duration)
      -> stop Shimmer (finalized) -> stop camera (file verified)
      -> sync report, status, validation, manifest

Acquisition starts before the game and stops after it, so the recordings
bracket every game event. Ctrl+C at any time stops acquisition cleanly and
marks the session ABORTED; nothing recorded so far is discarded.
"""

from __future__ import annotations

import logging
import shutil
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from . import __version__
from .adapters.base import AcquisitionAdapter, AcquisitionError, CheckResult
from .adapters.game import GameAdapter
from .adapters.mock import MockCameraAdapter
from .adapters.obs_camera import OBSCameraAdapter
from .adapters.shimmer import ShimmerAdapter
from .clock import Clock, iso_from_unix
from .config import Config
from .events import EventLogger
from .modes import MODE_SPECS, Mode
from .server import ControllerServer, GameLink
from .session import Session, SessionManager, SessionStatus, write_json_atomic
from .sync import SyncManager
from .validation import build_manifest, validate_session

log = logging.getLogger("experiment")


@dataclass
class RunOptions:
    mode: Mode
    participant: str
    condition: str
    game: str | None
    block: str = "1"
    notes: str = ""
    environment: dict[str, Any] = field(default_factory=dict)
    duration_s: float | None = None  # only with game=None
    open_browser: bool = True
    allow_stale_build: bool = False
    # Returns True/False for "is the thermal camera recording?"; None = not asked.
    thermal_confirm: Callable[[], bool] | None = None
    thermal_confirm_source: str = "interactive prompt"


def build_adapters(config: Config, mode: Mode) -> dict[str, AcquisitionAdapter]:
    spec = MODE_SPECS[mode]
    adapters: dict[str, AcquisitionAdapter] = {}
    if spec.camera == "obs":
        adapters["camera"] = OBSCameraAdapter(config.section("obs"), config.obs_password())
    elif spec.camera == "mock":
        adapters["camera"] = MockCameraAdapter()
    if spec.shimmer:
        sh = dict(config.section("shimmer"))
        adapters["shimmer"] = ShimmerAdapter(sh, config.python_for("shimmer"),
                                             config.path(sh.get("recorder_script", "Shimmer/shimmer_recorder.py")),
                                             simulated=spec.shimmer == "simulated")
    return adapters


class ExperimentController:
    def __init__(self, config: Config, options: RunOptions,
                 adapters: dict[str, AcquisitionAdapter] | None = None,
                 out: Callable[[str], None] = print) -> None:
        self.config = config
        self.opt = options
        self.spec = MODE_SPECS[options.mode]
        self.out = out
        if options.game is None and options.duration_s is None:
            raise ValueError("either a game or a duration (--no-game --duration) is required")
        if options.game is not None and options.game not in config.games:
            raise ValueError(f"unknown game {options.game!r}; configured: {', '.join(config.games)}")
        self.game = GameAdapter(options.game, config.games[options.game], config.path) if options.game else None
        self.adapters = adapters if adapters is not None else build_adapters(config, options.mode)
        self.started: list[str] = []
        self.modality_errors: dict[str, list[str]] = {}
        self.reasons: list[str] = []
        self.sync = SyncManager()
        self.server: ControllerServer | None = None
        self.link: GameLink | None = None
        self.session: Session | None = None
        self.events: EventLogger | None = None
        self._stop_watchdog = threading.Event()
        self._health: dict[str, bool] = {}
        self._log_handler: logging.Handler | None = None

    # ── status providers for the HTTP server ────────────────────────────────
    def acquisition_status(self) -> dict[str, Any]:
        mods = {}
        for name in ("camera", "shimmer"):
            a = self.adapters.get(name)
            mods[name] = {"required": a is not None, **(a.status_dict() if a else {"state": "NOT_ENABLED"}),
                          "confirmed": name in self.started and self._health.get(name, True)}
        return {"session_id": self.session.session_id if self.session else None, "mode": self.opt.mode.value,
                "is_mock": self.spec.is_mock, "modalities": mods,
                "all_required_confirmed": all(m["confirmed"] for m in mods.values() if m["required"])}

    def shimmer_bridge_status(self) -> dict[str, Any]:
        """Same shape as ShimmerStatusResponse in ODD-ONE-OUT/src/acquisition/shimmerController.ts."""
        a = self.adapters.get("shimmer")
        if a is None:
            return {"status": "DEVICE_DISCONNECTED", "device_connected": False, "sensor_config": None, "output_file": None,
                    "error": f"Shimmer is not enabled in mode {self.opt.mode.value}", "bridge_version": f"experiment-controller {__version__}"}
        streaming = a.state == "STREAMING" and self._health.get("shimmer", True)
        return {"status": "RECORDING" if streaming else ("ERROR" if a.state == "ERROR" else "IDLE"),
                "device_connected": streaming, "sensor_config": getattr(a, "device_info", None), "output_file": None,
                "error": a.last_error, "bridge_version": f"experiment-controller {__version__}", "simulated": a.is_mock}

    # ── main entry ──────────────────────────────────────────────────────────
    def run(self) -> Session:
        opt = self.opt
        clock = Clock()
        manager = SessionManager(self.config.output_root)
        self.session = session = manager.create(
            mode=opt.mode, participant=opt.participant, condition=opt.condition, game=opt.game, block=opt.block,
            notes=opt.notes, environment=opt.environment, config_snapshot=self.config.snapshot(),
            clock_info=clock.describe(), game_project_dir=self.game.project_dir if self.game else None)
        session.update(game_expected=self.game is not None, duration_s=opt.duration_s)
        self._attach_log(session.log_path)
        self.events = events = EventLogger(session.events_path, session.session_id, clock)
        events.log("SESSION_CREATED", {"mode": opt.mode.value, "participant": session.participant, "condition": session.condition,
                                       "task": opt.game, "is_mock": self.spec.is_mock, "is_test": self.spec.is_test})
        self._banner()
        aborted = False
        try:
            for name, adapter in self.adapters.items():
                adapter.bind(events, session.dir(name))
            if not self._preflight():
                self._set_status(SessionStatus.PREFLIGHT_FAILED)
                return session
            self._set_status(SessionStatus.RUNNING)
            self._start_acquisition()
            threading.Thread(target=self._watchdog, name="watchdog", daemon=True).start()
            if self.game:
                aborted = self._run_game()
            else:
                aborted = self._run_duration(opt.duration_s or 0)
        except AcquisitionError as exc:
            self.reasons.append(f"acquisition start failed: {exc}")
            self._set_status(SessionStatus.FAILED)
        except KeyboardInterrupt:
            aborted = True
            events.log("SESSION_ABORTED", {"by": "operator (Ctrl+C)"}, status="warning")
            self.reasons.append("aborted by operator")
        except Exception as exc:
            log.exception("unexpected controller error")
            events.log("CONTROLLER_ERROR", {"error": repr(exc)}, status="error")
            self.reasons.append(f"controller error: {exc!r}")
            self._set_status(SessionStatus.FAILED)
        finally:
            self._shutdown(aborted)
        return session

    # ── phases ──────────────────────────────────────────────────────────────
    def _preflight(self) -> bool:
        events, session = self.events, self.session
        events.log("PREFLIGHT_STARTED", {})
        results: list[CheckResult] = [self._disk_check()]
        if self.game:
            results.append(self.game.preflight(self.opt.allow_stale_build))
            results.append(self._start_server())
        for adapter in self.adapters.values():
            try:
                results.append(adapter.preflight())
            except Exception as exc:  # adapter bug or device API exception
                results.append(CheckResult(adapter.modality, False, f"preflight raised {exc!r}"))
        thermal = self._thermal_check()
        if thermal:
            results.append(thermal)
        self.out("\nPreflight:")
        for r in results:
            self.out(f"  [{'PASS' if r.ok else ('FAIL' if r.required else 'WARN')}] {r.name}: {r.message}")
            events.log("PREFLIGHT_RESULT", r.to_dict(), status="ok" if r.ok else "error")
        session.update(preflight=[r.to_dict() for r in results])
        failed = [r for r in results if r.required and not r.ok]
        if failed:
            self.reasons += [f"preflight failed: {r.name}: {r.message}" for r in failed]
            events.log("PREFLIGHT_FAILED", {"failed": [r.name for r in failed]}, status="error")
            self.out(f"\nPREFLIGHT FAILED - nothing was recorded. Fix: {', '.join(r.name for r in failed)}")
            return False
        events.log("PREFLIGHT_PASSED", {})
        return True

    def _disk_check(self) -> CheckResult:
        need = float(self.config.section("paths").get("min_free_disk_gb", 5))
        free = shutil.disk_usage(self.session.root).free / 1e9
        return CheckResult("disk", free >= need, f"{free:.1f} GB free at {self.session.root.parent} (need {need:g} GB)",
                           {"free_gb": round(free, 2)})

    def _thermal_check(self) -> CheckResult | None:
        if self.opt.mode is not Mode.FULL_MULTIMODAL or self.config.section("thermal_camera").get("mode", "manual") != "manual":
            return None
        if self.opt.thermal_confirm is None:
            return CheckResult("thermal_camera", False, "operator confirmation required but no prompt available")
        answer = bool(self.opt.thermal_confirm())
        self.events.log("THERMAL_CAMERA_OPERATOR_CONFIRMATION", {"confirmed_recording": answer, "source": self.opt.thermal_confirm_source,
                                                                 "note": "Fluke camera is not controlled by this software"})
        self.session.update_modality("thermal_camera", controlled_by_software=False, operator_confirmed_recording=answer,
                                     confirmation_source=self.opt.thermal_confirm_source,
                                     confirmed_wallclock=self.events.clock.wall_iso())
        return CheckResult("thermal_camera", answer, "operator confirmed Fluke recording" if answer else "operator did NOT confirm Fluke recording")

    def _start_server(self) -> CheckResult:
        scfg = self.config.section("server")
        sync_cfg = self.config.section("sync")
        context = {
            "session_id": self.session.session_id, "participant_id": self.session.participant,
            "thermal_condition": self.session.condition, "block_id": self.session.block, "task": self.opt.game,
            "mode": self.opt.mode.value, "is_mock": self.spec.is_mock, "is_test_session": self.spec.is_test,
            "notes": self.opt.notes, "environment": self.opt.environment, "controller_version": __version__,
            "modalities_required": {"camera": self.spec.camera is not None, "shimmer": self.spec.shimmer is not None},
            "sync": {"enabled": bool(sync_cfg.get("enabled", True)), "pattern_ms": sync_cfg.get("pattern_ms", [300, 300, 300, 300, 900]),
                     "size_px": sync_cfg.get("size_px", 140), "position": sync_cfg.get("position", "top-left")},
        }
        self.link = GameLink(self.session, self.events, self.sync, context, {self.game.key: self.game.dist_dir},
                             self.acquisition_status, self.shimmer_bridge_status)
        try:
            self.server = ControllerServer(scfg.get("host", "127.0.0.1"), int(scfg.get("port", 8765)), self.link)
        except OSError as exc:
            return CheckResult("server", False, str(exc))
        self.server.start()
        context["game_url"] = self.game.url(self.server.base_url, self.session.session_id)
        return CheckResult("server", True, f"listening on {self.server.base_url}")

    def _start_acquisition(self) -> None:
        for name in ("camera", "shimmer"):
            adapter = self.adapters.get(name)
            if adapter is None:
                continue
            self.out(f"Starting {name}...")
            info = adapter.start()  # raises AcquisitionError unless confirmed
            self.started.append(name)
            self._health[name] = True
            self.session.update_modality(name, **info, state=adapter.state)
            self.out(f"  {name} confirmed: {adapter.status_line()}")
        self.sync.anchor("acquisition_confirmed_wallclock", self.events.clock.wall_iso())
        self.events.log("ACQUISITION_CONFIRMED", {"modalities": self.started})

    def _run_game(self) -> bool:
        assert self.game and self.link and self.server
        url = self.link.context["game_url"]
        self.events.log("GAME_LAUNCH_REQUESTED", {"url": url}, task=self.game.key)
        self.out(f"\nGame URL: {url}")
        if self.opt.open_browser:
            how = self.game.launch(url, self.config.section("browser").get("command") or None)
            self.out(f"Opened in {how}. Press Ctrl+C to abort the session.")
        scfg = self.config.section("session")
        deadline = time.monotonic() + float(scfg.get("max_game_duration_s", 3600))
        hb_timeout = float(scfg.get("heartbeat_timeout_s", 15))
        status_every = float(scfg.get("status_print_interval_s", 10))
        launched, last_print, hb_lost, warned_unconnected = time.monotonic(), 0.0, False, False
        while not self.link.result_event.wait(0.5):
            now = time.monotonic()
            hb = self.link.last_heartbeat
            if hb is None and not warned_unconnected and now - launched > 60:
                warned_unconnected = True
                self.events.log("GAME_NOT_CONNECTED", {"after_s": 60, "url": url}, status="warning")
                self.out(f"WARNING: the game has not connected after 60 s. Open {url} manually.")
            if hb is not None and now - hb > hb_timeout and not hb_lost:
                hb_lost = True
                self.events.log("GAME_HEARTBEAT_LOST", {"seconds_since": round(now - hb, 1)}, status="warning", task=self.game.key)
                self.out("WARNING: game heartbeat lost (tab closed or browser frozen?). Acquisition continues; Ctrl+C to abort.")
            elif hb is not None and now - hb <= hb_timeout and hb_lost:
                hb_lost = False
                self.events.log("GAME_HEARTBEAT_RESTORED", {}, task=self.game.key)
            if now - last_print >= status_every:
                last_print = now
                self._print_status()
            if now > deadline:
                self.events.log("GAME_TIMEOUT", {"max_game_duration_s": scfg.get("max_game_duration_s")}, status="error")
                self.reasons.append("game did not finish within max_game_duration_s")
                return False
        result = self.link.result or {}
        self.out(f"Game finished: status={result.get('status')} trials={result.get('trial_count')}")
        sync = self.link.context.get("sync") or {}
        if sync.get("enabled"):
            # The game shows the session_end flash after delivering its result; keep recording until it is done.
            wait_s = sum(sync.get("pattern_ms") or []) / 1000.0 + 3.0
            if not self.link.end_sync_done.wait(wait_s):
                self.events.log("SYNC_END_SEQUENCE_MISSING", {"waited_s": wait_s}, status="warning")
        if result.get("status") == "aborted":
            self.reasons.append("game aborted by participant/operator (ESC or fullscreen exit)")
            return True
        return False

    def _run_duration(self, seconds: float) -> bool:
        self.out(f"Recording for {seconds:g} s without a game (Ctrl+C to stop early)...")
        self.events.log("NO_GAME_RECORDING", {"duration_s": seconds})
        end = time.monotonic() + seconds
        last = 0.0
        while time.monotonic() < end:
            time.sleep(0.25)
            if time.monotonic() - last >= float(self.config.section("session").get("status_print_interval_s", 10)):
                last = time.monotonic()
                self._print_status()
        return False

    def _watchdog(self) -> None:
        interval = float(self.config.section("session").get("watchdog_interval_s", 3))
        while not self._stop_watchdog.wait(interval):
            for name in list(self.started):
                adapter = self.adapters[name]
                try:
                    res = adapter.health()
                except Exception as exc:
                    res = CheckResult(name, False, f"health check raised {exc!r}")
                was_ok = self._health.get(name, True)
                self._health[name] = res.ok
                if was_ok and not res.ok:
                    self.modality_errors.setdefault(name, []).append(f"{self.events.clock.wall_iso()} {res.message}")
                    self.events.log("DEVICE_ERROR", {"device": name, "error": res.message, "during": "recording"}, status="error")
                    self.out(f"\n!!! {name.upper()} PROBLEM: {res.message} !!!\n")
                elif not was_ok and res.ok:
                    self.events.log("DEVICE_RECOVERED", {"device": name, "message": res.message}, status="warning")
                    self.out(f"{name} recovered: {res.message}")

    def _print_status(self) -> None:
        parts = [f"{n}: {self.adapters[n].status_line()}" for n in self.adapters]
        if self.link:
            parts.append(f"game: {self.link.screen or 'not connected'} ({self.link.events_received} events)")
        self.out("[status] " + " | ".join(parts))

    # ── shutdown / finalisation ─────────────────────────────────────────────
    def _shutdown(self, aborted: bool) -> None:
        session, events = self.session, self.events
        self._stop_watchdog.set()
        if self.link and not self.link.result_event.is_set() and self.game and self.started:
            self.link.result_event.wait(2.0)  # a result may be in flight
        for name in ("shimmer", "camera"):  # camera last: video covers everything
            if name not in self.started:
                continue
            adapter = self.adapters[name]
            self.out(f"Stopping {name}...")
            try:
                info = adapter.stop()
            except KeyboardInterrupt:
                info = {"error": "stop interrupted by operator"}
                self.reasons.append(f"{name}: stop interrupted")
            except Exception as exc:
                log.exception("stop failed for %s", name)
                info = {"error": repr(exc)}
                self.reasons.append(f"{name}: stop failed: {exc!r}")
            verified = (info.get("verification") or {}).get("ok")
            if not verified:
                self.reasons.append(f"{name}: output not verified")
            self.session.update_modality(name, **info, state=adapter.state, errors_during_recording=self.modality_errors.get(name, []))
            self.out(f"  {name}: {adapter.state}, verified={verified}")
        for adapter in self.adapters.values():
            try:
                adapter.close()
            except Exception:
                log.exception("close failed")
        if self.server:
            self.server.stop()
        if self.link:
            session.update_modality("game", task=self.opt.game, connected=self.link.connected_at is not None,
                                    events_received=self.link.events_received, result=self.link.result)
            if self.started and self.game and self.link.result is None:
                self.reasons.append("no game result received")
        for name, errs in self.modality_errors.items():
            self.reasons.append(f"{name}: {len(errs)} error(s) during recording")

        status = session.metadata.get("status")
        if status == SessionStatus.RUNNING:
            if aborted:
                status = SessionStatus.ABORTED
            elif self.reasons:
                status = SessionStatus.INCOMPLETE
            else:
                status = SessionStatus.COMPLETE
        write_json_atomic(session.root / "sync_report.json", self.sync.report())
        session.update(status=status, status_reasons=self.reasons, ended_wallclock=iso_from_unix(time.time()),
                       event_counts=events.counts, event_write_failures=events.write_failures)
        events.log("SESSION_FINALIZED", {"status": status, "reasons": self.reasons})
        events.close()
        validation = validate_session(session.root)
        if not validation["passed"] and status == SessionStatus.COMPLETE:
            status = SessionStatus.INCOMPLETE
            self.reasons.append("validation failed")
            session.update(status=status, status_reasons=self.reasons)
            validation = validate_session(session.root)
        manifest = build_manifest(session.root, validation)
        self._report(status, validation, manifest)
        self._detach_log()

    def _set_status(self, status: str) -> None:
        self.session.update(status=status)

    def _report(self, status: str, validation: dict, manifest: dict) -> None:
        self.out("\n" + "=" * 70)
        tag = " [MOCK - NOT REAL DATA]" if self.spec.is_mock else (" [TEST SESSION]" if self.spec.is_test else "")
        self.out(f"Session {self.session.session_id}: {status}{tag}")
        for r in self.reasons:
            self.out(f"  - {r}")
        failed = [c for c in validation["checks"] if not c["ok"]]
        self.out(f"Validation: {'PASSED' if validation['passed'] else 'FAILED'} ({len(validation['checks'])} checks, {len(failed)} not ok)")
        for c in failed:
            self.out(f"  [{'FAIL' if c['required'] else 'WARN'}] {c['check']} {c['message']}")
        self.out(f"Files: {len(manifest['files'])} in {self.session.root}")
        self.out("=" * 70)

    def _banner(self) -> None:
        if self.spec.is_mock:
            self.out("\n*** MOCK_INTEGRATION_TEST: mock camera + SIMULATED Shimmer. NO REAL DATA IS RECORDED. ***")
        elif self.spec.is_test:
            self.out(f"\n*** {self.opt.mode.value}: test session, not a research recording. ***")
        self.out(f"Session folder: {self.session.root}")

    def _attach_log(self, path: Path) -> None:
        handler = logging.FileHandler(path, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        handler.setLevel(logging.DEBUG)
        logger = logging.getLogger("experiment")
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        self._log_handler = handler

    def _detach_log(self) -> None:
        if self._log_handler:
            logging.getLogger("experiment").removeHandler(self._log_handler)
            self._log_handler.close()
            self._log_handler = None


def run_preflight_only(config: Config, mode: Mode, game: str | None, allow_stale_build: bool = False,
                       out: Callable[[str], None] = print) -> bool:
    """`python -m experiment check`: no session folder, nothing recorded."""
    results: list[CheckResult] = []
    if game:
        if game not in config.games:
            raise ValueError(f"unknown game {game!r}")
        results.append(GameAdapter(game, config.games[game], config.path).preflight(allow_stale_build))
    for adapter in build_adapters(config, mode).values():
        try:
            results.append(adapter.preflight())
        finally:
            adapter.close()
    out(f"Preflight for {mode.value}:")
    for r in results:
        out(f"  [{'PASS' if r.ok else 'FAIL'}] {r.name}: {r.message}")
        for k, v in r.details.items():
            out(f"        {k}: {v}")
    ok = all(r.ok for r in results if r.required)
    out("ALL REQUIRED CHECKS PASSED" if ok else "PREFLIGHT FAILED")
    return ok
