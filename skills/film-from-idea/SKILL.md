---
name: film-from-idea
description: Turn a one-line idea into a finished flatline animation (story, scenes, score, render) and drive it to a polished result with hundreds of verified iterations run by parallel agents. Use when asked to create a film, animation, explainer or promo with flatline, or to take an existing flatline film from "works" to "award level".
---

# Film from an idea

A flatline film is a pure function of time, so every defect can be reproduced at an exact instant and checked by a
tool. This skill turns that into a production line: idea, story, build, then waves of parallel agents that each own
one area and log small verified iterations, until detectors and a harsh stills review find nothing left.

The lead (you) writes the story and the rules, owns the shared files, runs the QA suite, routes findings and
reports honestly. Area agents do the making.

## 0. Intake

Ask only what you cannot decide: the idea or message, audience, length (default 60 to 120 s), tone, brand or
palette (if any), words to avoid, hard "never" rules, delivery formats. Everything else gets a sensible default,
stated in the bible. Record the user's standing directions verbatim in the bible and obey them in every brief.

A brand look is an opt-in theme passed to `play(film, { theme })`. It is never baked into flatline.

## 1. Story first

Write `BIBLE.md` before any code, from `templates/bible.md`:

- One-sentence story and the single thing the viewer must understand.
- A beat table with playback seconds. Times are frozen after sign-off.
- A repeatable grammar for each scene (for example problem, decision, payoff) so each reads in 3 seconds.
- Facts allowed on screen (only verifiable ones) and which numbers are illustrative.
- Colour script: what is natural, what is made, what is the magic, what is UI; forbidden hues.
- Zero-defect list and engineering rules (below).
- Humour beats that are visual and never cost clarity.

Make the story implicit where it can be shown (let characters act it out) and keep explicit text for the message
the audience must retain.

## 2. Scaffold

Vite + TypeScript + three, flatline from a pinned commit (`npm install github:KvarnerKodek/flatline#<commit>`).
One dev server on a fixed port, never a second. Film code structure: one file per scene or area, `main.ts` for the
shot list and story clock `T`, `script.ts` for captions and chapters (run `checkScript`), `palette.ts` and
`brand.ts` for tokens, `audio.ts` for the score, `tools/` for QA. Use `GHIBLI` or `CEL` looks, `Film.sun` shadows
and `flatline-render` for export. Keep film-specific engine leftovers in `src/fl/`; send general improvements
upstream instead of forking.

Build wave 0 yourself: world, sky, terrain, a placeholder shot list with all beat times, captions, HUD, a score
stub and smoke test. Everything after is parallel.

## 3. Build the QA suite before the polish waves

Detectors beat eyes: the user will otherwise find glitches one at a time. Build these first (`tools/qa_all.mjs`
runs them and prints one table by time, owner area and kind). Every time a human reports a defect, add the
detector class for it and fix the whole class, not the instance.

| Detector | Finds |
|---|---|
| `flatline-check`, `smoke` | seek-order dependence, jumps, shader/page errors |
| `audit` | black or blown-out frames, intentional dips only |
| `flicker`, `blink` | shimmer, static-camera pixel changes between 1/30 s frames |
| `zfight` | coplanar same-facing faces (candidate list; judge visibility) |
| `obb` | oriented-box overlaps between actors (people, animals, bots, vehicles) |
| `vehicles` | vehicles vs every static solid (including per-instance boxes) and terrain seating |
| `labels` | sprite/label planes clipped by geometry, label vs label on screen |
| `decals` | flat transparent meshes with hard alpha edges |
| `props` | floating or sunk props, houses on slopes |
| `camera` | camera under ground or inside geometry |
| `ui` at 640x360, 960x540, 1280x720, 1920x1080 | text/chip/card overlaps |
| `fps` / gpu time per section | performance regressions |
| colour script | forbidden hues on made things |
| contact sheets | stills every 0.5 to 1 s for the art-director pass |

State what each detector cannot see (instanced meshes, shorter-than-sample events, hidden faces) in `qa_all`
output so nobody mistakes silence for clean.

## 4. Area agents

Split the film by time range and by cross-cutting system, one owner per file group:

- one agent per act or scene (opening, each maker/location, finale),
- world and environment (terrain, sky, lighting, scenery, traffic),
- characters and animals (models, faces, animation),
- audio,
- art direction and editing (grade, UI chrome, captions, cuts, camera flow),
- QA and glitch hunting.

Brief each one from `templates/area-brief.md`. Every brief must contain: the goal and user's bar, the files to read
first (bible, previous logs), the files they own and the files they must not touch, the tool list, the iteration
quota, and the rules below. Quote the user's standing directions.

