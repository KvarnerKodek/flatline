# flatline

Cel-shaded procedural films for the web and for video.

A film is a pure function of time. `frame(world, t)` places everything and returns the camera, so the
same film plays in a page, scrubs, seeks to any instant and renders to an MP4 frame by frame.

## Quick start

A film in about twenty lines: a script, shots, moods, music and the Ghibli look. The full file is `examples/starter/film.ts`.

```ts
import { play, filmOf, newFrame, script, shotList, hold, push, orbitShot, cutTrack, moods, DAWN, GOLDEN,
  applyMood, ambientCues, CuePlayer, theme } from 'flatline';

const story = script([
  { at: 0, name: 'Dawn', say: 'A quiet meadow wakes.' },
  { at: 14, name: 'Dusk', say: ['The light climbs.', 'Gold fills the valley.'] },
], { duration: 40 });                                   // captions + chapters, numbered, never overlapping
const cam = cutTrack(shotList([
  hold(0, [0, 3, 30], [0, 6, 0], { drift: 1, fadeIn: 1.5 }),
  push(14, [-20, 4, 24], [10, 5, 14], [0, 6, 0], [0, 8, 0], { fov: 36 }),
  orbitShot(30, [0, 5, 0], { radius: 30, turns: 0.15, fadeOut: 2 }),
]), 40);
const mood = moods([[0, DAWN], [14, GOLDEN]]);

play(filmOf({
  duration: 40, ...story,                               // look defaults to GHIBLI
  load: async () => buildWorld(),                       // your meshes
  scene: (w) => w.scene,
  sound: () => new CuePlayer(ambientCues(40), 40),      // generated score
  frame(w, t) { const f = newFrame(), m = mood(t); applyMood(m); f.night = m.night; f.fade = cam(t, f.cam).fade; return f; },
}), { theme: theme('#e8a33d') });
```

Helpers, all pure functions of time and all with plain-language errors:

| Helper | Does |
|---|---|
| `filmOf(spec)` | the four required parts (`duration`, `load`, `scene`, `frame`) become a full `Film` with the `GHIBLI` look |
| `script(scenes, { duration })` | `{ captions, chapters }` from scenes with one or several `say` lines |
| `hold`, `push`, `orbitShot`, `shotList` | shots with `fov`, `drift`, `fadeIn`, `fadeOut` and an easing; run them with `cutTrack` |
| `EASE`, `easeBy`, `tween`, `keyframes` | named easings; a value from `[t, value, easing?]` keys |
| `moods([[t, mood]])` | a day-to-night timeline from pairs |
| `ambientCues(duration, { feel })`, `cueBeats(kind, from, to, step)` | a generated score and repeated effects |
| `theme(accent)` | page chrome in one colour |
| `checkFilm`, `checkScript`, `checkShots` | audits; `play` throws on an incomplete film and warns on script problems |

## Make a film in full

```ts
import { play, Film, newFrame, V, ss, mix, moodTrack, NIGHT, DAY, applyMood, makeSky, makeWater, updateSky, updateWater } from 'flatline';

const film: Film<World> = {
  duration: 60,
  captions: [{ t0: 2, t1: 8, k: '01 · Night', h: 'The sea never sleeps.' }],
  chapters: [{ t: 0, name: 'Night' }],
  load: async () => new World(),           // fetch assets, build meshes
  scene: (w) => w.scene,
  follow: (w) => [w.sky, w.water],         // re-centred on the camera every frame
  frame(w, t) {
    const f = newFrame();
    const mood = moodTrack([{ t: 0, mood: NIGHT }, { t: 40, mood: DAY }])(t);
    applyMood(mood); updateSky(mood, 0.5); updateWater(mood);
    f.night = mood.night;
    f.cam.p.set(0, 3, 12 - t * 0.1); f.cam.look.set(0, 1, 0);
    return f;
  },
};
play(film);
```

URL switches: `?t=40` start time, `?still` render one frame, `?render` hide the controls, `?cam=x,y,z,lx,ly,lz[,fov]` look
from a fixed camera to inspect any spot.
Space plays and pauses, arrows skip five seconds, `R` restarts.

## Render to video

```sh
npx flatline-render --url http://127.0.0.1:5180/ --out film.mp4 --size 1280x720 --fps 30
```

