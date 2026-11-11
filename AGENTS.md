# AGENTS.md: Orbit Courier (final, consolidated)

Instructions for any coding agent (Claude Code, Codex, Cursor, etc.) working in this repo.
Read this whole file before writing code. When this file and a user message conflict, the user message wins; tell the user about the conflict.

**Status:** this file supersedes the earlier `AGENTS.md` and `UPGRADE-INNOVATION.md`. It contains every feature in one place, including the **Flight School tutorial that plays before the first mission**.

## 1. Product

**Orbit Courier** is a 3D space-delivery game. You launch a small probe from a planet, plan burns on a live predicted trajectory, use gravity assists and tugs, and deliver cargo to moons and stations on a fuel budget. Bodies move on orbits, so **launch timing matters**.

**Navigator**, the built-in coach, answers questions using an **offline RAG pipeline** over local guides, **live calculators** for the current level, an **offline route planner**, and the player's **launch log**.

### 1.1 Pillars (judge every decision against these)
1. **Spectacular, procedural visuals.**
2. **Sound that reacts to physics** (gravity, speed, fuel, shadow, time dilation).
3. **Teaches real orbital intuition**: a tutorial that plays first, a live preview, a window map, and a coach.
4. **Works offline and costs nothing.**
5. **Never leaves the player stuck**: every failure explains itself, every lesson has a safety net.

### 1.2 Player journey
```
Boot -> Title -> [first launch: Flight School tutorial plays automatically] -> Level select
      -> Briefing -> Planning (aim, nodes, tugs, window map, Navigator plan) -> Flight
      -> Result (win or lose) -> Flight report / Retry / Replay / Ask Navigator / Next
```

## 2. Hard constraints (never break)
1. **Zero cost.** Free, open-source dependencies only. No paid APIs, accounts, or keys.
2. **Fully offline.** Final build is one `dist/index.html` that works double-clicked with the network off.
3. **No external requests at runtime.** No CDN scripts, web fonts, remote images or audio, analytics, or `fetch()` to non-local URLs.
4. **No asset files.** Graphics are procedural (geometry, shaders, canvas textures). Audio is synthesized with Web Audio. System fonts only.
5. **Coach works without any LLM.** Retrieval, calculators, and the planner are the default; LLM adapters are optional and off.
6. **Simplified, consistent physics.** Game units (G = 1). Guides must say they describe the game's physics.
7. **Preview equals flight.** The preview and the live flight use the same `step` function; a test enforces it.
8. **Playable muted, playable without color cues alone.** Every sound has a visual equivalent and every color cue has a second cue.

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | JavaScript (ES modules) + JSDoc | No TypeScript |
| 3D | `three` (pin exact, e.g. `0.160.0`) | Use `three/examples/jsm` postprocessing |
| Bundler | Vite + `vite-plugin-singlefile` | Workers via `?worker&inline` |
| Physics | Custom, planar (x,z) sim, 3D rendering | No physics engine |
| Retrieval | Custom BM25 | No vector DB |
| Knowledge | `scripts/build-knowledge.mjs` | Markdown to `kb.generated.json` |
| Audio | Web Audio, procedural | HRTF panner, convolver, waveshaper |
| Persistence | `localStorage` in try/catch with memory fallback | |
| Tests | Vitest | Pure logic, deterministic sim |
| Dev-only (optional) | `playwright` for screenshots | Never bundled |
| Backend | None | Optional Ollama at `http://localhost:11434` only |

No UI framework: plain DOM and CSS for HUD and menus.

## 4. Repository layout
```
orbit-courier/
  AGENTS.md  CLAUDE.md  README.md  package.json  vite.config.js  index.html
  knowledge/   basics.md orbits.md maneuvers.md slingshots.md missions.md hazards.md
               mistakes.md training.md levels.md tutorial.md upgrades.md
               planner.md windows.md tugs-relay.md reports.md audio.md
  scripts/     build-knowledge.mjs  check-offline.mjs  verify-levels.mjs
  src/
    main.js
    sim/       constants rails gravity probe predict missions hazards scoring calc
               tugs.js trajectory-rails.js los.js planner.js windowmap.js   # PURE, no three.js
    workers/   windowmap.worker.js  planner.worker.js
    levels/    levels.js  tutorialLevels.js  progression.js
    render/    scene camera quality sky planets sun trajectory trail particles
               wellgrid flowfield lensing eclipse post hud orrery
    input/     input.js  maneuver.js  tugs-input.js
    audio/     engine buses dsp reverb spatial mix master duck
               thrust hum sfx music orchestra ping tuningfork voice songs
    tutorial/  steps.js  tutorial.js  overlay.js  lessons.js  intros.js
    coach/     tokenize bm25 retrieve stats calc-intent plan-intent coach
               adapters/ extractive.js ollama.js webllm.js
               kb.generated.json
    report/    flightReport.js  postcard.js  orbitSong.js
    state/     events telemetry settings save
    ui/        title menu levelSelect briefing resultCard loseScreen
               coachPanel settingsPanel windowMapPanel
    a11y/      announcer.js  keyboard.js  haptics.js
    styles.css
  tests/
```

## 5. Commands
```bash
npm install
npm run kb        # knowledge json
npm run dev
npm test
npm run levels    # headless replay of every stored solution (incl. tutorial levels)
npm run build     # kb, vite build, check-offline
npm run preview
npm run verify    # test + levels + build + check-offline (run before saying "done")
npm run shot      # optional: playwright screenshots into /shots
```

## 6. Game flow and screens

