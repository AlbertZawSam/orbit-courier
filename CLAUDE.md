# CLAUDE.md: Orbit Courier (final, consolidated Claude Code workflow)

@AGENTS.md

AGENTS.md is the source of truth for product, stack, schemas, graphics, audio, tutorial, and coach. This file says how to work in Claude Code: order of work, prompts, verification, and time boxes. It supersedes the earlier `CLAUDE.md`.

**Budget:** five sessions of about 3 hours each, plus an optional buffer session. Every session ends with a playable, offline, verified build. Do not start a session until the previous session's `npm run verify` is green. The full scope is large; the cut list at the end says what to drop first.

## How to work

1. Use **plan mode** first for each stage: a short plan, then implement.
2. Finish and verify one stage before starting the next. Commit after each green stage: `stage N: <summary>`.
3. Run `npm test` after every stage. Run `npm run verify` at the end of every session and after any stage that touches levels, the build, workers, or audio.
4. Pure logic first: build and test `src/sim/` and `src/coach/` before the 3D layer depends on them.
5. If a stage runs over its box, apply the cut list instead of skipping tests.
6. Never say a stage is done without pasting passing test output.
7. Ask me before adding any dependency not listed in AGENTS.md.
8. **Look at graphics and listen to audio.** Run `npm run shot` (optional Playwright dev dependency) or ask me for a screenshot, critique against AGENTS.md section 10, iterate at least twice. For audio, write down mix problems and fixes, and ask me to listen with headphones for spatial and mix work.
9. **Flight School is a first-class feature**, not polish: first launch must run it before any mission (AGENTS.md section 12). Do not defer its engine past Session 3.

## Session overview

| Session | Focus | Ends with |
|---|---|---|
| 1 | Playable core and coach | Launch, preview, nodes, 3 levels, working Navigator |
| 2 | Baseline graphics and audio | Good-looking scene, reactive core sound |
| 3 | Missions, levels, progression, **Flight School engine and T1-T4**, coach completion | Complete 12-level game with a tutorial that plays first |
| 4 | Premium graphics and audio | Eclipses, lensing, flow field, spatial audio, orchestra |
| 5 | Innovation features and **Flight School T5-T6** | Window map, planner, tugs, relay, reports, audio-only mode, full tutorial |
| 6 (optional) | Buffer and polish | Bug fixes, balance, README, demo, stretch items |

---

## Session 1: Playable core with coach (about 3 h)

| Stage | Time | Goal | Done when |
|---|---|---|---|
| 0 | 0:00-0:10 | Scaffold, scripts, offline checker | Cube renders; build is one HTML; `check-offline` passes |
| 1 | 0:10-0:50 | Pure sim (`src/sim/`) | Rails, leapfrog, predict, calc, deliver_orbit, with tests including **preview equals flight** |
| 2 | 0:50-1:30 | 3D scene and interaction | Star, lit-sphere planets, probe, trail, trajectory line, drag-to-aim, launch, fly |
| 3 | 1:30-1:55 | Burn nodes, slow-mo, fuel | Drag a node; preview updates; fuel drops by exactly `|dv|` |
| 4 | 1:55-2:15 | L1-L3, win/lose, result card, scoring | `npm run levels` green |
| 5 | 2:15-2:55 | Knowledge (25 chunks), BM25, calc, hint, review, panel | Cited answer and calc answer with no LLM |
| 6 | 2:55-3:00 | Verify | `npm run verify` green |

## Session 2: Baseline graphics and audio (about 3 h)

| Stage | Time | Goal |
|---|---|---|
| 7 | 0:00-0:20 | Render pipeline, bloom, grade, quality tiers (Low/Medium/High/Auto) |
| 8 | 0:20-1:00 | Procedural planets (rocky, gas, ice, moons, atmosphere, rings), nebula sky, star corona |
| 9 | 1:00-1:30 | Trajectory ribbon (ticks, pins, dashes), probe model, trail, thruster, crash and delivery bursts |
| 10 | 1:30-1:45 | Camera modes, cinematic launch, replay camera |
| 11 | 1:45-2:35 | Audio engine: thruster, gravity hum, Doppler flyby, target ping, node ticks, time-dilation filter, UI sounds |
| 12 | 2:35-2:55 | Generative music with tension; settings popover; `M` mute |
| 13 | 2:55-3:00 | Verify, screenshots reviewed |

## Session 3: Game completion and Flight School engine (about 3 h)

