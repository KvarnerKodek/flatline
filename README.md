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

URL switches: `?t=40` start time, `?still` render one frame, `?render` hide the controls.
Space plays and pauses, arrows skip five seconds, `R` restarts.

## Render to video

```sh
npx flatline-render --url http://127.0.0.1:5180/ --out film.mp4 --size 1280x720 --fps 30
```

Needs Chrome and ffmpeg. It uses the GPU (Metal on a Mac); `--software` forces SwiftShader. The output
has no controls, no watermark and no metadata.

## What is in the box

| Module | Purpose |
|---|---|
| `toon` | Shared uniforms, cel-shaded material, inverted-hull outline, glow sprites |
| `mood`, `sky`, `water` | Day to night palettes, painted sky and ridges, banded sea with wakes |
| `bob` | Float objects on the same swell the water draws |
| `post` | Bloom, grade, grain, fade |
| `hud` | Captions, chapters, scrubber, lock-on brackets and tags |
| `thermal` | White-hot inset view of tagged objects |
| `occupancy`, `swarm` | A sensor grid overlay and a mesh network overlay |
| `props` | Low-poly mesher and sea props (boats, buoy, lighthouse) |
| `timeline`, `player` | Film contract, easing, script checks, the page player |

## Rules the code keeps

- Everything is authored in display space: no colour management, no tone mapping, so a colour in the
  source is the colour on screen.
- Nothing in a frame depends on wall-clock time. If it does, video rendering will not match the page.
- `checkScript(film)` fails on overlapping or too-short captions, dash characters and bad chapters.

## Develop

```sh
npm install
npm run typecheck
npm test
```