| Screen | Contents |
|---|---|
| **Title** | Play / Continue, **Flight School**, Level select, Settings, Navigator. Slow cinematic of the home world. |
| **First launch** | **Play** goes straight into Flight School (section 12) before any mission. Skipping needs confirmation. |
| **Level select** | Tier grid, locks, stars, best fuel, mode badge. Locked click: error sound and "Finish L<n> first." Fully keyboard navigable. |
| **Briefing** | Mission text, par fuel, one tip, just-in-time mechanic card (first time only), Start button. |
| **Planning** | Drag launch vector, burn nodes, gravity tugs, window map (`W`), Navigator plan button, slow-mo, mode readout. |
| **Flight** | Live HUD, camera modes, slow-mo, optional live RCS. |
| **Result** | Win: payout, stars, report. Lose: **why** it failed (see 13.1). Buttons: Retry, Replay, Flight report, Ask Navigator, Next. |

Default difficulty on a first run is **Easy**. Unlocks: finish the previous level or earn 1 star on it; the Experimental tier unlocks after 1 star on L6.

## 7. Simulation (`src/sim/`, pure and deterministic)

### 7.1 Units and plane
G = 1, `mu = G*M`. Simulation is **planar (x,z)**; rendering is 3D (y only for visual flourish).

### 7.2 Bodies on rails (not integrated)
Stars, planets, moons, and stations follow Kepler orbits around their parent.
```js
export function posAt(body, t, byId) {
  if (!body.orbit) return [0, 0];
  const { a, e = 0, phase = 0, parent, dir = 1 } = body.orbit;
  const n = Math.sqrt(byId[parent].mu / a ** 3), M = phase + dir * n * t;
  let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), z = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [px, pz] = posAt(byId[parent], t, byId);
  return [px + x, pz + z];
}
```

### 7.3 Probe integration
Fixed `DT = 1/120`, kick-drift-kick leapfrog, softening `EPS2`.
```js
export function accel(x, z, t, bodies, hazards) {
  let ax = 0, az = 0;
  for (const b of bodies) {                    // includes planets, moons, stations, TUGS, committed-probe rails (mu>0 only)
    const [bx, bz] = b.pos(t), dx = bx - x, dz = bz - z;
    const r2 = dx * dx + dz * dz + EPS2, inv = b.mu / (r2 * Math.sqrt(r2));
    ax += dx * inv; az += dz * inv;
  }
  for (const h of hazards) { const [hx, hz] = h.accel(x, z, t); ax += hx; az += hz; }
  return [ax, az];
}
export function step(p, t, bodies, hazards) {
  let [ax, az] = accel(p.x, p.z, t, bodies, hazards);
  const vx = p.vx + ax * DT / 2, vz = p.vz + az * DT / 2;
  const x = p.x + vx * DT, z = p.z + vz * DT;
  [ax, az] = accel(x, z, t + DT, bodies, hazards);
  return { ...p, x, z, vx: vx + ax * DT / 2, vz: vz + az * DT / 2 };
}
```
**Determinism rule:** preview and live flight call the same `step`. A test asserts preview positions equal flight positions at the same step indices (difference under 1e-9).

### 7.4 Maneuvers and time
- **Launch:** from a pad on a body; probe gets the body's velocity plus a launch vector (angle, power capped per level).
- **Burn nodes:** placed on the preview at time `tn`; instantaneous delta-v (prograde/retrograde and radial handles). Fuel cost = `|dv|`. Included in the preview.
- **Live RCS (optional):** small thrust while held, limited seconds, costs fuel.
- **Slow-motion planning:** 0.1x with a per-level budget; sim `DT` never changes, only steps per frame.
- **Gravity tugs:** pre-launch ghost masses (no collision) on circular orbits around a chosen parent at chosen radius and phase; caps `tugCount` and `tugMuMax` (upgradeable). Included in `accel` and the preview.
- **Probes as rails:** a committed probe trajectory is cached per step and exposed as a lookup rail (`posAt(t)` interpolates). Used for relay probes and rival ghosts; keeps sim deterministic.

### 7.5 Prediction (`predict.js`)
Integrate up to `previewSteps` (default 1800 = 15 sim-seconds; Hard 600; upgradeable) including future rail positions, nodes, and tugs. Return polyline points, time ticks, closest approach per body, periapsis/apoapsis relative to the dominant body, crash point, escape flag, and in-band intervals. Recompute only when inputs change; cap about 3 ms, shortening the preview instead of dropping frames.

### 7.6 Outcomes
- **Crash:** within a body's radius (except the landing target when slower than the landing limit) or inside an asteroid.
- **Lost:** beyond map `bounds`.
- **Time out:** only if the level sets `timeLimit`.
- **No fuel is not a failure**; the probe coasts.

### 7.7 Missions (`missions.js`)

| Type | Win when |
|---|---|
| `deliver_orbit` | Inside the target radius band around a body for `holdSeconds` (default 4) |
| `rendezvous` | Within `captureDist` of a moving station with relative speed below `maxRelSpeed` (a fast pass is not a capture; keep flying) |
| `soft_landing` | Touch a body surface slower than `maxLandSpeed` |
| `gate_run` | Pass all ring gates **in order** (a missed gate does not end the attempt; it just does not count) |
| `relay` | Deploy probe A into a relay orbit (deliver_orbit), then probe B reaches its target while keeping **line of sight** to A (segment B-A not blocked by any body) for `linkSeconds` |

### 7.8 Hazards
Asteroid field (annulus on rails, spatial grid), solar wind zone (constant, slowly rotating acceleration), dark mass (tiny body, huge `mu`).

### 7.9 Scoring
`payout = base + fuelLeftBonus + timeBonus + precisionBonus`. Stars: 1 for completing; 2 for fuel at or under `par.fuel * 1.25`; 3 for at or under `par.fuel` with no crash on that attempt. **Assisted attempts** (Navigator plan accepted) cannot earn 3 stars and pay 60%.

