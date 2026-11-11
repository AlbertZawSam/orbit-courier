# Orbit Courier

A 3D space-delivery game. Launch a small probe from a planet, plan burns on a live predicted trajectory, use gravity assists and tugs, and deliver cargo to moons and stations on a fuel budget. Bodies move on orbits, so **launch timing matters**.

**Navigator**, the built-in coach, answers questions from local guides (offline retrieval), live calculators for the current level, an offline route planner, and your own launch log. No LLM, account, or network is needed.

- **Free and offline.** The final build is one `dist/index.html` that works double-clicked with the network off.
- **Procedural everything.** No image, audio, or font files: graphics are geometry, shaders, and canvas textures; sound is synthesized with Web Audio.
- **Preview equals flight.** The trajectory preview and the live flight call the same `step` function, and a test enforces it.

> **Status: early development.** Session 1 is done (playable core with three levels and the offline Navigator coach). Session 2 has started: the render pipeline with bloom and quality tiers is in. The simulation, levels, graphics, audio, Flight School tutorial, and Navigator are being built in the stages listed in [CLAUDE.md](CLAUDE.md). Sections below describe the target design from [AGENTS.md](AGENTS.md); the roadmap table shows what exists today.

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (Vitest)
npm run build      # knowledge base, single-file build, offline check
npm run preview    # serve the production build
npm run verify     # test + levels + build + offline check (run before calling anything done)
```

To play the built game, open `dist/index.html` directly (double-click). It runs from `file://` with no server.

| Script | What it does |
|---|---|
| `npm run kb` | Builds the Navigator knowledge base from `knowledge/*.md` and validates it |
| `npm run levels` | Replays every stored level solution headlessly; a failing solution fails the build |
| `npm run build` | `kb`, then `vite build`, then `check-offline` |
| `npm run verify` | `test`, `levels`, `build` |
| `npm run shot` | Optional dev tool: screenshots of the built game into `shots/` plus a runtime smoke test (needs `npx playwright install chromium`). Open `dist/index.html#gallery` for the renderer test bench |

## How the game works

1. **Aim.** Drag on the launch pad to set angle and power. The preview line shows the future path.
2. **Plan.** Click the preview to add burn nodes; drag their prograde/retrograde and radial handles. Fuel cost is exactly the delta-v. Slow-motion planning gives you time to think.
3. **Time it.** Moons and stations are on Kepler orbits, so the same launch works only in certain windows. The launch window map (`W`) shows good and bad launch times.
4. **Fly.** Launch and watch gravity do the rest. Missions: orbit a body, rendezvous with a station, soft-land, run gates in order, or deploy a relay.
5. **Learn.** The first time you play, Flight School teaches the controls interactively before any mission. Ask Navigator (`H`) for hints, numbers, a route plan, or a review of your launches.

Planned content: 6 Flight School lessons and 16 levels in five tiers (training, inner, outer, deep, lab), three hazards (asteroid field, solar wind, dark mass), gravity tugs, a relay mission, and a rival ghost race.

## Architecture

```
            +-------------------+         events          +------------------+
 input ---->|   game / state    |------------------------>| audio (Web Audio)|
 (mouse,    |  (event bus,      |------------------------>| tutorial engine  |
  keys,     |   telemetry,      |------------------------>| telemetry / HUD  |
  touch)    |   settings, save) |------------------------>| coach (Navigator)|
            +---------+---------+                          +--------+---------+
                      |                                             |
          pure, deterministic                                 BM25 retrieval,
                      v                                       calculators, planner
            +-------------------+                                   |
            |     src/sim/      |<----------------------------------+
            | rails, gravity,   |   (uses the same step function and calc.js)
            | step, predict,    |
            | missions, planner |
            +---------+---------+
                      | positions, trajectory
                      v
            +-------------------+
            |    src/render/    |   three.js scene, shaders, post-processing
            +-------------------+
```

Rules that keep it honest:

- `src/sim/` and coach logic never import three.js or touch the DOM. They are pure and deterministic, so they can be tested and run in a Web Worker.
- Game code only **emits** events. Audio, tutorial, telemetry, HUD, and coach **subscribe**.
- Physics is planar (x, z) in game units (G = 1) and rendered in 3D. Bodies follow Kepler rails; only the probe is integrated (fixed `DT = 1/120`, leapfrog).

## How the Navigator coach works

Navigator is rule-based and fully local.

1. **Knowledge base.** `knowledge/*.md` holds 55+ short chunks, each with a stable id (such as `OR-004`), tags, and a skill level. `scripts/build-knowledge.mjs` validates them (no duplicate ids, tags required, 250 words maximum) and emits `kb.generated.json`.
2. **Retrieval.** Queries are tokenized, expanded with a synonym map ("too fast" adds escape and overshoot), and ranked with BM25 (title and tags weighted up). Chunks for the current level get a boost. Below a score threshold, Navigator says it does not know and suggests what it can answer. It never invents.
3. **Intents.** A first-match router picks calculator, hint, plan, review, windows, tutorial, knowledge, or out-of-scope.
4. **Calculators.** Circular speed, escape speed, period, vis-viva, and Hohmann transfers are computed from the current level's real numbers, with the formula shown.
5. **Launch log.** Each attempt is recorded locally (key `orbit.telemetry.v1`, never sent anywhere). Findings such as "you crashed into the same moon three times" are generated from it, so the same question gets different answers for different players.
6. **Answers** are extractive, about 120 words, and always end with clickable source ids.

Optional LLM adapters (Ollama at `http://localhost:11434`, WebLLM) exist behind a settings flag, are off by default, and fall back silently to the extractive answer.

## The route planner

Pure, seeded, and time-boxed (about 3 s, cancelable). It samples candidates from the window map, refines the best with coordinate descent or Nelder-Mead, optionally adds one burn node, and **verifies the result with the full simulation**. If no plan completes the mission it returns the closest partial plan and says so. Plans accepted through Assist mode are tagged **Assisted**: 60% payout, no three-star rating.

## Offline guarantees

`scripts/check-offline.mjs` fails the build if `dist/index.html` contains remote scripts, stylesheets, images, CDN or font hosts, remote workers, or a `fetch`/`XMLHttpRequest` to a literal URL other than the single allowed `http://localhost:11434`. There is no analytics, and no telemetry leaves the device.

## Project layout

```
AGENTS.md  CLAUDE.md  README.md  package.json  vite.config.js  index.html
knowledge/   guides for Navigator (Markdown chunks)
scripts/     build-knowledge.mjs  check-offline.mjs  verify-levels.mjs
src/         main.js  styles.css  (sim, render, audio, coach, tutorial, ui ... added per stage)
tests/       Vitest suites
```

The full target layout is in [AGENTS.md](AGENTS.md) section 4.

## Roadmap

Work proceeds in stages; each stage ends green on `npm test`, and each session ends with `npm run verify`.

| Session | Focus | State |
|---|---|---|
| 1 | Playable core and coach: sim, 3D scene, burn nodes, L1-L3, Navigator | Done and verified |
| 2 | Baseline graphics and audio | In progress: Stages 7-11 done (bloom, quality tiers, procedural planets and sky, trajectory ribbon, probe, effects, camera modes and replay, core audio) |
| 3 | 12 levels, progression, Flight School T1-T4, coach completion | Not started |
| 4 | Premium graphics and audio (eclipses, lensing, spatial sound, orchestra) | Not started |
| 5 | Window map, planner, tugs, relay, flight report, audio-only mode, Flight School T5-T6 | Not started |



[MIT](LICENSE)
