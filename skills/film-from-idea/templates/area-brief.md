# Area brief (fill in and send as the agent prompt)

You are one of N parallel agents polishing <film> at <project path> (Vite + three + flatline). The user's bar:
<award-level visuals, no glitches, story that does X, in the user's words>. Standing directions: <quote them>.

READ FIRST: BIBLE.md, previous logs `iterations/*<area>*.md`, `iterations/*findings*.md`, the files you own.

Checkout: your own worktree <path> on branch <branch>; start it with `npx vite --port <port> --strictPort`;
flatline is aliased to <flatline worktree> (keep the alias and port out of commits). Never render video.
<If shared checkout instead: one dev server <url>; small unique-anchor edits, re-read right before editing, never
overwrite whole files or change an existing export signature; on "Execution context was destroyed" another agent
hot-reloaded, re-run; unique output filenames.>
Tools: <list with one-line usage>. Inspect an instant with `?t=<s>&still` and a camera with
`?cam=x,y,z,lookX,lookY,lookZ[,fov]`. Take many times per snapshot call; unique output names in <scratch folder>.

YOUR AREA: <time range and files you own>. Files you must not touch: <list>. Story, shot and caption times are
frozen. Commit small verified steps on your branch; never merge, push or rebase. The film is a pure function of
time: no `Math.random` or `Date` (seeded generators), timings planned at load, tracked things as `f(i, t)`, fonts
and textures loaded in `load`, positions from `geography.ts`. Assert properties in tests, not seeds or construction
order.

DELIVER at least <quota> verified iterations. One iteration is one concrete change judged on evidence (stills at
the relevant time, a numeric probe, a test or a detector run), logged as one specific numbered line in
`iterations/<wave>_<area>.md`. Do not log unverified changes; fix a change that fails its check before logging.
Do not stop before the quota unless you can show a clean sweep of your range.

FIND DEFECTS YOURSELF as a harsh art director and technical director: sweep stills of your range every 0.5 s, look
for anything glitchy, strange, clipped, overlapping, popping, jerky, off-palette, blown-out, muddy, flat or boring,
and check story clarity for each beat within 3 seconds. Use `flatline-stills --times` for your range. Frame every
acting character at hand scale with `?cam`: hands on props, waist and garment seams, feet planted. Ideas, not a
limit: <area-specific list>. Known open items: <findings routed to this owner>.
<If your files pose characters: paste SKILL.md "Character acting and rigging" here.>

Run tsc and `npm test` before each commit, <detectors> after each batch, smoke after shader changes. Measure frame
time only when no other headless browser is running. Report honestly: the count of log lines
(`grep -cE '^[0-9]+\. ' file`), what you did not verify, and what the detectors cannot see.
