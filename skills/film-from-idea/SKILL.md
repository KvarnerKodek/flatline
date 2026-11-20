---
name: film-from-idea
description: Turn a one-line idea into a finished flatline animation (story, scenes, score, live page) and drive it to a polished result with many verified iterations run by parallel agents. Use when asked to create a film, animation, explainer or promo with flatline, or to take an existing flatline film from "works" to "award level".
---

# Film from an idea

The lead (you) writes the story and the rules, owns the shared files, merges, runs the QA suite, routes findings and
reports honestly. Area agents do the making.

## 0. Intake

Ask only what you cannot decide: the idea or message, audience, length (default 60 to 120 s), tone, look, brand or
palette (if any), words to avoid, hard "never" rules, delivery formats and the iteration target. Everything else
gets a sensible default, stated in the bible. Record the user's standing directions verbatim in the bible and obey
them in every brief.

Scale the production to the film. Under 2 minutes: 3 to 5 agents, about 200 to 400 iterations. A 2 minute flagship
with 9 to 10 agents: about 1000. The target is the sum of logged, verified lines, not a promise about quality.

Pick the render look with `Film.look`: `CEL` is flat ink and paint; `GHIBLI` adds painted texture, haze and a warm
grade (pair it with `makeSoftClouds`). Brand only the page chrome, through `play(film, { theme })` with a
`className` and CSS `vars`; never bake a brand into flatline.

Choose the setting, season and light for the audience and the message, not for what flatline already has. If the
story needs a valley, a market or a costume the library lacks, build it as a general flatline module; never bend the
story toward an existing asset (a sea because there is water, a night because there are stars).

## 1. Story first

Write `BIBLE.md` before any code, from `templates/bible.md`:

- One-sentence story and the single thing the viewer must understand.
- A beat table with playback seconds.
- A repeatable grammar for each scene (for example problem, decision, payoff) so each reads in 3 seconds.
- Facts allowed on screen (only verifiable ones) and which numbers are illustrative.
- Colour script: what is natural, what is made, what is the magic, what is UI; forbidden hues.
- Zero-defect list and engineering rules (below).
- Humour beats that are visual and never cost clarity.

Make the story implicit where it can be shown (let characters act it out) and keep explicit text for the message
the audience must retain.