| Stage | Time | Goal |
|---|---|---|
| 14 | 0:00-0:40 | Missions (rendezvous, soft landing, gate run) and hazards (asteroids, solar wind, dark mass) |
| 15 | 0:40-1:10 | Levels L4-L12 with stored solutions; `npm run levels` green |
| 16 | 1:10-1:30 | Modes, credits, upgrades, level select, saves, lose screen |
| 17 | 1:30-2:20 | **Flight School engine, intro, gating, T1-T4**, overlay, Show me / Do it for me, skip/resume/replay, JIT intro cards |
| 18 | 2:20-2:50 | Coach completion: 40+ chunks, findings, show-me ghost, source drawer, auto-nudge, `tutorial` intent |
| 19 | 2:50-3:00 | Verify; offline `file://` check |

## Session 4: Premium graphics and audio (about 3 h)

| Stage | Time | Goal |
|---|---|---|
| 20 | 0:00-0:30 | Nebula raymarch, auto-exposure, lens flare, god rays, speed dust |
| 21 | 0:30-1:10 | Eclipses, clouds, scattering, ocean glint, auroras, gas giant and ring polish |
| 22 | 1:10-1:40 | Flow field, lensing at the dark mass, orrery orbit lines, marching-dash ribbon shader |
| 23 | 1:40-2:00 | DOF (cinematic only), edge chromatic aberration in slow-mo, grain, sway, split-tone, brass HUD instruments |
| 24 | 2:00-2:30 | HRTF spatial audio, procedural reverb, cockpit/exterior mix, mastering chain, ducking, beat-synced SFX |
| 25 | 2:30-2:55 | Orrery Orchestra, planet timbres, eclipse and dark-mass audio, radio blips |
| 26 | 2:55-3:00 | Verify, screenshots, listening notes |

## Session 5: Innovation features and full tutorial (about 3 h)

| Stage | Time | Goal |
|---|---|---|
| 27 | 0:00-0:35 | Worker infrastructure and the **launch window map** |
| 28 | 0:35-1:20 | **Planner**, Assist mode, `plan`/`explain_plan`/`windows` intents |
| 29 | 1:20-1:35 | **Gravity tugs** and levels L13-L14 |
| 30 | 1:35-2:05 | Probes-as-rails, **relay mission**, **rival ghost**, levels L15-L16 |
| 31 | 2:05-2:30 | **Flight report, postcard, Orbit Song** |
| 32 | 2:30-2:45 | **Audio-only mode**, `aria-live`, haptics |
| 33 | 2:45-3:00 | **Flight School T5-T6**, graduation card; new knowledge chunks (55+); final `npm run verify` |

## Session 6 (optional): Buffer and polish

Balance pass on levels with the planner's efficiency numbers, bug fixes, mobile layout, README and 3-minute demo script, performance tuning, and the stretch Daily route generator.

---

## Staged prompts (copy one at a time)

Each prompt assumes: "Read AGENTS.md and CLAUDE.md first. Work in plan mode, then implement. Run `npm run verify` and paste the output."

### Stage 0
```
Scaffold per AGENTS.md sections 3-5: Vite, vite-plugin-singlefile, three (pinned), vitest, scripts, and
scripts/check-offline.mjs (section 18). Show a lit rotating cube. Confirm the build is one HTML file and
passes check-offline.
```

### Stage 1
```
Implement src/sim/ per AGENTS.md section 7 with no three.js imports: constants, rails (Kepler, Newton),
gravity, probe step (leapfrog, fixed DT), predict, calc, and deliver_orbit. Tests: orbit returns after one
period, energy drift under 0.5%, softening avoids NaN, calc values, and the critical test: preview
positions equal live flight positions at the same steps.
```

### Stage 2
```
Build the 3D layer with lit spheres: scene, camera, planets (simple), probe, trail, and a trajectory line
from sim/predict. Add input: drag on the launch pad to set angle and power with a live preview; launch and
fly using the same step function. Basic HUD (fuel, speed, mission). Keep sim and render decoupled through
the event bus.
```

### Stage 3
```
Implement burn nodes (click the preview to add, drag prograde/retrograde and radial handles, dv readout),
nodes included in predict and applied during flight, and slow-motion planning with a per-level budget.
Tests: nodes change the predicted path; fuel cost is exactly |dv|.
```

### Stage 4
```
Implement levels L1-L3 per section 8 with stored solutions, hints, tags, and par; scripts/verify-levels.mjs
to replay solutions headlessly; win/crash/lost detection; scoring with stars; and the result card. Add
npm run levels. If a solution fails, fix the level design, not the test.
```

