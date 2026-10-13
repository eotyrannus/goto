import type { Pt } from '../model/geometry';

// Lightweight handle on the live 3D scene for the toolbar's exports, drag-and-drop onto the floor,
// and end-to-end tests. It holds no three.js code itself — bridge.ts (in the lazily loaded 3D
// bundle) fills these in when the 3D view mounts, so the 2D editor stays small.

export const scene3dApi = {
  ready: false,
  /** True while an export is rendering. */
  exporting: false,
  view: (_kind: 'fit' | 'top') => {},
  setHovered: (_id: string | null) => {},
  floorPoint: (_clientX: number, _clientY: number): Pt | null => null,
  project: (_itemId: string): Pt | null => null,
  camera: (): { x: number; y: number; z: number } | null => null,
  png: (): string | null => null,
  glb: async (): Promise<ArrayBuffer | null> => null,
};