### 7.10 Calculators (`calc.js`, shared by UI and coach)
```js
export const vCirc = (mu, r) => Math.sqrt(mu / r);
export const vEsc  = (mu, r) => Math.sqrt(2 * mu / r);
export const period = (mu, a) => 2 * Math.PI * Math.sqrt(a ** 3 / mu);
export const visViva = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));
export function hohmann(mu, r1, r2) { /* { dv1, dv2, total, transferTime } */ }
```

## 8. Levels, modes, progression

### 8.1 Schema
```js
/** @typedef {Object} Level
 * @property {string} id                // "L1".."L16", "T1".."T6" (tutorial)
 * @property {string} name
 * @property {'tutorial'|'training'|'inner'|'outer'|'deep'|'lab'} tier
 * @property {{bodies: Body[]}} system
 * @property {Hazard[]} hazards
 * @property {{padBody:string, angleRange:[number,number], maxSpeed:number}} launch
 * @property {Mission} mission
 * @property {number} fuel
 * @property {number} maxNodes
 * @property {number} slowMoSeconds
 * @property {number} tugCount           // default 0
 * @property {number} tugMuMax
 * @property {number|null} timeLimit
 * @property {{fuel:number}} par
 * @property {[string,string,string]} hints   // nudge, direction, near-solution
 * @property {string[]} tags
 * @property {boolean} [tutorial]        // excluded from stats, stars, upgrades
 * @property {{launch:{angle:number,power:number,t0:number}, nodes:{t:number,dv:[number,number]}[], tugs?:Tug[], probes?:any[]}} solution
 */
```
Every level (including tutorial levels) needs a **stored `solution`** replayed headlessly by `scripts/verify-levels.mjs`. A failing solution means the level is **broken** and fails the build. `par.fuel` comes from the solution's fuel use.

### 8.2 Levels

| Tier | Level | Name | New idea |
|---|---|---|---|
| Tutorial | T1-T6 | Flight School | See section 12 |
| Training | L1 | First Light | Launch to a nearby moon |
| Training | L2 | Falling Around | Enter a circular orbit |
| Training | L3 | Burn Nodes | One maneuver node lifts an orbit |
| Inner | L4 | The Window | Moving moon; timing matters |
| Inner | L5 | Gentle Touch | Soft landing |
| Inner | L6 | Station Chase | Rendezvous |
| Outer | L7 | Slingshot | Gas giant assist saves fuel |
| Outer | L8 | Rock Garden | Asteroid field |
| Outer | L9 | Solar Gale | Solar wind, gate run |
| Deep | L10 | Two-Body Dance | Moon of a moon, tight timing |
| Deep | L11 | Dark Mass | Strong assist or death; lensing |
| Deep | L12 | Grand Tour | Gates, slingshot, landing |
| Lab | L13 | Free Pull | First gravity tug |
| Lab | L14 | Two Wells | Tug plus slingshot |
| Lab | L15 | Far Side | Relay mission |
| Lab | L16 | Chasing Vex | Race a rival ghost |

### 8.3 Difficulty modes

| Mode | Preview | Slow-mo | Fuel | Extra |
|---|---|---|---|---|
| Easy (default first run) | Full, with crash markers | 2x | +30% | Target hints visible; Assist available |
| Normal | Standard | Standard | Standard | Assist available (tagged) |
| Hard | 600 steps, no crash markers | 0.5x | -15% | A failed launch advances time to the **next launch window** and the attempt counter shows |

Stats and stars are stored per mode.

### 8.4 Credits and upgrades
Payouts buy upgrades (capped at 3 levels each): fuel tank (+10%), preview length (+300 steps), slow-mo, node count, tug count, finer launch control. Upgrades do **not** apply in tutorial levels. Graduating Flight School gives a one-time starter bonus of 50 credits.

## 9. Launch window map, planner, and Assist mode

### 9.1 Launch window map (`windowmap.js`, worker)
A canvas heat map of **launch time offset** (x, one synodic window, 48 samples) versus **launch angle** (y, 0-360 degrees, 48 samples) at the current power; toggle swaps y to power. Cell value comes from closest approach to the target and the mission type (green good, red bad, hatched crash). Computed in a **Web Worker** (`?worker&inline`) using the exact `step`, coarse 24x24 first then refined. If workers fail (some `file://` setups), fall back to time-sliced main-thread chunks with `requestIdleCallback`. Hover shows a mini-preview; click sets launch vector and time; `W` opens it. Tests: determinism, worker equals main-thread results, known two-body best cell within tolerance.

### 9.2 Navigator planner (`planner.js`, pure, seeded, time-boxed about 3 s, cancelable)
1. Sample launch candidates from the window map.
2. Refine the top K with coordinate descent or Nelder-Mead.
3. Optionally add one burn node and optimize its time and delta-v vector.
4. Objective by mission: band error and instability (deliver_orbit), distance and relative speed (rendezvous), touchdown speed (soft_landing), gate misses (gate_run), link time (relay); small fuel penalty.
5. **Verify** by running the full sim; return `{ launch, nodes, fuel, outcome, confidence }`.

**Honesty rule:** if no plan completes the mission, return the closest partial plan and say so ("I couldn't find a full solution; this gets within 0.4 units"). Never claim success without verification.

### 9.3 Assist mode
One click fills the launch vector and nodes as editable ghosts. The attempt is tagged **Assisted** (7.9). Tests: seed determinism, every "success" plan passes full-sim verification, an impossible level returns a partial plan, time budget respected.

## 10. Graphics (procedural, premium)

### 10.1 Visual identity (decided once)
**Engraved star atlas meets analog flight instruments.** Space is deep ink and aubergine haze, not pure black. HUD is thin ivory and brass linework with a serif italic for labels and tabular monospace for numbers. The single memorable element is the **predicted trajectory as an engraved luminous ribbon** with tick marks and closest-approach pins. Everything else stays restrained. Avoid generic neon, tracked-out all-caps eyebrow labels, and decorative gradients.