### Stage 5
```
Write the first 25 knowledge chunks (section 16.1), build-knowledge.mjs with validation, tokenize/bm25/
retrieve (synonyms, boosts, threshold), calc-intent from sim/calc with current level data, hint tiers,
review with launch-log findings, telemetry per section 15 (tutorial attempts excluded from summarize),
and the coach panel with citations and quick buttons. Tests per section 19.
```

### Stage 7
```
Implement quality.js and post.js per 10.2 and 10.4: composer with bloom, grade/vignette, tiers
Low/Medium/High/Auto with a 2-second frame-time downgrade and a notice. Respect prefers-reduced-motion.
Low must still look good. Report frame times per tier.
```

### Stage 8
```
Implement procedural planets, sky, and star per 10.3 using the palette in 10.1: rocky (fbm, craters,
terminator, home-world night lights), gas giants (animated bands, storm), ice, moons, atmosphere
fresnel, banded rings, twinkling starfield, nebula, and star corona. No textures. Screenshot with
npm run shot and critique; iterate twice.
```

### Stage 9
```
Implement the trajectory ribbon (solid safe, dashed danger, per-second ticks, closest-approach pins with
labels, periapsis/apoapsis markers, pulsing target band), probe model with nav lights, speed-colored
trail, instanced thruster particles, and photosensitivity-safe crash and delivery bursts. Screenshot and
iterate on legibility.
```

### Stage 10
```
Implement camera modes: cinematic launch (3 s), follow, limited orbit, planet focus, replay camera,
slow-mo FOV kick. All damped; reduced motion disables shake and FOV kick. Add a replay button on the
result card.
```

### Stage 11
```
Implement src/audio/ per section 11: engine and bus graph, dsp helpers, thruster, gravity hum (two
nearest bodies, log-acceleration pitch quantized to pentatonic), Doppler flyby swoosh, target ping, node
ticks, low-fuel pulse, orbit-lock shimmer, crash and delivery cues, time-dilation lowpass, and UI sounds,
all driven by the event bus. Initialize on the first gesture. Tests per 11.6 for what exists so far.
```

### Stage 12
```
Implement music.js: drone pad per tier plus a pentatonic arpeggio whose density follows a tension
function (proximity, speed, low fuel), crossfaded over 1.5 s, paused when the tab is hidden. Add the
settings popover and the M key. Test tension monotonicity.
```

### Stage 14
```
Implement rendezvous, soft_landing, and gate_run missions (gates in order; a missed gate does not end the
attempt) and the asteroid field (spatial grid), solar wind zone, and dark mass as separate commits with
unit tests for win, non-win, and collision cases. Add HUD progress per mission type.
```

### Stage 15
```
Create L4-L12 per section 8.2 with stored solutions, tiers, hints, tags, and par. Moving-body windows
must matter in L4, L6, L10. Run npm run levels; fix failing levels by adjusting the design. Report each
level's fuel versus par.
```

### Stage 16
```
Implement difficulty modes (Easy default on first run; Hard resets to the next launch window), credits,
the upgrade shop, level select with tiers and locks, saves with a memory fallback, and the lose screen
that explains why (section 13.1). Tests: payouts, upgrade caps, unlock rules.
```

### Stage 17 (Flight School engine and T1-T4)
```
Implement Flight School per AGENTS.md section 12: tutorialLevels.js with T1-T4 and stored solutions
(T5-T6 come in Stage 33), the step schema and state machine (event-bus driven, no timer advances), allow
filtering, the overlay with spotlight and 3D-to-screen arrow, idle re-prompt at 20 s, Show me at 60 s,
Do it for me at 90 s (performs the action through the sim API and tags it assisted), skip with
confirmation, resume, lesson replay from the Title menu, the first-launch gate (Play runs Flight School
before any mission; level select locked until graduate or skip), the 5-second intro, and the just-in-time
intro cards from 12.4. Tutorial attempts are excluded from stats, stars, credits, and upgrades. Add the
tests in 12.6 that apply so far.
```

### Stage 18
```
Complete the coach: grow knowledge to 40+ chunks including tutorial.md (12+ TU chunks); implement the
`tutorial` intent with Start/Resume buttons and TU boost during Flight School; add all findings from 16.4
that exist so far, the show-me ghost, the source drawer, the Why-this-answer toggle, and the auto-nudge
toast. Tests: different logs give different output; calc numbers match sim/calc; valid sources always.
```