Ground the problem in one relatable person with a deadline (a farmer whose hands need wages today, not "SMEs need
liquidity"). Every transfer the story depends on shows giver and receiver in one frame and the caption names who is
paid. For a product film, end on the characters using the real product (its app on their phones), so the abstract
mechanism lands as something people do.

Get the user's sign-off on the beats before wave 0. Beat times are frozen from then on.

## 2. Scaffold

Vite + TypeScript + three. flatline ships TypeScript source; take it from a pinned commit
(`npm install github:KvarnerKodek/flatline#<commit>`) or, while the film also changes the library, alias it in
`vite.config.ts` to a flatline checkout: `flatline` to `<checkout>/src/index.ts`, `flatline/*` to
`<checkout>/src/*.ts`, with `resolve.dedupe: ['three']` and `server.fs.allow` covering the checkout. Record the
commit in the bible. The bundled tools need `npm i -D puppeteer-core`, `ffmpeg` on PATH and Chrome (set
`CHROME_PATH` off macOS).

Film code layout, one owner per file:

- `script.ts`: `DURATION`, the story clock `T` (named beats in seconds), captions and chapters.
- `geography.ts`: every position, footprint, path and lane as exported constants and pure functions. The world, the
  cameras and the tests import them from here and nowhere else.
- `world.ts`: builds the scene once. `film.ts`: the shot list, acting and `frame(world, t)`.
- `main.ts`: runs `checkScript` and `checkShots`, then `play(film)`.
- Optional: `paint.ts` (textures, signs, fonts), `music.ts` (the score), one file per scene in larger films,
  `scripts/` for probes and packing.

Use `Film.sun` for shadows and `flatline-render` for export.

Build wave 0 yourself: world, sky, terrain, a placeholder shot list with all beat times, captions, a score stub and
the unit tests (section 3). Show the user the running page before wave 1.

The film is a live three.js page; iterate on the page, not on video. Look with `flatline-stills` contact sheets
(`--every <s>` sweeps the whole film, `--times a,b,c` one range) and inspect any instant with the player's URL
parameters: `?t=<seconds>&still` freezes a frame and `?cam=x,y,z,lookX,lookY,lookZ[,fov]` overrides the camera (the
HUD hides itself); `flatline-stills --cam=...` takes the same value for a whole sheet.

For the user, build a single self-contained page: set `base: './'`, `build.assetsInlineLimit: 1 << 20`,
`cssCodeSplit: false` and `modulePreload: false`, run `vite build`, and have `scripts/page.mjs <out.html>` inline
the script and stylesheet from `dist/assets` into one HTML file (escape `</script` in the script). Share it
privately and update it in place after each wave.

## 3. Tests and detectors

Put the invariants a later change could break into the film's unit tests (vitest) first, so `npm test` guards every
merge: the camera never inside a solid or blocked from its subject, nothing below the ground plane, walker lanes
clear of benches and stalls, every coin or token accounted for at every beat, seeking in any order giving the same
state. Build the world and the tests from the same `geography.ts` constants, so moving a prop moves its test too;
a hand-copied number catches nothing.

Then add detectors. `flatline-check` (purity and jumps), `flatline-stills` (contact sheets, page and console errors)
and `flatline-render` ship with flatline. Every other row below is a script the film writes in `scripts/` as a
puppeteer probe: wait for `document.title === 'ready'`, then drive `window.__flatline.seek(t)` (and `.duration`);
for GPU time call `gl.finish()` after the seeks. Add a detector when its defect class has appeared, not before.
`scripts/qa_all.mjs` runs them and prints one table by time, owner area and kind.

| Detector | Finds |
|---|---|
| `flatline-check` | seek-order dependence, the biggest frame-to-frame jumps |
| `flatline-stills`, `smoke` | page, shader and console errors |
| `audit` | black or blown-out frames, intentional dips only |
| `flicker`, `blink` | shimmer, static-camera pixel changes between 1/30 s frames |
| `zfight` | coplanar same-facing faces (candidate list; judge visibility) |
| `obb` | oriented-box overlaps between actors (people, animals, vehicles) |
| `vehicles` | vehicles vs every static solid (including per-instance boxes) and terrain seating |
| `labels` | sprite or label planes clipped by geometry, label vs label on screen |
| `decals` | flat transparent meshes with hard alpha edges |
| `props` | floating or sunk props, houses on slopes |
| `ui` at 640x360, 960x540, 1280x720, 1920x1080 | text, chip and card overlaps |
| `fps` / gpu time per section | performance regressions |
| colour script | forbidden hues on made things |

State what each detector cannot see (instanced meshes, shorter-than-sample events, hidden faces) in `qa_all`
output so nobody mistakes silence for clean.

## 4. Area agents

Split the film by time range and by cross-cutting system, and assign ownership by file, not by concept:

- one agent per act or scene (opening, each location, finale); in a film whose acting lives in one `film.ts`,
  that file's owner also acts the characters,
- world and environment (terrain, sky, lighting, scenery, traffic),
- characters and animals (models, rig, faces; acting too when it has its own files),
- audio,
- art direction and editing (grade, UI chrome, captions, cuts, camera flow),
- QA and glitch hunting.

Brief each one from `templates/area-brief.md`. Every brief contains: the goal and the user's bar, the files to read
first (bible, previous logs), the files they own and must not touch, the checkout and port, the tool list, the
iteration quota, and the rules below. Quote the user's standing directions. Paste "Character acting and rigging"
into every brief whose files pose characters.

### Iteration protocol (what counts as one iteration)

One concrete change, judged on evidence, logged as one specific line in `iterations/<wave>_<area>.md`, numbered.
Evidence is a still crop or contact sheet at the relevant time, a numeric probe, a test or a detector run. A change
that failed its own check is fixed before it is logged. Never log an unverified change. Agents find defects
themselves: sweep stills every 0.5 s of their range as a harsh art director, frame each acting character at hand
scale with `?cam` (wide stills hide hands, garment seams and feet), run the detectors, and fix what they see before
being told.

### Rules for parallel work

Give each agent its own git worktree and branch of the film (and of flatline when its area changes the library),
its own dev server port (`npx vite --port <port> --strictPort`) and a Vite alias to its own flatline worktree;
keep that alias and port out of commits. Agents commit small verified steps on their own branch and never merge,
push or rebase. The lead merges branches locally one at a time and after each merge runs tsc, the tests and a
contact sheet before the next, resolving conflicts by keeping both sides' intent. Pushes and pull requests happen
only when the user asks.

If agents must share one checkout instead, use the shared-checkout rules in the brief template.

The brief carries the rest to every agent: frozen times, purity by construction (no `Math.random` or `Date`, seeded
generators, timings planned at load, tracked things as `f(i, t)`, fonts and textures loaded in `load`),
quiet-machine frame timing, and tests that assert properties rather than seeds or construction order.

### Character acting and rigging

`figure()` is a jointed rig; drive it with pose fields, never by moving its meshes:

- Props live in hands. `hold('L'|'R', prop)` parents a prop to the palm; `gripL`/`gripR` put a palm on a world point
  by two-bone IK (the bill's lower edge, a counter, a rail); `gripMixL`/`gripMixR` ease a hand onto and off a grip
  without a snap; `carry(obj, halfWidth)` puts both palms on its sides while `armL` and `armR` are above 0.8 and no
  grip is set. The arm is straight at 0.57 m from the shoulder, so keep grip targets within 0.5 m and move the prop,
  not the arm.
- Feet never slide. Derive the walk phase from distance covered, `walk = distance / walkSpeed(stride)`, never from
  `t * speed`; hold `stride` constant along a leg, ease the distance, turn on the spot at the ends and keep lanes
  clear of furniture.
- Gestures read when they anticipate and settle: `gesture(t, t0, dur)` winds up, overshoots and lands; `held()`
  ramps a hold in and out; `mixPose()` blends two poses field by field.
- Act every beat: wring hands while worried, lift and release, catch with both hands, glance at the phone, cheer
  with staggered timing. A character standing idle through its own story beat is a defect.

## 5. The wave loop

Plan the iteration target as waves: wave 1 builds each area to a baseline (about 10 per agent); later waves polish
(about 20 to 25 per agent per wave).

Each wave:

1. Run the tests, `qa_all` and a stills sweep of the whole film. Write findings with time, position and repro to
   `iterations/<wave>_findings.md`.
2. Send each owner its findings plus its quota and its open ideas.
3. Agents work in parallel. When reports arrive, verify the claims: count log lines with
   `grep -cE '^[0-9]+\. ' file`, rerun the owning tests and detectors, look at the stills yourself, then merge.
4. Agents typically stop after 7 to 12 iterations because of context budget. Resume them with the remaining list,
   and when an agent is spent, start a fresh agent for the same area with the old logs as context.
5. Route cross-area findings to the owner by message; never edit another owner's file except for a small anchored
   parameter change.
6. When the user reports a defect: reproduce it at a time, find the cause by raycast, layer hiding or a `?cam`
   close-up, fix it by construction, add a test or detector for the class, and check neighbouring areas for it.
7. End of wave: tests, `qa_all`, tsc, contact sheets, an updated preview page, then a short honest status for the
   user to steer the next wave.

Stop at the first of: the user is satisfied, two consecutive full sweeps find nothing new, the target is reached.
Say plainly which defect classes the tools cannot detect and what nobody has watched at 30 fps.

## 6. Recurring defect classes (check these from wave 1)

- Characters: hands built from thin parts that each get an ink hull and read as claws (make a palm, a mitten and a
  thumb); see-through gaps between garment pieces (waist or crotch); garments built facing the side; props covering
  a face; characters stacked at one spawn point or inside crates or vehicles.
- Collisions and seating: walkers through benches, stalls and each other; vehicles through solids; wheels buried or
  floating on slopes (seat on a grid of footprint points); props half-buried.
- World edges: the land mesh edge or a horizon disc showing in wide shots; close the world beyond the mesh and test
  that the ground disc stays under all land.
- Surfaces and ink: hard-edged decals and discs; z-fighting; labels clipping through the box they name (use a
  one-sided, alpha-tested, depth-writing plane a clearance off the surface); flat wing or leaf planes that read as
  shards; ink scribbling through sprites (give them a depth backing); heavy inked floor grids; confetti that reads
  as balls; birds half out of frame reading as discs.
- Colour and light: sky and ground tinted violet or pink by additive washes; saturated shadows; blown-out frames.
- Camera and UI: stalls at hard cuts (ease half linear, half smooth); text over text; UI over the action at small
  viewports; captions repeating a card.
- Performance: shadow casters on particles; textures uploaded on first use mid-film.

## 7. Deliverables

1. Tests, `qa_all`, `flatline-check` and tsc clean, with the known tails listed.
2. The review copy is the shared live page. Render video only when the user asks, from a static build (`vite build`,
   then `vite preview --port <p> --strictPort` and `flatline-render --url http://127.0.0.1:<p>/`), never from a dev
   server: a hot reload or a server restart destroys the page mid-render. Do not edit the film while it renders.
   `flatline-render` muxes the score in; for a silent file strip it afterwards
   (`ffmpeg -i in.mp4 -an -c:v copy out.mp4`). For a size target, encode two-pass H.264 at
   `target_MB * 8192 / seconds` kbit/s minus 8% (for 100 MB over 120 s about 6300 kbit/s with a 7500 maxrate)
   instead of a CRF. Verify size, duration, resolution and the absence of an audio stream with `ffprobe`, and look
   at three extracted frames. Report progress with an ETA every 5 minutes.
3. Copy outputs where the user asks. Report the true iteration count from the logs, the defects the tools cannot
   see, and anything unwatched.
4. Contribute general improvements to flatline as small changes (helpers, options, fixes) with neutral defaults and
   tests, never brand or story code. If the user wants anonymous commits, set author and committer env vars in
   every git command and verify `git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD` before pushing.
5. Report outcomes faithfully: failing checks with output, skipped steps, unverified claims, agents short of quota.
   A silent detector is not proof; say what was checked and what was not.