| Token | Value | Use |
|---|---|---|
| `--void` | `#0A0E1F` | space base |
| `--haze` | `#2A1B3D` | nebula tint |
| `--ivory` | `#EFE8D8` | HUD lines, text |
| `--brass` | `#C8A35A` | HUD accents, rings, tugs |
| `--safe` | `#4FD1C5` | valid trajectory |
| `--danger` | `#F0623D` | crash segments, warnings |
| `--cargo` | `#F2C14E` | probe, target highlights |

Define tokens once as CSS variables and a JS constants file. Type: `ui-serif, Georgia, serif` (italic) for labels; `ui-monospace, "SF Mono", Consolas, monospace` for numbers. Sentence case.

### 10.2 Pipeline
ACES tone mapping, `SRGBColorSpace`, pixel ratio capped at 2. Composer: RenderPass, UnrealBloomPass (strength about 0.6, radius 0.5, threshold 0.85), grade/vignette pass, lensing pass, OutputPass.

### 10.3 Feature list

**Sky and light:** twinkling starfield; nebula (raymarched on High, 2D layers on Medium, gradient on Low); star corona; **auto-exposure** from star distance (1.2 s time constant); procedural **lens flare** that fades when the star is occluded; **god rays** (High, only when partly occluded); **speed dust** streaks aligned to velocity.

**Planets (all shaders):**
- Rocky: fbm height, craters, terminator, night-side city lights on the home world, **ocean glint**.
- Gas giants: animated bands with edge turbulence, drifting storm, limb darkening.
- Ice: bright cracked surface with fresnel sheen.
- **Clouds** (separate drifting sphere) on the home world; **atmospheric scattering** (limb brightening, warm terminator band); **auroras** at poles.
- **Rings** with banding and mutual shadows.
- **Eclipses:** up to 2 occluders per planet shader:
```glsl
float sphereShadow(vec3 p, vec3 sun, vec3 c, float r) {   // 1 lit .. 0 shadowed
  vec3 L = normalize(sun - p), oc = c - p; float t = dot(oc, L);
  if (t < 0.0 || t > length(sun - p)) return 1.0;
  return smoothstep(r * 0.92, r * 1.06, length(oc - L * t));
}
```
Mirror `sphereShadow` in JS for tests.

**Gravity made visible:** **flow field** (about 800 instanced particles along local acceleration; replaces the grid by default on Medium/High), optional well grid, **orrery orbit lines** (engraved ellipses with period ticks and leader-line labels), **gravitational lensing** at the dark mass:
```glsl
vec2 d = uv - c; float r2 = dot(d, d) + 1e-4;
vec2 src = uv - clamp(normalize(d) * k * R * R / r2, vec2(-0.08), vec2(0.08));
vec3 col = texture2D(tDiffuse, src).rgb + ringGlow(length(d), R) * vec3(0.9, 0.8, 0.6);
```

**Probe and path:** faceted probe with nav lights; thruster flame (instanced particles plus cone glow); trail ribbon colored by speed; trajectory ribbon (solid safe, dashed danger after crash point, **marching dashes**, time ticks each sim-second, closest-approach pins with distance labels, periapsis/apoapsis markers, pulsing target band); maneuver nodes with prograde/retrograde and radial arrows and a live dv readout; tug orbs with field rings; crash and delivery bursts (photosensitivity-safe); orbit-lock shimmer.

**Camera and finishing:** cinematic launch (3 s), follow, limited orbit, planet focus, replay camera; **depth of field only in cinematic and replay shots** (High); chromatic aberration at edges only during slow-mo; subtle film grain; micro sway; split-tone grade (cool shadows, warm highlights); FOV kick in slow-mo.

**HUD (DOM):** brass analog fuel arc with a needle that settles, speed and altitude, mission progress, slow-mo meter, node list, orrery mini-map, atlas-style annotations with leader lines, relay link line and signal strength.

### 10.4 Quality tiers (`quality.js`)

| Feature | Low | Medium | High |
|---|---|---|---|
| Bloom | off | half-res | full |
| Nebula | gradient | 2D layers | raymarched |
| Planet shading | lit spheres | fewer octaves | full |
| Eclipses | off | 1 occluder | 2 occluders |
| Clouds, aurora | off | clouds | both |
| Lensing | off | on | on |
| God rays, DOF | off | off | on |
| Flow field | off | 400 | 800 |
| Speed dust, auto-exposure, flare | off | on | on |
| Particles total | 200 | 600 | 1500 |
| Pixel ratio | 1 | 1.5 | 2 |

**Auto** measures frame time for 2 s after load and steps down if above about 22 ms, turning off the most expensive items first (DOF, god rays, raymarched nebula, flow field, second occluder) and showing a small notice. **Low must still look good**: lit spheres, starfield, ribbon.

### 10.5 Safety and accessibility
`prefers-reduced-motion` disables shake, FOV kick, sway, twinkle, speed dust streaks, pulsing, and instant slow-mo transitions. No flashes above 3 Hz. Path colors are paired with dash patterns. Full keyboard and touch support, no pointer lock.

## 11. Audio (procedural Web Audio)

Context starts on the **first user gesture**. Voice limit 24 (spatial voices 8). Pure helpers live in `dsp.js` for testing.

### 11.1 Bus graph
`sfx`, `thrust`, `hum`, `music`, `orchestra`, `ui`, `voice` buses -> reverb send (convolver) -> **master** (EQ, compressor about -14 dB / 3:1 / 10 ms / 200 ms, tanh soft clipper, trim 0.8) -> time-dilation lowpass -> destination.

### 11.2 Layers