### Stage 20
```
Implement 10.3 sky and light: raymarched nebula (High) with 2D and gradient fallbacks, auto-exposure from
star distance, lens flare with occlusion fade, god rays (High, only when partly occluded), and speed dust
aligned to velocity. Tier-aware and reduced-motion safe. Unit-test the exposure function. Screenshot,
critique, iterate twice.
```

### Stage 21
```
Implement planets per 10.3: analytic eclipse shadows (up to 2 occluders per tier) with a JS mirror of
sphereShadow for tests, cloud layer, atmospheric scattering with a terminator band, ocean glint, auroras,
gas giant turbulence and storm, ring shadows. Screenshot and iterate.
```

### Stage 22
```
Implement gravity visualization per 10.3: instanced flow-field particles along local acceleration
(tier-aware), gravitational lensing pass at the dark mass with a clamped offset and a thin ring arc,
orrery orbit lines with period ticks and leader-line labels, and the marching-dash ribbon shader.
Tests for flow spawn/die and lens offset clamp. Screenshot and iterate.
```

### Stage 23
```
Implement finishing per 10.3: depth of field only in cinematic and replay shots (High), edge-only
chromatic aberration during slow-mo, film grain, micro sway, split-tone grade, and the brass HUD
instruments (fuel arc with settling needle, orrery mini-map, atlas annotations). Reduced-motion safe.
Report frame times per tier.
```

### Stage 24
```
Implement 11.1 and 11.3: HRTF spatial audio with the AudioListener following the camera, procedural
convolution reverb with environment-dependent wet and length, cockpit vs exterior mix with a 300 ms
crossfade, the mastering chain (EQ, compressor, tanh soft clipper), sidechain-style ducking, and
beat-synced SFX with nextGridTime. Tests per 11.6.
```

### Stage 25
```
Implement 11.4 and the eclipse, dark-mass, tug, and radio-blip layers in 11.2: the Orrery Orchestra
(one note per orbit per body, timbres by body kind, grid-quantized, proximity-scaled, toggleable).
Test the scheduler (exactly once per orbit over N periods). Then do a listening review: write down 5 mix
problems with fixes and apply the top 3.
```

### Stage 27
```
Implement worker infrastructure (Vite ?worker&inline with a time-sliced main-thread fallback) and the
launch window map per 9.1: canvas heat map, coarse then refined, hover mini-preview, click to set launch,
mode toggle for power, W shortcut. Use the exact sim step. Tests: determinism and worker-vs-main
equivalence. Extend check-offline for worker URLs. Verify file:// loading manually.
```

### Stage 28
```
Implement sim/planner.js per 9.2 (sampling from the window map, refinement, optional one-node
optimization, mission-specific objectives, full-sim verification, 3 s cancelable budget, honesty rule),
Assist mode per 9.3 (editable ghost plan, Assisted tag, 60% payout, no 3 stars), and the coach intents
plan, explain_plan, windows. Tests: seed determinism, success plans verify, impossible level returns a
partial plan, time budget respected.
```

### Stage 29
```
Implement gravity tugs per 7.4: placement UI, inclusion in accel and the preview, caps, upgrade, visuals,
gong and hum. Create L13 and L14 with stored solutions that include tug placement. Tests: tugs change the
path; caps enforced; solution replay includes tugs.
```

### Stage 30
```
Implement probes-as-rails (cached trajectory lookup), the relay mission with a line-of-sight function and
a HUD link line, and the rival ghost with a finish comparison. Create L15 (relay) and L16 (ghost race)
with stored solutions. Tests: LoS cases, cached rail equals original integration, relay completes only
with line of sight.
```

### Stage 31
```
Implement section 13: flight report canvas (delta-v breakdown, efficiency versus best-known, closest
approaches, timeline), postcard PNG export, Orbit Song sonification (30 s cap, optional WAV export),
and the explain_report intent. Tests per 13.5.
```

### Stage 32
```
Implement section 14: audio-only mode with tuning-fork beat feedback, hazard ticks, altitude, fuel, and
progress cues, full keyboard control, the aria-live announcer, optional speechSynthesis (feature-
detected), and optional haptics. Add the optional Eyes-closed lesson in Settings. Tests per section 14.
```

### Stage 33 (finish Flight School and verify everything)
```
Finish Flight School: add T5 (window map) and T6 (Navigator: calc question, hint, plan, Assist) with
stored solutions, the graduation card with the one-time 50 credit bonus, and the 12.6 tests. Add the
remaining knowledge chunks (planner, windows, tugs-relay, reports, audio) to reach 55+, the findings in
16.4 for assisted attempts and the window map, and tests. Run npm run verify. Report dist/index.html size
and confirm it loads from file:// with the network off, Flight School plays first, and sound works after
the first click.
```

