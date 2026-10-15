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
  /** Top at the block's near end (x0 for top/bottom walls, y0 for left/right). */
  z1: number;
  /** Sloping tops only: the top at the far end (x1 or y1). */
  z1End?: number;
}

/** A raked ceiling: walls rise to `top`, and extra openings (e.g. highlight windows) are cut. */
export interface WallProfile {
  /** Height of the wall top over a plan point. */
  top: (p: Pt) => number;
  gaps: Pick<Opening, 'wall' | 'offset' | 'width' | 'sill' | 'height'>[];
}

/**
 * Wall solids for the 3D view. Each wall is cut into vertical strips at every opening edge; in
 * each strip the wall fills the heights no opening covers (sill below a window, lintel above a
 * door). Openings may overlap along a wall, e.g. a door under a highlight window. Top and bottom
 * walls own the corners, as in 2D. With a profile, walls rise to a sloping top.
 */
export function wallBlocks(room: Room, openings: Opening[], profile?: WallProfile): Block[] {
  const { width: W, depth: D, height: H, wallThickness: t } = room;
  const blocks: Block[] = [];

  const sides: { wall: Wall; start: number; end: number; across: [number, number]; horizontal: boolean }[] = [
    { wall: 'top', start: -t, end: W + t, across: [-t, 0], horizontal: true },
    { wall: 'bottom', start: -t, end: W + t, across: [D, D + t], horizontal: true },
    { wall: 'left', start: 0, end: D, across: [-t, 0], horizontal: false },
    { wall: 'right', start: 0, end: D, across: [W, W + t], horizontal: false },
  ];

  for (const side of sides) {
    const mid = (side.across[0] + side.across[1]) / 2;
    const topAt = (u: number) => (profile ? profile.top(side.horizontal ? { x: u, y: mid } : { x: mid, y: u }) : H);
    const push = (a: number, b: number, z0: number, za: number, zb = za) => {
      if (b - a <= 0.5 || Math.max(za, zb) - z0 <= 0.5) return;
      const [c0, c1] = side.across;
      const sloped = Math.abs(zb - za) > 0.5 ? { z1End: zb } : {};
      blocks.push(
        side.horizontal
          ? { wall: side.wall, x0: a, x1: b, y0: c0, y1: c1, z0, z1: za, ...sloped }
          : { wall: side.wall, x0: c0, x1: c1, y0: a, y1: b, z0, z1: za, ...sloped },
      );
    };
    const holes = [...openings, ...(profile?.gaps ?? [])]
      .filter((o) => o.wall === side.wall)
      .map((o) => ({ a: o.offset, b: o.offset + o.width, z0: o.sill, z1: o.sill + o.height }))
      .filter((g) => g.b > side.start && g.a < side.end);
    const edges = [...new Set([side.start, side.end, ...holes.flatMap((g) => [g.a, g.b])])]
      .filter((u) => u >= side.start && u <= side.end)
      .sort((p, q) => p - q);
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i];
      const b = edges[i + 1];
      const covering = holes.filter((g) => g.a < b - 0.5 && g.b > a + 0.5).sort((p, q) => p.z0 - q.z0);
      let z = 0;
      for (const g of covering) {
        if (g.z0 > z) {
          const cap = Math.min(g.z0, topAt(a), topAt(b));
          push(a, b, z, cap);
        }
        z = Math.max(z, g.z1);
      }
      push(a, b, z, topAt(a), topAt(b));
    }
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