Needs Chrome and ffmpeg. A film with a `score` gets its music muxed in as AAC. It uses the GPU (Metal on a Mac); `--software` forces SwiftShader. The output
has no controls, no watermark and no metadata.

## What is in the box

| Module | Purpose |
|---|---|
| `easy` | Authoring helpers: `filmOf`, `script`, shot constructors, easings, `keyframes`, `moods`, `ambientCues`, `theme`, `checkFilm` |
| `toon` | Shared uniforms, painted cel shading (three bands, shadow-edge accent, waterline occlusion, tinted ink outline, day/night rim), glow sprites |
| `mood`, `sky`, `water` | Day to night palettes, painted sky and ridges, banded sea with wakes and calm glint |
| `clouds`, `birds` | Painted cumulus and a circling gull flock, both pure functions of time |
| `bob` | Float objects on the same swell the water draws; `placeOn` rests them on any surface, `seatPose` and `seatOn` seat a vehicle on uneven ground so no wheel is buried |
| `post` | Bloom, grade, grain, fade |
| `hud` | Captions, chapters, scrubber, lock-on brackets and tags that stay on screen and avoid each other |
| `thermal` | White-hot inset view of tagged objects |
| `occupancy`, `swarm`, `wind` | Sensor grid, mesh network and wind streak overlays |
| `props` | Smooth hull lofting, detailed sailboat, fishing boat, motorboat and ferry, waterline foam, buoy, lighthouse |
| `timeline`, `player` | Film contract, easing (`smoother`, `cutEase`, `ramp`, `pulse`, `outBack`, `bezier`), trapezoid ramps, time warp, script checks, the page player with end card and embed protocol |
| `shots` | Shot lists: each shot owns the film until the next, with cuts, fades, dolly, orbit, hand-held drift and a list check |
| `land`, `track` | Height-field land with painted shore or alpine palettes, plateaus, draped roads and fields; routes measured in metres, graded beds, railways, trains, glowing route lines |
| `town`, `figure` | Houses and chalets with lightable windows, church, market stall, fence, flowers, groves; articulated people, a cat and a cow |
| `score`, `soundtrack` | A film score as notes, synthesised deterministically (piano, bells, pads, strings, bass, reverb) and played in sync with film time; the renderer muxes the same audio |
| `critter` | `Critter`: a round helper with a glowing screen face (seven expressions, blinking), hover thruster, swinging arms, a two-segment tail and a lagging antenna; `secondary` is the pure secondary-motion function |
| `scenery` | `scatter` random spots by rule (`keepClear` and `corridorGap` keep them out of roads and vehicle lanes), `treeField` and `tufts` instanced forests and grass with sway and distance fade, `windmill` a tower mill with turning sails |
| `cues` | Sound effects and generative music as cues on the film clock, synthesised with WebAudio live and offline (`voice`, `bus`, `room`); `generateCues` writes a score from layers (pads, arpeggios, melody, pulse, ambient bed) and a loudness arc; `CuePlayer` plays and exports it |
| `motes`, `shadow` | Time-placed glows, coins and inked puffs, rain, arcs; sun shadows for every toon surface |
| `look` | `Look` presets (`CEL`, the original crisp toon, and `GHIBLI`, hand-painted) and `applyLook` |
| `edges` | Screen-space ink lines from depth, FXAA, distance haze and ground fog, driven by `Look.edges` and `Look.haze` |
| `softclouds` | Painted cumulus: lit lobes with bright tops, lavender undersides and a warm rim |
| `instanced` | `Inst`: thousands of copies in one draw call with per-instance colour, ink outline, wind sway and distance fade |
| `fx`, `meadow` | Scheduled sprite bursts; a painted meadow ground with a palette |
| `backing` | `Backings`: invisible camera-facing depth planes behind sprites, cards and banners so the ink lines of the scene behind never scribble through them |
| `label`, `decal` | `pinned` and `pinTo`: a one-sided alpha-tested card held a little off the surface it labels, so it never clips or scribbles ink; `decal` and `softDisc`: a ground patch with a soft rim and a polygon offset, so it shows no edge and no z-fight |
| `smoke`, `butterflies`, `fireworks` | Chimney smoke puffs, a meadow of butterflies around a focus point, opaque firework bursts with trails; each a pure function of time with its options exposed |
| `terrain` | `paintedTerrain`: one painted landscape mesh from any height function, with flat building sites, painted paths, patchwork fields, brush streaks, cloud and sun shadow and a relief rim; `valleyHeight`, `flattenSites`, `gridAxis` |