| Layer | Behavior |
|---|---|
| Thruster | Noise plus low saw; gain and cutoff follow thrust; HRTF-positioned at the probe |
| **Gravity hum** | Two nearest bodies drone; pitch follows log acceleration, quantized to pentatonic; volume by proximity; spatialized; gas giants low, moons high |
| **Doppler flyby** | Band-passed noise whose frequency drops as radial velocity changes sign at closest approach |
| **Target ping** | HRTF beacon at the target; rate and pitch rise as distance falls |
| Nodes | Ticks pitched by dv; dull buzz when over budget |
| **Time dilation** | Master lowpass sweeps down and music pitches down in slow-mo; sweeps back on exit |
| Orbit lock | Rising shimmer while holding the band, resolving to a chord |
| Fuel warning | Gentle pulse below 20% |
| Crash | Sub thump plus noise burst, ducked ambience, slow reverb tail |
| Delivery | Pentatonic arpeggio; one bell per star |
| Tugs | Low gong on placement, soft hum |
| Eclipse | Music lowpass, pad moves to a minor third; restores over 1.5 s |
| Dark mass | Deep sub drone, pitch-bent hum rising on approach |
| UI and tutorial | Click, error buzz, hint bell, tutorial step ding, coach blips (throttled 300 ms), radio voice blips (different pitch per speaker) |

### 11.3 Environment and mix
- **Procedural reverb:** generated impulse response, wet and length by environment (deep space 3 s dark, near planet 1.2 s, asteroid field 0.6 s), crossfaded over 1 s:
```js
function makeIR(ctx, seconds = 3, decay = 2.5) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return buf;
}
```
- **Cockpit vs exterior:** follow camera uses the cockpit mix (low rumble, rolled-off highs); free camera uses the exterior mix; 300 ms crossfade; settings can lock one.
- **Ducking:** music and hum dip about 50% for 600 ms (80 ms attack) on `launch`, `crash`, `mission_complete`, `hint`.
- **Beat-synced SFX:** chimes, pings, and node ticks snap to the next 1/8 note (max added latency 125 ms; thruster and crash never delayed) via `nextGridTime(now, bpm, subdivision)`.
- **Listener:** `AudioListener` follows the camera each frame (`positionX/...` params, `setPosition` fallback).

### 11.4 Generative music and the Orrery Orchestra
- Drone pad in a key per tier plus a sparse pentatonic arpeggio whose **density follows tension** (proximity to bodies, speed, low fuel); crossfade about 1.5 s; pauses when the tab is hidden.
- **Orrery Orchestra:** each body plays one note **per orbit** when its orbital angle crosses a reference direction (moons arpeggiate, gas giants play slow bass; outer = lower). Timbres: gas giant slow filtered saw with vibrato; rocky plucked mallet; ice glassy FM bell; moon soft sine blip; station clean square with echo. Quantized to the grid, louder when near the probe, toggleable.

### 11.5 Settings
HUD speaker popover: master volume, SFX, music, gravity hum, target ping, orchestra, "reduce sound" (disables hum, ping, arpeggios, orchestra), cockpit/exterior lock. `M` mutes. Persisted.

### 11.6 Audio tests
Pitch mapping stays in scale; tension is monotonic with proximity and inversely with fuel; soft-clip curve monotonic and bounded in [-1, 1]; ducking envelope returns to 1.0 after release; `nextGridTime` is grid-aligned, not earlier than `now`, within one subdivision; orchestra scheduler fires exactly once per orbit per body over N periods; throttle and voice limits with a mocked `AudioContext`; every event has a sound or an explicit "silent" entry.

## 12. Flight School (the tutorial that plays before the first mission)

### 12.1 Behavior
- **Plays automatically on first launch**: Title -> **Play** -> a 5-second skippable intro (camera glides over the home world; Navigator greets in text with a radio blip) -> Lesson T1. Level select stays locked until the player graduates or skips.
- **Interactive, never timed.** Every step waits for the player's actual action (event bus). No step advances on a timer.
- **Skippable with confirmation** ("Skip Flight School? You can replay it any time from the title screen."). Skipping sets `tutorialSkipped`, unlocks L1, and Navigator offers to restart it after 2 failed attempts on L1 or L2.
- **Resumable** (saved lesson and step index) and **replayable**: the Title menu has **Flight School** with a lesson list (T1-T6, checkmarks); lessons can be replayed individually.
- Runs on **Easy rules**, fixed upgrades-off, music tension capped low. Total about 8-10 minutes.
- Tutorial levels are flagged `tutorial: true`: **excluded** from stats, stars, credits, upgrades, and planner stats. Step timings are recorded separately (`tutorialStepTimes`) so Navigator can say "Lesson T3 took a while; want a refresher?"
- **Never stuck:** idle 20 s shows a soft re-prompt; 60 s offers **Show me** (a ghost demonstration of the needed action); 90 s offers **Do it for me**, which performs the action through the normal sim API and marks the step `assisted` (still counts as done).

### 12.2 Lessons

| Lesson | Title | Player does | Teaches |
|---|---|---|---|
| T1 | Get your bearings | Sound check (click to enable, may decline), orbit the camera, focus the target (`F`), tap each HUD callout "Got it" (fuel arc, speed, mission, mini-map) | Camera, HUD, mission |
| T2 | First launch | Drag the launch vector until the preview turns solid green; press Launch; reach the target moon (big and near) | The preview, solid safe vs dashed danger, hearing the gravity hum |
| T3 | Fix a crash | A preset launch crashes (dashed red); click the path to add a node; drag prograde until safe; launch; win | Burn nodes, fuel cost, "preview equals flight" |
| T4 | Slow time, hold an orbit | Enter slow-mo; circularize around a moon with a node; hold the band 4 s (deliver_orbit) | Slow-mo planning, circular orbit, orbit-lock shimmer |
| T5 | Time the window | Moving moon; open the window map (`W`); hover and click a green cell; launch; win | Launch windows, target ping |
| T6 | Ask Navigator | Ask a calc question ("what speed gives a circular orbit here?"); press Hint; request a plan and accept it (the attempt is tagged Assisted, so the card explains what that means); launch; win | Coach, calculators, hints, planner, Assist |

