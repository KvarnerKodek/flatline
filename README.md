# flatline

Cel-shaded procedural films for the web and for video.

A film is a pure function of time. `frame(world, t)` places everything and returns the camera, so the
same film plays in a page, scrubs, seeks to any instant and renders to an MP4 frame by frame.

## Make a film

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
| `toon` | Shared uniforms, painted cel shading (three bands, shadow-edge accent, waterline occlusion, tinted ink outline, day/night rim), glow sprites |
| `mood`, `sky`, `water` | Day to night palettes, painted sky and ridges, banded sea with wakes and calm glint |
| `clouds`, `birds` | Painted cumulus and a circling gull flock, both pure functions of time |
| `bob` | Float objects on the same swell the water draws |
| `post` | Bloom, grade, grain, fade |
| `hud` | Captions, chapters, scrubber, lock-on brackets and tags that stay on screen and avoid each other |
| `thermal` | White-hot inset view of tagged objects |
| `occupancy`, `swarm`, `wind` | Sensor grid, mesh network and wind streak overlays |
| `props` | Smooth hull lofting, detailed sailboat, fishing boat, motorboat and ferry, waterline foam, buoy, lighthouse |
| `timeline`, `player` | Film contract, easing (`smoother`, `ramp`, `pulse`, `outBack`, `bezier`), trapezoid ramps, time warp, script checks, the page player with end card and embed protocol |
| `shots` | Shot lists: each shot owns the film until the next, with cuts, fades, dolly, orbit, hand-held drift and a list check |
| `land`, `track` | Height-field land with painted shore or alpine palettes, plateaus, draped roads and fields; routes measured in metres, graded beds, railways, trains, glowing route lines |
| `town`, `figure` | Houses and chalets with lightable windows, church, market stall, fence, flowers, groves; articulated people, a cat and a cow |
| `score`, `soundtrack` | A film score as notes, synthesised deterministically (piano, bells, pads, strings, bass, reverb) and played in sync with film time; the renderer muxes the same audio |
| `motes`, `shadow` | Time-placed glows, coins and inked puffs, rain, arcs; sun shadows for every toon surface |
| `look` | `Look` presets (`CEL`, the original crisp toon, and `GHIBLI`, hand-painted) and `applyLook` |
| `edges` | Screen-space ink lines from depth, FXAA, distance haze and ground fog, driven by `Look.edges` and `Look.haze` |
| `softclouds` | Painted cumulus: lit lobes with bright tops, lavender undersides and a warm rim |
| `instanced` | `Inst`: thousands of copies in one draw call with per-instance colour, ink outline, wind sway and distance fade |
| `fx`, `meadow` | Scheduled sprite bursts; a painted meadow ground with a palette |

## Looks

A `Look` bundles everything that decides how a film is drawn: band softness, painterly mottling, ink colour and thickness, highlight and rim strength, ink lines from depth, haze and the final grade. Two ship with the library; the default (no `look`) is unchanged.

```ts
import { play, Film, GHIBLI } from 'flatline';
const film: Film<World> = { /* ... */, look: GHIBLI };   // or CEL, or your own Look
```

`GHIBLI` is hand-painted: soft band edges, brush-and-wash mottling on every surface (`G.uPaint`), warm brown ink instead of black (`setInk`), gentler highlights and rim, thin screen-space ink lines (`Look.edges`, which replace the inverted-hull outlines and also work on instanced meshes), periwinkle distance haze and valley mist (`Look.haze`, `setGroundFog`), and a grade with optional `paper` and `bleed`. Pair it with `makeSoftClouds` instead of `makeClouds`. Meshes that must not get ink lines (sprites, glows, the sky) are tagged `userData.noEdge = true`.

The page chrome is themable without touching flatline's own styles: `play(film, { theme: { className: 'brand', vars: { '--accent': '#505ff1' } } })` adds a body class and CSS variables so a host stylesheet can scope its rules. `play(film, { hud: { markers: 'none' } })` drops the lock-on brackets and leader lines for films where tracked objects are not targets (the default stays brackets). Anything can rest on any surface with `placeOn(placed, pose, t, (x, z, t) => height)`; `place` is the sea version. Optional kits can be imported on their own: `flatline/sea` and `flatline/sensing`.

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