## Looks

A `Look` bundles everything that decides how a film is drawn: band softness, painterly mottling, ink colour and thickness, highlight and rim strength, ink lines from depth, haze and the final grade. Two ship with the library; the default (no `look`) is unchanged.

```ts
import { play, Film, GHIBLI } from 'flatline';
const film: Film<World> = { /* ... */, look: GHIBLI };   // or CEL, or your own Look
```

`GHIBLI` is hand-painted: soft band edges, brush-and-wash mottling on every surface (`G.uPaint`), warm brown ink instead of black (`setInk`), gentler highlights and rim, thin screen-space ink lines (`Look.edges`, which replace the inverted-hull outlines and also work on instanced meshes), periwinkle distance haze and valley mist (`Look.haze`, `setGroundFog`), and a grade with optional `paper` and `bleed`. Pair it with `makeSoftClouds` instead of `makeClouds`. Meshes that must not get ink lines (sprites, glows, the sky) are tagged `userData.noEdge = true`.

The page chrome is themable without touching flatline's own styles: `play(film, { theme: { className: 'brand', vars: { '--accent': '#505ff1' } } })` adds a body class and CSS variables so a host stylesheet can scope its rules. `play(film, { hud: { markers: 'none' } })` drops the lock-on brackets and leader lines for films where tracked objects are not targets (the default stays brackets); `tagStep` (pixels between overlapping tags, default 50) and `tagReach` (lowest a tag may sit as a fraction of the viewport height, default 0.55) tune the tag layout for small screens. Anything can rest on any surface with `placeOn(placed, pose, t, (x, z, t) => height)`; `place` is the sea version. Optional kits can be imported on their own: `flatline/sea` and `flatline/sensing`.

```ts
import { paintedTerrain, valleyHeight, G } from 'flatline';
G.uWaterline.value = 0;   // dry land: no sea darkening at y = 0
const land = paintedTerrain({
  height: valleyHeight({ axis: (z) => 60 * Math.sin(z * 0.0035) }),
  x: [[-1500, -400, 24], [-400, 400, 6], [400, 1500, 24]],   // [from, to, step]: fine grid near the action
  z: [[-1500, -300, 24], [-300, 300, 6], [300, 1000, 24]],
  sites: [{ x: -120, z: -40, rx: 30, rz: 22, y: 4 }],         // flat stands for buildings
  paths: [[{ x: -200, z: 100 }, { x: 0, z: -80 }]],
});
scene.add(land.mesh);
house.root.position.set(-120, land.stand(-120, -40), -40);
```