### Iteration protocol (what counts as one iteration)

One concrete change, judged on evidence, logged as one specific line in `iterations/<wave>_<area>.md`, numbered.
Evidence is a still crop or contact sheet at the relevant time, a numeric probe, or a detector run. A change that
failed its own check is fixed before it is logged. Never log an unverified change. Agents must find defects
themselves: sweep stills every 0.5 s of their range as a harsh art director, run the detectors, and fix what they
see before being told.

### Rules for parallel work on one codebase

- Shared files: small unique-anchor edits only, re-read right before editing, never overwrite whole files, never
  change an existing export signature.
- One dev server. Never render video while others edit. Hot reloads cause "Execution context was destroyed":
  re-run.
- The shared server is slow under load: batch many times into one snapshot call (16 per contact sheet) and use
  unique output filenames per agent.
- Story times, shot times and caption times are frozen unless the bible says otherwise.
- Never merge a PR. Never publish externally without the user's say.
- Make timing deterministic by construction (precompute and plan lanes at load, no reactive per-frame pushing),
  because pushes add kinks and a film must be a pure function of time.

## 5. The wave loop (to 1000 iterations)

1000 iterations is the sum of logged, verified lines, not a promise about quality. Plan it as waves:

- Wave 1 builds each area to a baseline (about 10 per agent).
- Waves 2 to N polish (about 20 to 25 per agent per wave). With 9 to 10 agents that is 200 to 250 per wave, so
  four to five waves reach 1000.

Each wave:

1. Run `qa_all` and a stills sweep of the whole film. Write findings with time, position and repro to
   `iterations/<wave>_findings.md`.
2. Send each owner its findings plus its quota and its open ideas. Resume agents that stopped early.
3. Agents work in parallel. When reports arrive, verify the claims: count log lines with
   `grep -c "^[0-9]*\. " file`, rerun the owning detectors, look at the stills yourself.
4. Agents typically stop after 7 to 12 iterations because of context budget. Do not accept that as done: resume
   them with the remaining list, and when an agent is spent, start a fresh agent for the same area with the old
   logs as context.
5. Route cross-area findings to the owner by message, never edit another owner's file except for a small anchored
   fix that is a pure parameter change.
6. When the user reports a defect: reproduce it at a time, find the cause by raycast or layer hiding, fix it by
   construction, add or extend a detector for the class, and check the neighbouring areas for the same class.
7. End of wave: full `qa_all`, tsc, smoke, contact sheets, then a short honest status.

Stop when a full sweep finds nothing new in two consecutive passes, or at the iteration target. Say plainly which
defect classes the tools cannot detect and what nobody has watched at 30 fps.

## 6. Recurring defect classes (check these from wave 1)

Hard-edged ground decals and discs; coplanar faces and z-fighting; labels clipping through the box they name
(use a one-sided, alpha-tested, depth-writing plane a clearance off the surface); vehicles through trees, stalls,
houses and each other; wheels buried or floating on slopes (seat on a grid of footprint points); characters
stacked at one spawn point; characters inside crates or vehicles; props half-buried; flat unlit wing or leaf
planes that read as shards; ink lines scribbling through sprites (give sprites a depth backing); sky and ground
tinted violet or pink by additive washes; confetti dots that read as balls; floors with heavy inked grids;
saturated shadow colours; blown-out ignition or wash frames; cameras that stall at hard cuts (ease half linear,
half smooth); birds half out of frame reading as discs; text over text; UI covering the action at small
viewports; captions that repeat what a card already says; performance cliffs in busy sections (shadow casters on
particles).

## 7. Deliverables

1. Final `qa_all`, `flatline-check`, tsc and smoke clean, with the known tails listed.
2. Render with sound at 1280x720 for review, then a silent 1080p for delivery when asked:
   render at 1920x1080, strip audio and encode two-pass H.264 at a bitrate of
   `target_MB * 8192 / seconds` kbit/s minus 8% (for 100 MB over 120 s about 6000 kbit/s with a 7500 maxrate).
   Verify size, duration, resolution and the absence of an audio stream with `ffprobe`.
3. Copy outputs where the user asks. Report the true iteration count from the logs, the defects the tools cannot
   see, and anything unwatched.
4. Contribute general improvements to flatline as small PRs (helpers, options, fixes) with neutral defaults and
   tests, never brand or story code. If the user wants anonymous commits, set author and committer env vars in
   every git command and verify `git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD` before pushing.

## 8. Honest reporting

Report outcomes faithfully: failing checks with output, skipped steps, unverified claims, agents that fell short
of quota. A detector that is silent is not proof. Perfect is a direction: say what was checked and what was not.
