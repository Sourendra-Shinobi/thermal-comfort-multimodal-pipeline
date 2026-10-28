"""Operator command line.  Run from the project root (BTP_2026/):

    python -m experiment modes
    python -m experiment check --mode FULL_MULTIMODAL --game nogo
    python -m experiment run   --mode FULL_MULTIMODAL --game nogo --participant P001 --condition Warm --air-temp 30.5
    python -m experiment run   --mode CAMERA_GAME_TEST --no-game --duration 20 --participant TEST
    python -m experiment validate experiment_output/session_<id>
    python -m experiment postprocess experiment_output/session_<id>
    python -m experiment list
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import Config, ConfigError
from .controller import ExperimentController, RunOptions, run_preflight_only
from .modes import MODE_SPECS, Mode, parse_mode
from .postprocess import PostprocessError, run_postprocess
from .session import SessionManager
from .validation import build_manifest, validate_session


def _ask_thermal() -> bool:
    try:
        answer = input("Is the Fluke thermal camera recording now? Type 'yes' to confirm: ")
    except EOFError:
        return False
    return answer.strip().lower() in ("y", "yes")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m experiment", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, default=None, help="config TOML (default config/experiment_config.toml)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("modes", help="list acquisition modes")
    sub.add_parser("games", help="list configured games")
    sub.add_parser("list", help="list sessions in the output folder")

    p = sub.add_parser("check", help="preflight only; creates no session")
    p.add_argument("--mode", required=True)
    p.add_argument("--game", default=None)
    p.add_argument("--allow-stale-build", action="store_true")

    p = sub.add_parser("run", help="run one session")
    p.add_argument("--mode", required=True)
    p.add_argument("--participant", required=True, help="participant pseudonym, e.g. P001 (no real names)")
    p.add_argument("--condition", required=True, help="thermal condition label, e.g. Cool / Neutral / Warm")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--game", help="game key (see `games`)")
    g.add_argument("--no-game", action="store_true", help="record devices only, for --duration seconds")
    p.add_argument("--duration", type=float, default=None, help="seconds to record with --no-game")
    p.add_argument("--block", default="1")
    p.add_argument("--notes", default="")
    p.add_argument("--air-temp", type=float, default=None, help="measured air temperature (deg C)")
    p.add_argument("--rh", type=float, default=None, help="measured relative humidity (%%)")
    p.add_argument("--env", action="append", default=[], metavar="KEY=VALUE", help="other environmental measurement (repeatable)")
    p.add_argument("--no-browser", action="store_true", help="print the game URL instead of opening a browser")
    p.add_argument("--allow-stale-build", action="store_true", help="accept a game dist/ older than its src/")
    p.add_argument("--thermal-confirmed", action="store_true", help="answer yes to the Fluke prompt without asking (logged as such; scripted tests only)")

    p = sub.add_parser("validate", help="re-validate a session and rewrite manifest.json")
    p.add_argument("session_dir", type=Path)

    p = sub.add_parser("postprocess", help="pose landmarks + behaviour features from the session video")
    p.add_argument("session_dir", type=Path)
    p.add_argument("--sync-roi", default=None, metavar="X,Y,W,H", help="video region showing the sync flash (pixels)")
    p.add_argument("--max-frames", type=int, default=None)

    args = ap.parse_args(argv)
    try:
        config = Config.load(args.config)
    except (ConfigError, OSError, ValueError) as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        return 2

    if args.cmd == "modes":
        for mode, spec in MODE_SPECS.items():
            print(f"{mode.value:24s} camera={spec.camera or '-':5s} shimmer={spec.shimmer or '-':9s} {spec.description}")
        return 0
    if args.cmd == "games":
        for key, gcfg in config.games.items():
            print(f"{key:14s} {gcfg.get('label', '')}  ({gcfg['dist_dir']})")
        return 0
    if args.cmd == "list":
        for row in SessionManager(config.output_root).list_sessions():
            print(f"{row['status']:16s} {row['mode']:22s} {row['task'] or '-':12s} {'MOCK ' if row['is_mock'] else ''}{row['dir']}")
        return 0
    if args.cmd == "check":
        try:
            return 0 if run_preflight_only(config, parse_mode(args.mode), args.game, args.allow_stale_build) else 1
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 2
    if args.cmd == "validate":
        result = validate_session(args.session_dir)
        build_manifest(args.session_dir, result)
        for c in result["checks"]:
            print(f"  [{'PASS' if c['ok'] else ('FAIL' if c['required'] else 'WARN')}] {c['check']} {c['message']}")
        print("VALID" if result["passed"] else "INVALID")
        return 0 if result["passed"] else 1
    if args.cmd == "postprocess":
        try:
            run_postprocess(config, args.session_dir, args.sync_roi, args.max_frames)
        except (PostprocessError, OSError, ValueError) as exc:
            print(f"Post-processing failed: {exc}", file=sys.stderr)
            return 1
        return 0

    # run
    try:
        mode = parse_mode(args.mode)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    if args.no_game and not args.duration:
        print("--no-game requires --duration SECONDS", file=sys.stderr)
        return 2
    env: dict = {}
    if args.air_temp is not None:
        env["air_temperature_c"] = args.air_temp
    if args.rh is not None:
        env["relative_humidity_pct"] = args.rh
    for item in args.env:
        key, _, value = item.partition("=")
        try:
            env[key.strip()] = json.loads(value)
        except ValueError:
            env[key.strip()] = value
    options = RunOptions(
        mode=mode, participant=args.participant, condition=args.condition,
        game=None if args.no_game else args.game, block=args.block, notes=args.notes, environment=env,
        duration_s=args.duration if args.no_game else None, open_browser=not args.no_browser,
        allow_stale_build=args.allow_stale_build,
        thermal_confirm=(lambda: True) if args.thermal_confirmed else _ask_thermal,
        thermal_confirm_source="--thermal-confirmed flag" if args.thermal_confirmed else "interactive prompt",
    )
    try:
        controller = ExperimentController(config, options)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    session = controller.run()
    return 0 if session.metadata.get("status") == "COMPLETE" else 1