**Graduation card:** "Flight School complete." One-time starter bonus of 50 credits, L1 unlocked, buttons **Start L1** and **Replay lessons**. Sets `tutorialDone`.

### 12.3 Step schema and engine
```js
// src/tutorial/steps.js
{ id: 't3-add-node', lesson: 'T3',
  text: 'Click the path to add a burn node, then drag the green arrow forward.',
  anchor: { type: 'path', at: 0.4 },                 // 'object' | 'cell' | 'path' | 'ui' (selector)
  allow: ['node_add', 'node_drag', 'camera'],          // all other controls are ignored this step
  waitFor: e => e.type === 'node_moved' && e.dvPrograde > 0.05,
  idleHintMs: 20000, showMeAfterMs: 60000, doItForMeAfterMs: 90000,
  demo: () => ({ action: 'add_node', t: 3.2, dv: [0.12, 0] }) }
```
`tutorial.js` is a state machine (`start`, `next`, `skip`, `resume`, `replayLesson`) subscribed to the event bus (`'*'`). It checks `waitFor`, emits `tutorial_step_done`, and advances. `overlay.js` draws a dimmed spotlight cut-out around the anchor, a 3D-to-screen arrow, a text card (serif italic), progress dots, **Back**, **Skip lesson**, and **Skip Flight School**. Reduced motion: static highlight, no pulsing.

### 12.4 Just-in-time intro cards (after Flight School)
One dismissible card the first time each appears, tracked in `seenMechanics`: asteroid field, solar wind, dark mass and lensing, soft landing, rendezvous, gate run, gravity tugs, relay link, ghost race, eclipses. Each has a short looping preview, a one-line rule, and **Got it**. An optional **Eyes-closed lesson** (audio-only mode, section 14) is available from Settings.

### 12.5 Coach and sound in the tutorial
Knowledge file `tutorial.md` with 12+ chunks (ids `TU-xxx`). Intent `tutorial` ("how do I play", "controls", "tutorial") answers with cited chunks and **Start / Resume Flight School** buttons. During Flight School, retrieval boosts `TU-` chunks. Sounds: highlight swell when a step appears, step-done ding, radio blip for Navigator lines, then the normal cues the lesson introduces. All text is shown on screen, and every step announces through the `aria-live` region.

### 12.6 Tutorial tests
- Steps advance only when `waitFor` matches; unrelated events never skip; no step uses a timer to advance.
- `allow` filtering blocks off-step actions.
- Skip, resume, replay-lesson restore the correct lesson and step.
- "Do it for me" completes the step via the sim API and tags it `assisted`.
- Tutorial levels T1-T6 each pass their stored solution (`npm run levels`).
- Tutorial attempts never appear in `summarize()`, stars, credits (except the graduation bonus), or planner stats.
- First-launch gating works with storage blocked (memory fallback); Level select stays locked until graduation or skip.
- Every `anchor.id` exists in its level; every step has non-empty text.

## 13. Results, lose screen, report, postcard, Orbit Song

### 13.1 Lose screen
States **why** the attempt failed in plain words: "Crashed into Kepi at t = 7.2 s (closest approach 0.3 below the surface)," "Left the map after 6 seconds," or "Time ran out." Shows the crash point on a mini-map, then **Retry, Replay, Flight report, Ask Navigator** (pre-fills "what went wrong?"). Retry is instant. Hard mode shows the next launch window.

### 13.2 Flight report (`report/flightReport.js`)
Canvas chart in the atlas style: delta-v breakdown (launch and each node), **efficiency versus the planner's best-known fuel** ("128% of best"), closest-approach table, event timeline. **Explain this report** button triggers intent `explain_report`.

### 13.3 Postcard (`report/postcard.js`)
Engraved-style chart of the path, bodies, level name, stars, fuel, and date drawn to a canvas and saved as PNG via `canvas.toBlob` plus a download link. Works offline.

### 13.4 Orbit Song (`report/orbitSong.js`)
Sonifies the trajectory: pitch from log distance to the dominant body quantized to the scale, note length from speed, node burns as percussive hits, closest approaches as swells, **maximum 30 s**. In-game play/stop; optional WAV export via `OfflineAudioContext` and a download link.

### 13.5 Tests
Report numbers match the attempt log; postcard returns a canvas of the expected size; sonification pitch is monotonic with distance and in scale; the 30 s cap holds.

## 14. Audio-only mode ("Eyes-closed mode") and accessibility
- **Tuning fork:** two oscillators, one at the probe's orbital speed, one at the target orbit's speed (both mapped to pitch). Matching speed gives unison; mismatch beats at `|f1 - f2|` Hz, slowing as you converge.
- **Target beacon** (3D ping), **hazard ticks** whose rate rises as time to closest approach shrinks, **altitude** as a soft tone pitch, **fuel** as a slow click rate, **mission progress** as pad volume.
- Full keyboard control: arrows aim, Enter launch, `N` node, `+`/`-` delta-v, `S` slow-mo, `W` window map, `H` coach, `M` mute.
- `aria-live` announcer reports key state changes (launch, crash, node added, orbit held, mission complete). Optional `speechSynthesis` announcements (feature-detected, never required). Optional haptics via `navigator.vibrate` for launch and crash (off under reduced motion).
- Colorblind-safe palette plus dash patterns; scalable HUD text; focus rings visible.
- Tests: beat frequency equals `|f1 - f2|`; hazard tick rate increases as time to closest approach shrinks; every key state change produces an announcer message.