---

## Cut list (apply in this order if time runs short)

1. Drop the Daily route stretch and Session 6 extras.
2. Drop the `webllm` adapter (keep Ollama).
3. Drop WAV export for Orbit Song, then Orbit Song itself.
4. Drop the rival ghost (keep relay), then drop relay and L15-L16.
5. Drop god rays, depth of field, aurora, and ocean glint.
6. Drop the Orchestra's timbre variety (use one timbre) and voice blips.
7. Drop live RCS, the gravity grid, and the replay camera.
8. Drop gate_run missions and L9 (11 base levels).
9. Reduce knowledge to 45 chunks (never below that).

**Never cut:** Flight School playing before the first mission (T1-T4 at minimum, with Show me / Do it for me), the preview-equals-flight test, stored-solution replay for every shipped level, burn nodes, the offline check, coach citations and calculators, launch-log findings, the trajectory ribbon, bloom on Medium and High, thruster and gravity-hum audio, eclipses, volume and mute controls, the planner's honesty rule, Assisted tagging.

## Verification checklist

```bash
npm run verify
ls -lh dist/index.html            # under 3.5 MB
grep -c "http" dist/index.html    # review: only w3.org namespaces and the localhost literal
```

Manual (first run, then repeat the sound and coach checks):
- [ ] Clear storage, open `dist/index.html` over `file://` with the network off: **Title -> Play -> Flight School intro -> T1 plays automatically**, no mission reachable first
- [ ] Complete T1-T6; try Skip (confirmation appears) in a fresh profile; resume after closing the tab; replay a single lesson from the Title menu
- [ ] Idle on a step: re-prompt at 20 s, Show me at 60 s, Do it for me at 90 s; no step advances without the action
- [ ] Graduation gives 50 credits once and unlocks L1; tutorial attempts do not appear in Navigator's review
- [ ] Drag a launch: the preview matches the real flight
- [ ] Add a node: fuel drops by exactly its size
- [ ] Slow-mo: hear the lowpass sweep, see the FOV kick
- [ ] Fly near a planet: gravity hum rises, Doppler swoosh at closest approach
- [ ] Open the window map (`W`), click a green cell, launch, win; ask "when should I launch?"
- [ ] Ask Navigator for a plan; accept it; confirm the attempt is tagged Assisted and cannot earn 3 stars; try an impossible level and confirm the honest partial-plan message
- [ ] Place a tug and see the path bend; complete the relay level only with line of sight
- [ ] Fly through a planet's shadow: eclipse visible, audio shifts; approach the dark mass: lensing ring and sub drone
- [ ] Crash on purpose 3 times, then ask "what went wrong?" for a log-based answer
- [ ] Open the flight report, save a postcard, play the Orbit Song
- [ ] Play a level in audio-only mode (screen hidden) using the tuning fork, ping, and ticks
- [ ] Switch quality to Low: still looks good and runs smoothly; enable reduced motion: no shake or FOV kick
- [ ] Ask something unrelated: polite decline

## Optional helpers

`.claude/commands/verify.md`:
```
Run `npm run verify`. If anything fails, show the failing output, fix the root cause (not the test), and
rerun until green. Then summarize what changed in 5 bullets.
```

`.claude/commands/screenshot-review.md`:
```
Run `npm run shot`, view each screenshot, and critique composition, trajectory ribbon legibility, planet
shading, bloom, HUD clarity, and color harmony against AGENTS.md section 10. List 5 concrete fixes, apply
the top 3, and re-shoot.
```

`.claude/commands/add-chunks.md`:
```
Read knowledge/ and the retrieval tests. Add 5 chunks that fill gaps (check thin tags, levels, and
prefixes), follow AGENTS.md 16.1, run `npm run kb`, and add one retrieval test per new chunk.
```

`.claude/commands/first-run.md`:
```
Simulate a fresh profile (clear storage) and walk the first-run path: Title, Play, Flight School T1-T6,
graduation, level select. Report any step that can be skipped without the action, any softlock, and any
tutorial attempt that leaked into stats. Fix what you find and add a test for each issue.
```

## Style notes
- Brief commit messages that explain the decision.
- Prefer deleting code over adding flags.
- If a requirement here seems wrong or impossible, stop and ask instead of working around it.