Sound comes either as notes (`score`, rendered by flatline's own synth) or as WebAudio cues:

```ts
import { generateCues, CuePlayer } from 'flatline';
const cues = generateCues({
  layers: [
    { type: 'pad', from: 0, to: 60, every: 8, chords: [{ root: 48 }, { root: 45, minor: true }] },
    { type: 'melody', from: 8, to: 56, root: 72, degrees: [0, 2, 4, 3, 2, 1], step: 0.8 },
    { type: 'bed', from: 0, to: 60 },
  ],
  arc: [[0, 0.6], [30, 1], [60, 0.7]],
  cues: [{ t: 12, k: 'honk', f: 220 }],        // hand-placed effects
});
const film = { /* ... */ sound: () => new CuePlayer(cues, 60) };   // the renderer muxes the same cues offline
```

## Review stills

```sh
npx flatline-stills --url http://127.0.0.1:5180/ --times 4,12,30 --size 1280x720 --cols 3 [--cam x,y,z,lx,ly,lz]
```

Renders chosen instants and tiles them into one labelled contact sheet, and lists page errors and warnings.

## Audit a film before shipping

```sh
npx flatline-check --url http://127.0.0.1:5180/
```

Checks that the picture does not depend on seek order and lists the biggest frame-to-frame jumps, which is how an
unplanned hard cut or pop is found. Run it after every scene change.

## Find defects over time

```sh
npx flatline-qa --url http://127.0.0.1:5180/ [--only obb,speed] [--from 0 --to 60] [--shard 2/8] [--owners owners.json] [--out qa-report.json]
npx flatline-qa --merge shard1.json shard2.json --out qa-report.json
```

Seeks through the film, runs the detectors (`--list` shows them: actor overlaps, speed spikes, teleports, backward walkers, camera jerk and undeclared cuts,
camera inside a box, pops, overlapping label cards, edge-on labels, coplanar decals, HUD overlap, blown or crushed frames, seek-order purity), prints a table and
writes a JSON report: per finding `detector`, `kind`, `t0`, `t1`, `area`, `files`, `agent`, `severity`, `fix` class, `peak`, `message` and a `repro` command.
Exit code 1 when a finding reaches `--fail-on` (default `high`). `--shard i/n` splits the time range so many agents run in parallel; `--merge` joins the reports.

The film is found through `window.__flatline.qa`, filled in by the player. Objects with `userData.qa` are discovered automatically (`tagQa(obj, 'actor' | 'label' | 'decal' | 'obstacle')`,
or `{ role, name, kind, maxSpeed, faces, canReverse, group }`; `pinned` and `decal` tag themselves). Anything else comes from the film:

```ts
const film = { ...,
  qa: (w) => ({
    actors: () => [{ name: 'truck1', root: w.truck, kind: 'vehicle' }],   // kinds: person, animal, vehicle (must face their travel), bot, flyer (never collide)
    obstacles: () => [{ name: 'house1', c: [x, y, z], h: [hx, hy, hz] }],
    cuts: [14.5, 25],                                                     // deliberate hard cuts
    ignore: [{ detector: 'speed', subject: '^cow', t0: 3, t1: 4 }],       // known, accepted
    owners: [{ match: '^truck', area: 'traffic', files: ['src/traffic.ts'], agent: 'traffic' }], // routes findings to the owning agent
  }) };
```

A host that cannot change the film passes `--setup register.js`, a function body that calls `qa.use({ actors, ... })`. Detector thresholds are tunable with `--config '{"obb.minPen":0.2}'`.

## Make a film with agents

`skills/film-from-idea` is an agent skill (SKILL.md) that takes a one-line idea to a finished film: it writes the story
bible, scaffolds a flatline project, then runs waves of parallel agents that each own one area and log small,
verified iterations, backed by detectors for overlaps, clipping, z-fighting, hard decals, label clashes and UI
collisions. Copy the folder into your agent's skills directory to use it.

## Work in parallel

`flatline-render --shards N` renders frame ranges in N browsers and encodes them in order, so the file is identical to a serial render. `flatline-stills --sizes 960x540,320x180 --spec batch.json` captures many times and sizes in one browser and writes a contact sheet per size plus `manifest.json`. `flatline-shard` prints JSON for the rest, and exits 1 when a check fails:

```sh
flatline-shard hash --url U --out v1.json --shards 8      # per-frame hashes and thumbnails
flatline-shard diff v1.json v2.json --within 40,55        # which times changed, by how much; fails if anything outside 40-55 s
flatline-shard claims claims.json                         # validate { version: 1, claims: [{ id, agent, area, files, time?, locks? }] } and find collisions
flatline-shard iter log.jsonl --min 13                    # validate and count verified iterations
flatline-shard harness --film dir --agent a17 [--dry]     # own port, shared Vite cache
```

An iteration is one JSON line: `{ "n": 1, "area": "hud", "change": "...", "evidence": { "kind": "stills|probe|benchmark|test", "ref": "..." }, "verified": true }`.

## Rules the code keeps

- Everything is authored in display space: no colour management, no tone mapping, so a colour in the
  source is the colour on screen.
- Nothing in a frame depends on wall-clock time. If it does, video rendering will not match the page.
- `checkScript(film)` fails on overlapping or too-short captions, dash characters and bad chapters.
- Hulls point their bow along +x; a test builds each craft and checks it.
- Fades and cuts are a pure, unit-tested function of time, never inline arithmetic spread over the render loop.
- A closing card that hands back to a host page should reuse the host's layout pixel for pixel so the cross-fade has no jump.

## Develop

```sh
npm install
npm run typecheck
npm test
```

## Use it from a project

```sh
npm install github:KvarnerKodek/flatline#<commit>
```

Import from the package root or any module path, for example `flatline/toon`, `flatline/water`, `flatline/hud`.
The renderer CLI needs `puppeteer-core` (optional peer) and ffmpeg. The film in `sentinel/sites/korsar-demo` is the
reference consumer: it keeps only film-specific code (vessel model, harbour, script, sonar) and imports the rest.