## 15. Events and telemetry

Bus (`state/events.js`): game code only emits; audio, tutorial, telemetry, HUD, and coach subscribe.

Events: `level_start, launch, node_added, node_moved, node_removed, tug_placed, slowmo_start, slowmo_end, closest_approach, near_body, mission_progress, mission_complete, crash, lost, timeout, relay_link, fuel_low, window_map_open, plan_requested, plan_accepted, assist_used, hint, coach_open, coach_close, coach_message, report_open, postcard_saved, song_played, ui_click, ui_error, tutorial_start, tutorial_step_done, tutorial_skipped, tutorial_complete, upgrade_bought, mode_changed`.

Telemetry (`localStorage` key `orbit.telemetry.v1`, last 300 events, try/catch with memory fallback). Per attempt: `levelId, mode, tutorial, assisted, launchAngle, launchPower, nodes[], tugs[], closestApproaches{bodyId:dist}, outcome (delivered | crash:bodyId | lost | timeout), fuelUsed, slowmoSeconds, previewUsed, mapUsed, seconds`.

`stats.js` `summarize(levelId)` (excluding tutorial attempts) returns attempts, repeated outcomes, launch-angle spread, fuel efficiency versus par and versus best-known, preview, map, and slow-mo usage, `assistedAttempts`, and `plannerRequests`.

## 16. Offline RAG coach ("Navigator")

### 16.1 Knowledge base
Files in `knowledge/*.md`; each chunk starts with an H2 and a stable id:
```md
## [OR-004] Circular speed depends on distance
tags: circular, orbit, speed, vcirc
levels: L2, L3
level: beginner

In this game, circular orbit speed at distance r from a body is sqrt(mu / r)...
```
- **55+ chunks**, 60-200 words each, one idea per chunk. Required: `tags`, `level` (beginner/intermediate/advanced). Optional `levels`.
- Prefixes: `BA` basics, `OR` orbits, `MA` maneuvers, `SL` slingshots, `MI` missions, `HZ` hazards, `ER` mistakes, `TR` training, `LV` level tips, `TU` tutorial, `UP` upgrades, `PL` planner, `WM` window map, `TG` tugs and relay, `RP` reports, `AU` audio.
- Cover: controls, units and `mu`, circular and escape speed, orbit shapes, periapsis/apoapsis, prograde vs retrograde, why a burn at apoapsis raises periapsis, Hohmann transfer in game units, launch windows and why they repeat, reading the window map, gravity assists, soft landing, rendezvous, each hazard, eclipses, tugs, relay and line of sight, fuel budgeting, reading the preview, slow-mo, what the planner can and cannot do, Assist mode and what Assisted means, reading the flight report, audio cues (hum, ping, tuning fork, orchestra meaning), per-level tips, upgrade priorities, common mistakes.
- Content must be **correct in the game's physics**; spot-check formulas against `calc.js`.
- `build-knowledge.mjs` fails the build on duplicate ids, missing tags, or chunks over 250 words.

### 16.2 Retrieval
Tokenize (lowercase, strip punctuation, stopwords, light stemming); BM25 (`k1 = 1.5`, `b = 0.75`) with title x3 and tags x2; synonym map (`"too fast": [escape, speed, overshoot]`, `"crash": [periapsis, steep, altitude]`, `"save fuel": [slingshot, hohmann, efficient]`, `"when to launch": [window, map]`); boosts x1.3 for current-level chunks, x1.2 for matching skill level, extra boost for `TU-` during Flight School; top 4; `MIN_SCORE` threshold. Below threshold: say it does not have that in its guides and suggest two things it can answer. Never invent.

### 16.3 Intents (rule-based, first match wins)

| Intent | Triggers | Behavior |
|---|---|---|
| `calc` | circular speed, escape speed, period, "how much dv" | Compute with `calc.js` from the current level; show formula, numbers, citation |
| `hint` | "hint", "I'm stuck" | Next of 3 tiers; tier 3 draws the stored solution as a ghost path |
| `plan` | "plan a route", "how do I save fuel here" | Run the planner (worker); present the plan as editable ghosts; honesty rule applies |
| `explain_plan` | "why this plan" | Retrieve chunks for each element of the plan |
| `windows` | "when should I launch" | Answer from the window map data (best cell) with a ghost preview |
| `review` | "what went wrong", "how can I improve" | Findings from `summarize()` plus citations: 3 did-well, 3 improve |
| `explain_report` | "explain this report" | Read the report object plus retrieved chunks |
| `audio_help` | "what is that sound", "audio" | Retrieve `AU-` chunks |
| `tutorial` | "how do I play", "controls" | Cited `TU-` chunks plus Start/Resume Flight School buttons |
| `knowledge` | other game questions | Retrieve and compose with citations |
| `out_of_scope` | unrelated | Decline politely and suggest valid questions |

### 16.4 Launch-log findings (extend as needed)
Repeated `crash:<body>` -> raise periapsis with a prograde burn at apoapsis; `lost` with launch speed above escape -> lower power by about N%; launch-angle spread under 3 degrees across 4 attempts -> change launch time, not angle (open the window map); fuel above 1.5 x par -> try a gravity assist [SL-002]; `previewUsed = false` -> turn on the preview; `slowmoSeconds = 0` after failures -> use slow-mo for node placement; many assisted attempts -> try one unassisted run; praise when fuel is at or under par. Each finding carries a retrieval query so a citation is attached.

### 16.5 Answer format (extractive)
```
Short answer: <1-2 sentences from the best chunk or calculator result>
Try this: <1-3 concrete steps>
Your launches: <1 line from the log if relevant>
Sources: [OR-004] orbits.md, [MA-002] maneuvers.md
```
About 120 words max. Source ids are clickable chips opening the full chunk in a drawer. A "Why this answer" toggle shows retrieved titles and scores.

