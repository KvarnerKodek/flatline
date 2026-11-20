import * as THREE from 'three';
import { ss } from './timeline';

/** Opacity at normalised radius `r`: 1 at the centre, 0 with zero slope at the rim, so a decal never shows an edge. */
export const softFalloff = (r: number) => 1 - ss(0, 1, r);

const discs = new Map<number, THREE.CanvasTexture>();

/** A white disc whose alpha follows `softFalloff`, cached per `size`; tint it with the material colour. */
export function softDisc(size = 64): THREE.CanvasTexture {
  let t = discs.get(size);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!, img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    img.data.fill(255, i, i + 3);
    img.data[i + 3] = Math.round(255 * softFalloff(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)));
  }
  g.putImageData(img, 0, 0);
  t = new THREE.CanvasTexture(c);
  discs.set(size, t);
  return t;
}

export interface DecalOptions {
  /** Width and depth in metres. */
  size: number | [number, number];
  color?: number;
  opacity?: number;
  /** Alpha texture; defaults to `softDisc()`. */
  map?: THREE.Texture;
}

/**
 * A flat patch lying on the ground, such as a shadow blob, wear, glow or dust. It blends without writing depth and is pulled
 * towards the camera by a polygon offset, so it does not z-fight the ground; a soft alpha keeps its rim invisible.
 * Position it at the ground height.
 */
export function decal({ size, color = 0x000000, opacity = 0.4, map = softDisc() }: DecalOptions): THREE.Mesh {
  const [w, d] = typeof size === 'number' ? [size, size] : size;
  const mat = new THREE.MeshBasicMaterial({ map, color, opacity, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  mesh.userData.noEdge = true;
  return mesh;
}
