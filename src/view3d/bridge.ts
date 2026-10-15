// Implementations behind scene3dApi that need three.js. Lives in the lazily loaded 3D bundle;
// Scene3D installs it into the lightweight api object when the 3D view mounts.

import * as THREE from 'three';
import type { Pt } from '../model/geometry';
import { scene3dApi } from './api';
import { useDoors } from './doors';

interface Live {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

let live: Live | null = null;

export function attach(l: Live) {
  live = l;
  Object.assign(scene3dApi, impl, { ready: true });
}

export function detach() {
  live = null;
  scene3dApi.ready = false;
}

const impl = {
  doorShut: (id: string) => !!useDoors.getState().shut[id],

  /** Plan point (mm) on the floor under a screen position. */
  floorPoint(clientX: number, clientY: number): Pt | null {
    if (!live) return null;
    const rect = live.gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, live.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x * 1000, y: hit.z * 1000 };
  },

  /** Screen position of an item's or door's centre (for tests). */
  project(id: string): Pt | null {
    if (!live) return null;
    const door = live.scene.getObjectByName(`door-${id}`);
    // For doors aim at the first leaf: a double door's middle is empty space when it's open.
    const obj = live.scene.getObjectByName(`item-${id}`) ?? door?.children[door.children.length - 1];
    if (!obj) return null;
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()).project(live.camera);
    const rect = live.gl.domElement.getBoundingClientRect();
    return { x: rect.left + ((c.x + 1) / 2) * rect.width, y: rect.top + ((1 - c.y) / 2) * rect.height };
  },

  /** Camera position in plan millimetres plus eye height (for tests). */
  camera(): { x: number; y: number; z: number } | null {
    if (!live) return null;
    const p = live.camera.position;
    return { x: p.x * 1000, y: p.z * 1000, z: p.y * 1000 };
  },

  /** Render the current view (cutaway included) to a PNG data URL, without selection outlines. */
  png(): string | null {
    if (!live) return null;
    const { gl, scene, camera } = live;
    return withCleanScene(scene, false, () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    });
  },

  /** The scene as a binary glTF (.glb) for other 3D apps. */
  async glb(): Promise<ArrayBuffer | null> {
    if (!live) return null;
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const { scene } = live;
    return withCleanScene(scene, true, () => new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }) as Promise<ArrayBuffer>, true);
  },
};

/** Run `fn` with helpers hidden (and, for model export, every wall at full height), then restore. */
function withCleanScene<T>(scene: THREE.Scene, fullWalls: boolean, fn: () => T, async = false): T {
  const changed: [THREE.Object3D, boolean][] = [];
  const set = (o: THREE.Object3D, visible: boolean) => {
    if (o.visible !== visible) {
      changed.push([o, o.visible]);
      o.visible = visible;
    }
  };
  scene.traverse((o) => {
    if (o.userData.helper) set(o, false);
    if (fullWalls && o.userData.wallFull) set(o, true);
    if (fullWalls && o.userData.wallStub) set(o, false);
  });
  scene3dApi.exporting = true;
  const restore = () => {
    for (const [o, v] of changed) o.visible = v;
    scene3dApi.exporting = false;
  };
  const result = fn();
  if (async && result instanceof Promise) result.finally(restore);
  else restore();
  return result;
}