### 16.6 Coach UI
Slide-out panel (`H`), chat log, input, quick buttons: **Hint, Plan a route, Review my launches, Explain this level, How to play**. **Show me** draws ghost launch vectors and nodes. Auto-nudge toast after 3 failed attempts or 3 minutes on a level (once per level). Navigator lines show a small radio blip.

### 16.7 Optional LLM adapters (off by default)
Interface: `generate({question, stats, chunks, calc, plan}) -> Promise<string>`. `ollama.js` posts to `http://localhost:11434/api/generate` with a 20 s timeout; any error falls back silently to the extractive answer with a small "offline fallback" tag. `webllm.js` is a dynamic `import()` only when enabled. The prompt restricts answers to CONTEXT, CALC RESULTS, PLAN, and PLAYER LOG. The only allowed network string is `http://localhost:11434`, inside `adapters/ollama.js`.

## 17. Settings and persistence
`{ difficulty, quality ('auto'|'low'|'medium'|'high'), soundOn, volume, musicOn, humOn, pingOn, orchestraOn, reduceSound, mixLock, reducedMotion, showGrid, flowField, tutorialDone, tutorialSkipped, tutorialProgress:{lesson,step}, tutorialStepTimes, seenMechanics, upgrades, credits, stars, bestFuel }`. All storage access in try/catch with a memory fallback.

## 18. Offline guarantees and performance
`scripts/check-offline.mjs` fails if `dist/index.html` contains: `<script src="http`, `<link href="http`, `<img src="http`, `@import url(http`, `googleapis`, `cdn.`, `unpkg`, `jsdelivr`, `new Worker("http`, `importScripts("http`, or `fetch(`/`XMLHttpRequest` with a literal http URL other than `http://localhost:11434`. Allow `http://www.w3.org/` namespaces and `blob:`/`data:` worker sources. Manually verify: build, network off, double-click `dist/index.html` over `file://`, play Flight School with sound; if workers are blocked, the fallback must work.

Budgets: 60 fps on a mid-range laptop at Medium; particle caps (flow field 800, speed dust 300, total 1500); draw calls under 150; worker jobs never block rendering and show a progress indicator plus **Cancel**; `dist/index.html` under 3.5 MB.

## 19. Testing requirements
- `sim`: rails (period return, Kepler for e up to 0.7), probe (energy drift under 0.5% over 10 sim-minutes, no NaN), **preview equals flight**, calc values, missions (each type's win and non-win, relay needs line of sight), hazards, tugs (change the path, caps enforced), probes-as-rails (cached equals original), line of sight (segment-circle cases), scoring (assisted rules).
- `windowmap` and `planner`: per 9.1-9.3.
- `levels`: schema validation; every stored solution (including T1-T6, tugs, relay, ghost) passes via `npm run levels`.
- `progression`: unlock rules, upgrade caps, graduation bonus once only.
- `audio`: per 11.6; `report`: per 13.5; `a11y`: per section 14.
- `tutorial`: per 12.6.
- `coach`: ranking sanity, synonym expansion, below-threshold refusal, intent routing, calc numbers equal `calc.js`, plan numbers shown equal the plan object, hint tiers never repeat, review has 3+3 points, every answer ends with valid source ids, no source id missing from the KB, same question with different logs gives different output.

## 20. Definition of done
- [ ] `npm run verify` passes (tests, levels, build, offline check)
- [ ] **First launch plays Flight School automatically before any mission**; skip needs confirmation; resumable and replayable from the Title menu; graduation unlocks L1 and gives the starter bonus once
- [ ] Tutorial levels excluded from stats, stars, and credits; no step advances on a timer; Show me and Do it for me prevent softlocks
- [ ] 16 levels each solvable by a stored solution; windows matter in L4, L6, L10
- [ ] Preview equals flight; nodes, slow-mo, fuel, tugs, relay, and ghost race work
- [ ] All five mission types and three hazards; lose screen explains why
- [ ] Window map and planner work with the honesty rule; Assisted tagged and excluded from 3 stars
- [ ] Premium graphics visible on Medium and High (eclipses, clouds, lensing, flow field, ribbon, bloom); Low still looks good; auto-downgrade works
- [ ] Interactive audio: spatial thruster, gravity hum, Doppler flyby, target ping, time-dilation filter, reverb, cockpit/exterior mix, mastering, ducking, beat sync, orchestra, generative music
- [ ] Flight report, postcard export, and Orbit Song work offline
- [ ] Audio-only mode playable; `aria-live` announcements; keyboard and touch; reduced motion; colorblind-safe cues
- [ ] Coach: all intents, 55+ chunks, citations, no LLM needed
- [ ] Works from `file://` with the network off, with sound, workers (or fallback), and the coach
- [ ] README with how to run, architecture, how RAG, calculators, and the planner work, and a 3-minute demo script

## 21. Coding rules for agents
- `src/sim/` and coach logic must not import three.js or touch the DOM.
- Small files, one responsibility each; no file over about 300 lines.
- No global mutable state outside `state/`.
- Pin dependency versions exactly; justify any new dependency in one line.
- Never add telemetry that leaves the device.
- UI text: sentence case, plain verbs, specific errors ("That launch leaves the map after 6 seconds").
- Look at graphics before declaring them done (screenshots); listen to audio changes with headphones or ask the user to.
- When unsure, choose the simplest option that satisfies this file and note the assumption.

## 22. Out of scope
Multiplayer, accounts, level editor, imported models/textures/audio, 3D (non-planar) physics, n-body interaction between rail bodies, voice acting, a character cast (a possible later addition), server code, vector databases, any paid service. Stretch (only after everything above): seeded **Daily route** generator whose levels are verified by the planner.
