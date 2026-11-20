import * as THREE from 'three';

const PLANE = new THREE.PlaneGeometry(1, 1);
const MAT = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
const at = new THREE.Vector3();
const back = new THREE.Vector3();
const size = new THREE.Vector3();

/** Pose of a camera-facing depth plane just behind `anchor`: `fx` and `fy` shrink it to the card, `dy` lifts it by a fraction of the card height. */
export function backingMatrix(out: THREE.Matrix4, anchor: THREE.Vector3, scale: THREE.Vector2, cam: THREE.Camera, o: { fx?: number; fy?: number; dy?: number } = {}) {
  const { fx = 0.92, fy = 0.83, dy = 0.04 } = o;
  back.set(0, 0, -Math.max(0.4, anchor.distanceTo(cam.position) * 0.012)).applyQuaternion(cam.quaternion);
  at.copy(anchor).add(back).y += scale.y * dy;
  return out.compose(at, cam.quaternion, size.set(scale.x * fx, scale.y * fy, 1));
}

/**
 * Screen-space ink lines are drawn from depth, so they scribble through cards, banners and sprites that write none.
 * A backing is an invisible plane that writes depth behind its sprite and hides the lines there. Call `sync` every frame.
 */
export class Backings {
  private items: { sprite: THREE.Sprite; plane: THREE.Mesh }[] = [];
  private world = new THREE.Vector3();
  private scale = new THREE.Vector2();

  /** Gives `sprite` a backing; returns the sprite. */
  add<S extends THREE.Sprite>(sprite: S, o: { fx?: number; fy?: number; dy?: number } = {}): S {
    const plane = new THREE.Mesh(PLANE, MAT);
    plane.matrixAutoUpdate = false;
    plane.frustumCulled = false;
    plane.visible = false;
    plane.onBeforeRender = (_r, _s, cam) => {
      sprite.getWorldPosition(this.world);
      backingMatrix(plane.matrixWorld, this.world, this.scale.set(sprite.scale.x, sprite.scale.y), cam, o);
    };
    this.items.push({ sprite, plane });
    return sprite;
  }

  /** Parents each backing beside its sprite and shows it only while the sprite is visible and not shrunk to nothing. */
  sync() {
    for (const { sprite, plane } of this.items) {
      if (!plane.parent) sprite.parent?.add(plane);
      plane.visible = sprite.visible && sprite.scale.x > 0.05;
    }
  }
}
