import * as THREE from 'three';
import { AFTERNOON, DAWN, GOLDEN, ambientCues, applyMood, cueBeats, CuePlayer, filmOf, hold, makeMeadow, makeSky, makeSoftClouds, moods, newFrame, orbitShot, push, script, shotList, updateSky, cutTrack } from '../../src';

const DURATION = 40;
const story = script([
  { at: 0, name: 'Dawn', say: 'A quiet meadow wakes.' },
  { at: 14, name: 'Day', say: ['The light climbs.', 'Clouds drift past.'] },
  { at: 30, name: 'Dusk', say: 'Gold fills the valley.' },
], { duration: DURATION });

const shots = shotList([
  hold(0, [0, 3, 30], [0, 6, 0], { name: 'wide', drift: 1, fadeIn: 1.5 }),
  push(14, [-20, 4, 24], [10, 5, 14], [0, 6, 0], [0, 8, 0], { name: 'push', fov: 36 }),
  orbitShot(30, [0, 5, 0], { radius: 30, height: 6, turns: 0.15, name: 'dusk', fadeOut: 2 }),
]);

const mood = moods([[0, DAWN], [14, AFTERNOON], [30, GOLDEN]]);
const cam = cutTrack(shots, DURATION);

/** The whole film: a meadow under a painted sky, three shots, a script and a generated score. */
export const starter = filmOf({
  duration: DURATION,
  ...story,
  load: async () => ({ scene: new THREE.Scene(), sky: makeSky(), clouds: makeSoftClouds(), ground: makeMeadow() }),
  scene: (w) => { w.scene.add(w.sky, w.clouds.group, w.ground); w.ground.userData.followY = 0; return w.scene; },
  follow: (w) => [w.sky, w.clouds.group, w.ground],
  sound: () => new CuePlayer([...ambientCues(DURATION, { feel: 'warm' }), ...cueBeats('bell', 30, DURATION, 3, { f: 880, v: 0.05 })], DURATION),
  frame(w, t) {
    const f = newFrame(), m = mood(t);
    applyMood(m); updateSky(m, 0.5); w.clouds.update(t);
    f.night = m.night;
    f.fade = cam(t, f.cam).fade;
    return f;
  },
});
