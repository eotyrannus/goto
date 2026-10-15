import { doorLeaves, frameToWorld, openingFrame, type Pt } from './geometry';
import type { Opening, Room, Wall } from './types';

/** An axis-aligned block in plan coordinates (mm): x/y as on the plan, z is height above the floor. */
export interface Block {
  wall: Wall;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/**
 * Wall solids for the 3D view: full-height runs between openings, plus the wall above every
 * opening (lintel) and below every window (sill). Top and bottom walls own the corners, as in 2D.
 */
export function wallBlocks(room: Room, openings: Opening[]): Block[] {
  const { width: W, depth: D, height: H, wallThickness: t } = room;
  const blocks: Block[] = [];

  const sides: { wall: Wall; start: number; end: number; across: [number, number]; horizontal: boolean }[] = [
    { wall: 'top', start: -t, end: W + t, across: [-t, 0], horizontal: true },
    { wall: 'bottom', start: -t, end: W + t, across: [D, D + t], horizontal: true },
    { wall: 'left', start: 0, end: D, across: [-t, 0], horizontal: false },
    { wall: 'right', start: 0, end: D, across: [W, W + t], horizontal: false },
  ];

  for (const side of sides) {
    const push = (a: number, b: number, z0: number, z1: number) => {
      if (b - a <= 0.5 || z1 - z0 <= 0.5) return;
      const [c0, c1] = side.across;
      blocks.push(
        side.horizontal
          ? { wall: side.wall, x0: a, x1: b, y0: c0, y1: c1, z0, z1 }
          : { wall: side.wall, x0: c0, x1: c1, y0: a, y1: b, z0, z1 },
      );
    };
    const gaps = openings.filter((o) => o.wall === side.wall).sort((a, b) => a.offset - b.offset);
    let cursor = side.start;
    for (const o of gaps) {
      const a = o.offset;
      const b = o.offset + o.width;
      if (a > cursor) push(cursor, a, 0, H);
      push(Math.max(a, cursor), b, 0, o.sill);
      push(Math.max(a, cursor), b, o.sill + o.height, H);
      cursor = Math.max(cursor, b);
    }
    push(cursor, side.end, 0, H);
  }
  return blocks;
}

/** How far doors open in 3D (0 = shut, 1 = square to the wall). */
export const DOOR_OPEN = 0.9;

/** Door leaves as plan-space segments (hinge → free end) at `amount` open (0 = shut, 1 = fully open). */
export function doorLeafSegments(room: Room, o: Opening, amount = DOOR_OPEN): { hinge: Pt; end: Pt }[] {
  const frame = openingFrame(room, o);
  return doorLeaves(o, room.wallThickness).map((leaf) => {
    // arc[0] is the hinge, arc[1] the shut position; rotate from shut towards fully open.
    const shut = leaf.arc[1];
    const len = Math.hypot(shut.x - leaf.hinge.x, shut.y - leaf.hinge.y);
    const a0 = Math.atan2(shut.y - leaf.hinge.y, shut.x - leaf.hinge.x);
    const a1 = Math.atan2(leaf.open.y - leaf.hinge.y, leaf.open.x - leaf.hinge.x);
    let sweep = a1 - a0;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep <= -Math.PI) sweep += 2 * Math.PI;
    const a = a0 + sweep * amount;
    const end = { x: leaf.hinge.x + Math.cos(a) * len, y: leaf.hinge.y + Math.sin(a) * len };
    return { hinge: frameToWorld(frame, leaf.hinge), end: frameToWorld(frame, end) };
  });
}
