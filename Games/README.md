# Games

| Key | Folder | Task |
|---|---|---|
| `nogo` | `NO-GO/` | Go/No-Go colour inhibition (details: `NO-GO/README.md`) |
| `odd_one_out` | `ODD-ONE-OUT/` | 4×4 odd-one-out symbol selection |

No Simon task exists yet. To add a game: put it in its own folder, copy
`src/integration/` from NO-GO, wire it as in `NO-GO/src/App.tsx` (search
"Experiment-controller integration"), set `base: './'` in `vite.config.ts`, and
add a `[games.<key>]` section to `config/experiment_config.toml`.

```powershell
cd NO-GO; npm install; npm test; npm run build      # same for ODD-ONE-OUT
npm run dev                                          # stand-alone at http://localhost:5173
```

**Rebuild after any source change** — the controller serves `dist/` and refuses
a stale build.

`src/integration/` (identical in both games; `tests/test_game_integration.py`
enforces it) is inactive unless the URL contains `?session=<id>`:

* `sessionBridge.ts` — session context, live event forwarding, heartbeat, result upload
* `SyncFlash.tsx` — coded corner flash at session start/end
* `OrchestratorBanner.tsx` — operator status strip (hidden during trials)

ODD-ONE-OUT's `src/acquisition/` (browser OBS client, Shimmer bridge client)
is still used when it runs stand-alone; under the controller its readiness
screen asks the controller instead. Testing: [../docs/GAME_TESTING.md](../docs/GAME_TESTING.md).
