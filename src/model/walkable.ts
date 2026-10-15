import { CATALOG_BY_TYPE, isDoor } from './catalog';
import { FLOOR_RAISE, mod10Outline } from './exterior';
import { boundsOf, frameToWorld, itemBounds, openingFrame, type Box, type Pt } from './geometry';
import type { Design } from './types';
import { wallBlocks } from './walls3d';

// What a person walking around in 3D bumps into, and the ground height under their feet.
// All in plan millimetres. Obstacles are pre-expanded by the walker's radius, so a position is
// blocked when it falls inside any of them.

export interface WalkWorld {
  obstacles: Box[];
  /** Where you're allowed to roam. */
  bounds: Box;
  /** Height of whatever you're standing on (0 = the room's floor). */
  ground: (p: Pt) => number;
}

export const WALKER_RADIUS = 220;
/** How far beyond the building you can wander. */
export const YARD = 5000;
const DECK_TOP = -40;

const grow = (b: Box, r: number): Box => ({ minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r });
const inside = (b: Box, p: Pt) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;

export function walkWorld(design: Design, shutDoors: ReadonlySet<string> = new Set(), r = WALKER_RADIUS): WalkWorld {
  const { room, openings, items, exterior } = design;
  const t = room.wallThickness;
  const shell = exterior.style !== 'none';
  // Cladding and battens add a little to the walls' outside face.
  const wallPad = r + (shell ? 40 : 0);
  const obstacles: Box[] = [];

  // Wall pieces that reach the floor block you: full-height wall and the wall under window sills.
  // Lintels over doors don't, so doorways and floor-level openings are how you get in and out.
  for (const b of wallBlocks(room, openings)) {
    if (b.z0 < 1500 && b.z1 > 150) obstacles.push(grow({ minX: b.x0, minY: b.y0, maxX: b.x1, maxY: b.y1 }, wallPad));
  }

  // A shut door fills its doorway.
  for (const o of openings) {
    if (!isDoor(o.kind) || !shutDoors.has(o.id)) continue;
    const f = openingFrame(room, o);
    obstacles.push(grow(boundsOf([frameToWorld(f, { x: 0, y: -t }), frameToWorld(f, { x: o.width, y: 0 })]), r));
  }

  // Furniture, except rugs and things mounted high on the wall.
  for (const it of items) {
    if (CATALOG_BY_TYPE[it.type]?.layer === 'floor' || it.elevation >= 1700) continue;
    obstacles.push(grow(itemBounds(it), r));
  }

  const bounds: Box = { minX: -t - YARD, minY: -t - YARD, maxX: room.width + t + YARD, maxY: room.depth + t + YARD };

  // Ground: the room floor inside (and across thresholds), the deck in front, the lawn elsewhere.
  const footprint: Box = { minX: -t, minY: -t, maxX: room.width + t, maxY: room.depth + t };
  const deck = shell ? boundsOf(mod10Outline(room, exterior).deck) : null;
  const ground = (p: Pt) => {
    if (!shell) return 0;
    if (inside(footprint, p)) return 0;
    if (deck && inside(deck, p)) return DECK_TOP;
    return -FLOOR_RAISE;
  };

  return { obstacles, bounds, ground };
}

export function isBlocked(world: WalkWorld, p: Pt): boolean {
  if (!inside(world.bounds, p)) return true;
  return world.obstacles.some((b) => inside(b, p));
}
