import { describe, expect, it } from 'vitest';
import { canonicalFrame, DEFAULT_EXTERIOR, mod10Heights, mod10Outline, mod10Parts, mod10Profile, mod10RoomSize, MOD10, toCanonical, toPlan, type Exterior } from './exterior';
import { wallBlocks } from './walls3d';
import type { Opening, Room, Wall } from './types';

const room: Room = { width: 3400, depth: 2400, height: 2500, wallThickness: 100, wallColor: '#fff', floorColor: '#fff' };
const door: Opening = { id: 'd', kind: 'door', wall: 'bottom', offset: 1200, width: 900, height: 2100, sill: 0, color: '#d8c3a0', material: 'wood', hinge: 'start', swing: 'in' };
const win: Opening = { id: 'w', kind: 'window', wall: 'left', offset: 600, width: 1000, height: 1000, sill: 900, color: '#fff', hinge: 'start', swing: 'in' };
const ext = (front: Wall): Exterior => ({ ...DEFAULT_EXTERIOR, style: 'mod10', front });
const WALLS: Wall[] = ['top', 'right', 'bottom', 'left'];

describe('canonical frame', () => {
  it.each(WALLS)('round-trips points with the front on %s', (front) => {
    const f = canonicalFrame(room, front);
    for (const p of [{ x: 0, y: 0 }, { x: 1234, y: 567 }, { x: room.width, y: room.depth }]) {
      const back = toPlan(f, toCanonical(f, p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
  });

  it.each(WALLS)('puts the canonical front (y = D) on the %s wall', (front) => {
    const f = canonicalFrame(room, front);
    const mid = toPlan(f, { x: f.L / 2, y: f.D });
    const expected = { top: { x: room.width / 2, y: 0 }, bottom: { x: room.width / 2, y: room.depth }, left: { x: 0, y: room.depth / 2 }, right: { x: room.width, y: room.depth / 2 } }[front];
    expect(mid.x).toBeCloseTo(expected.x);
    expect(mid.y).toBeCloseTo(expected.y);
    expect(f.side('bottom')).toBe(front);
  });
});

/** Does a part's box overlap an opening's volume where it passes through the wall? */
function blocks(parts: ReturnType<typeof mod10Parts>['parts'], f: ReturnType<typeof canonicalFrame>, o: Opening, r: Room) {
  // Opening volume in plan coordinates, extended outwards through the cladding.
  const t = r.wallThickness;
  const along = o.wall === 'top' || o.wall === 'bottom';
  const span = [o.offset + 5, o.offset + o.width - 5];
  const across =
    o.wall === 'top' ? [-t - 60, 0] : o.wall === 'bottom' ? [r.depth, r.depth + t + 60] : o.wall === 'left' ? [-t - 60, 0] : [r.width, r.width + t + 60];
  return parts.some((p) => {
    if (p.side === 'roof' || p.side === 'base') return false;
    const zTop = p.shape === 'wedge' ? p.z + Math.max(p.sz, p.topFront ?? 0) : p.z + p.sz / 2;
    const zBot = p.shape === 'wedge' ? p.z : p.z - p.sz / 2;
    if (zTop <= o.sill + 5 || zBot >= o.sill + o.height - 5) return false;
    const c = [toPlan(f, { x: p.x - p.sx / 2, y: p.y - p.sy / 2 }), toPlan(f, { x: p.x + p.sx / 2, y: p.y + p.sy / 2 })];
    const xs = [Math.min(c[0].x, c[1].x), Math.max(c[0].x, c[1].x)];
    const ys = [Math.min(c[0].y, c[1].y), Math.max(c[0].y, c[1].y)];
    const [u, v] = along ? [xs, ys] : [ys, xs];
    return u[1] > span[0] && u[0] < span[1] && v[1] > across[0] && v[0] < across[1];
  });
}

describe('Mod 10 shell', () => {
  it.each(WALLS)('leaves every door and window open with the front on %s', (front) => {
    const openings = [door, win];
    const { parts, frame } = mod10Parts(room, openings, ext(front));
    expect(parts.length).toBeGreaterThan(50);
    for (const p of parts) for (const v of [p.x, p.y, p.z, p.sx, p.sy, p.sz]) expect(Number.isFinite(v)).toBe(true);
    for (const o of openings) expect(blocks(parts, frame, o, room)).toBe(false);
  });

  it('has a skillion roof that is high at the front and a deck in front of the front wall', () => {
    const { parts } = mod10Parts(room, [], ext('bottom'));
    const roof = parts.find((p) => p.side === 'roof' && p.tilt)!;
    expect(roof.tilt).toBeGreaterThan(0); // positive tilt lifts the +y (front) edge
    const deck = parts.filter((p) => p.side === 'base' && p.sy === 88);
    expect(deck.length).toBeGreaterThan(10);
    expect(Math.min(...deck.map((p) => p.y - p.sy / 2))).toBeGreaterThan(room.depth);
    expect(Math.max(...deck.map((p) => p.y + p.sy / 2)) - room.depth).toBeLessThanOrEqual(100 + 18 + MOD10.deck + 1);
  });

  it('sizes the room so the outside matches the catalogue footprint', () => {
    expect(mod10RoomSize(room, 'bottom')).toEqual({ width: 3600 - 236, depth: 2600 - 236, height: 2400 });
    expect(mod10RoomSize(room, 'left')).toEqual({ width: 2600 - 236, depth: 3600 - 236, height: 2400 });
  });

  it('outlines the deck on the front side of the plan', () => {
    const { deck } = mod10Outline(room, ext('right'));
    expect(Math.min(...deck.map((p) => p.x))).toBeGreaterThan(room.width);
  });
});

describe('Mod 10 interior (raked ceiling)', () => {
  const h = mod10Heights(room);

  it('rises 400 mm from back to front, with the walls reaching the roof line', () => {
    expect(h.frontCeiling - h.backCeiling).toBe(400);
    const blocks = wallBlocks(room, [door], mod10Profile(room, ext('bottom')));
    // Side walls slope up towards the front (bottom) wall.
    const left = blocks.filter((b) => b.wall === 'left' && b.z1End !== undefined);
    expect(left.length).toBeGreaterThan(0);
    for (const b of left) expect(b.z1End!).toBeGreaterThan(b.z1);
    // The back wall stops at the low side, the front wall reaches the high side (measured along
    // the middle of each wall, a few mm up or down the slope from the outer face).
    expect(Math.abs(Math.max(...blocks.filter((b) => b.wall === 'top').map((b) => b.z1)) - h.backTop)).toBeLessThan(20);
    expect(Math.abs(Math.max(...blocks.filter((b) => b.wall === 'bottom').map((b) => b.z1)) - h.frontTop)).toBeLessThan(20);
  });

  it.each(WALLS)('cuts the highlight windows through the %s (front) wall, above a door below them', (front) => {
    const d: Opening = { ...door, wall: front, offset: 900 };
    const blocks = wallBlocks(room, [d], mod10Profile(room, ext(front)));
    const onFront = blocks.filter((b) => b.wall === front);
    const horizontal = front === 'top' || front === 'bottom';
    const covers = (u: number, z: number) =>
      onFront.some((b) => {
        const [u0, u1] = horizontal ? [b.x0, b.x1] : [b.y0, b.y1];
        const top = Math.max(b.z1, b.z1End ?? b.z1);
        return u > u0 && u < u1 && z > b.z0 && z < top;
      });
    const mid = (horizontal ? room.width : room.depth) / 2;
    const quarter = mid / 2;
    const zHighlight = (h.highlight.z0 + h.highlight.z1) / 2;
    expect(covers(quarter, zHighlight)).toBe(false); // highlight pane
    expect(covers(1000, 1000)).toBe(false); // the door
    expect(covers(1000, 2150)).toBe(true); // wall between the door head and the highlight
    expect(covers(mid, zHighlight)).toBe(true); // the mullion between the panes
  });

  it('includes an evenly lit raked ceiling in the shell', () => {
    const { parts } = mod10Parts(room, [], ext('bottom'));
    const ceiling = parts.find((p) => p.unlit);
    expect(ceiling).toBeDefined();
    expect(ceiling!.tilt).toBeGreaterThan(0);
  });
});
