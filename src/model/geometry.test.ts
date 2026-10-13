import { describe, expect, it } from 'vitest';
import {
  clampOpening,
  convexOverlap,
  doorLeaves,
  doorSwingPolygons,
  frameToWorld,
  itemBounds,
  nearestWall,
  openingFrame,
  snapBox,
} from './geometry';
import { findIssues } from './clashes';
import { newDesign } from './templates';
import type { FurnitureItem, Opening } from './types';

const room = { width: 3000, depth: 2000, height: 2500, wallThickness: 100 };
const item = (p: Partial<FurnitureItem>): FurnitureItem => ({ id: 'a', type: 'desk', x: 500, y: 500, width: 1000, depth: 500, height: 740, elevation: 0, rotation: 0, ...p });
const door = (p: Partial<Opening>): Opening => ({ id: 'd', kind: 'door', wall: 'top', offset: 1000, width: 900, height: 2100, sill: 0, hinge: 'start', swing: 'in', ...p });

describe('item bounds', () => {
  it('swaps extents when rotated 90°', () => {
    const b = itemBounds(item({ rotation: 90 }));
    expect(b.minX).toBeCloseTo(250);
    expect(b.maxX).toBeCloseTo(750);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(1000);
  });
});

describe('convexOverlap', () => {
  const sq = (x: number, y: number, s = 10) => [
    { x, y },
    { x: x + s, y },
    { x: x + s, y: y + s },
    { x, y: y + s },
  ];
  it('detects overlap', () => expect(convexOverlap(sq(0, 0), sq(5, 5))).toBe(true));
  it('treats touching as not overlapping', () => expect(convexOverlap(sq(0, 0), sq(10, 0))).toBe(false));
  it('separates distant shapes', () => expect(convexOverlap(sq(0, 0), sq(50, 50))).toBe(false));
});

describe('opening frames', () => {
  it('maps the opening span onto the right part of each wall', () => {
    for (const wall of ['top', 'right', 'bottom', 'left'] as const) {
      const o = { wall, offset: 400, width: 800 };
      const f = openingFrame(room, o);
      const a = frameToWorld(f, { x: 0, y: 0 });
      const b = frameToWorld(f, { x: 800, y: 0 });
      const along = (p: { x: number; y: number }) => (wall === 'top' || wall === 'bottom' ? p.x : p.y);
      expect([along(a), along(b)].map(Math.round).sort((m, n) => m - n)).toEqual([400, 1200]);
      // +y in the frame points into the room
      const inward = frameToWorld(f, { x: 400, y: 100 });
      expect(inward.x).toBeGreaterThanOrEqual(0);
      expect(inward.x).toBeLessThanOrEqual(room.width);
      expect(inward.y).toBeGreaterThanOrEqual(0);
      expect(inward.y).toBeLessThanOrEqual(room.depth);
    }
  });

  it('clamps openings onto the wall', () => {
    expect(clampOpening(room, { wall: 'right' as const, offset: 1800, width: 900 }).offset).toBe(1100);
    expect(clampOpening(room, { wall: 'top' as const, offset: -50, width: 900 }).offset).toBe(0);
    expect(clampOpening(room, { wall: 'left' as const, offset: 0, width: 5000 }).width).toBe(2000);
  });

  it('finds the nearest wall', () => {
    expect(nearestWall(room, { x: 2950, y: 900 })).toMatchObject({ wall: 'right', along: 900 });
    expect(nearestWall(room, { x: 1200, y: 1990 })).toMatchObject({ wall: 'bottom', along: 1200 });
  });
});

describe('doors', () => {
  it('opens leaves into the room for inward swing', () => {
    for (const hinge of ['start', 'end'] as const) {
      const [leaf] = doorLeaves(door({ hinge }), 100);
      expect(leaf.open.y).toBe(900);
      for (const p of leaf.arc) expect(p.y).toBeGreaterThanOrEqual(-1e-6);
    }
  });
  it('treats hinge start as the left/top end on every wall', () => {
    // Bottom wall: the frame runs right-to-left, so a left hinge sits at the frame's far end.
    const [bottom] = doorLeaves(door({ wall: 'bottom', hinge: 'start' }), 100);
    expect(bottom.hinge.x).toBe(900);
    const [top] = doorLeaves(door({ wall: 'top', hinge: 'start' }), 100);
    expect(top.hinge.x).toBe(0);
  });
  it('opens leaves outside the wall for outward swing', () => {
    const [leaf] = doorLeaves(door({ swing: 'out', hinge: 'end' }), 100);
    expect(leaf.open.y).toBe(-1000);
    for (const p of leaf.arc) expect(p.y).toBeLessThanOrEqual(-100 + 1e-6);
  });
  it('double doors have two half-width leaves', () => {
    const leaves = doorLeaves(door({ kind: 'double-door', width: 1600 }), 100);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.open.y)).toEqual([800, 800]);
  });
  it('outward doors sweep nothing inside', () => {
    expect(doorSwingPolygons(room, door({ swing: 'out' }))).toEqual([]);
  });
});

describe('snapBox', () => {
  it('snaps an edge to a nearby wall line', () => {
    const r = snapBox({ x: 507, y: 1000 }, { x: 500, y: 250 }, { x: [0, 3000], y: [0, 2000] }, 0, 20);
    expect(r.x).toBe(500);
    expect(r.guides).toContainEqual({ axis: 'x', value: 0 });
  });
  it('falls back to the grid', () => {
    const r = snapBox({ x: 1234, y: 1234 }, { x: 250, y: 250 }, { x: [], y: [] }, 100, 5);
    expect(r.x - 250).toBe(1000);
    expect(r.y - 250).toBe(1000);
  });
});

describe('findIssues', () => {
  it('flags overlap, out-of-room and door swing', () => {
    const d = newDesign('t', 3000, 2000, {
      openings: [door({ offset: 1000 })],
      items: [
        item({ id: 'a', x: 600, y: 600 }),
        item({ id: 'b', x: 900, y: 700 }),
        item({ id: 'c', x: 2950, y: 1500, type: 'cabinet' }),
        item({ id: 'd', x: 1400, y: 300, width: 300, depth: 300, type: 'plant' }),
        item({ id: 'rug', x: 600, y: 600, type: 'rug' }),
        item({ id: 'chair', x: 600, y: 700, type: 'office-chair', width: 600, depth: 600 }),
        item({ id: 'tall', x: 2500, y: 1000, width: 300, depth: 300, height: 2600, type: 'cabinet' }),
      ],
    });
    const issues = findIssues(d);
    expect([...(issues.get('a') ?? [])]).toContain('overlap');
    expect([...(issues.get('b') ?? [])]).toContain('overlap');
    expect([...(issues.get('c') ?? [])]).toContain('outside');
    expect([...(issues.get('d') ?? [])]).toContain('door');
    expect([...(issues.get('tall') ?? [])]).toEqual(['ceiling']);
    expect(issues.has('rug')).toBe(false);
    expect(issues.has('chair')).toBe(false);
  });
});
