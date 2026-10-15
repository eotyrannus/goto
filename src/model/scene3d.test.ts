import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { furnitureParts, hasModel } from './furniture3d';
import { doorLeafSegments, wallBlocks } from './walls3d';
import type { Opening } from './types';

const room = { width: 3000, depth: 2000, height: 2500, wallThickness: 100, wallColor: '#ffffff', floorColor: '#ffffff' };
const opening = (p: Partial<Opening>): Opening => ({ id: 'o', kind: 'door', wall: 'top', offset: 1000, width: 900, height: 2100, sill: 0, color: '#d8c3a0', hinge: 'start', swing: 'in', ...p });
const volume = (bs: ReturnType<typeof wallBlocks>) => bs.reduce((v, b) => v + (b.x1 - b.x0) * (b.y1 - b.y0) * (b.z1 - b.z0), 0);

describe('wallBlocks', () => {
  it('is four full-height walls with no openings', () => {
    const bs = wallBlocks(room, []);
    expect(bs).toHaveLength(4);
    expect(bs.every((b) => b.z0 === 0 && b.z1 === 2500)).toBe(true);
    const t = 100;
    expect(volume(bs)).toBe(((3000 + 2 * t) * t * 2 + 2000 * t * 2) * 2500);
  });

  it('removes exactly the opening volume and keeps a lintel above a door', () => {
    const bs = wallBlocks(room, [opening({})]);
    expect(volume(wallBlocks(room, [])) - volume(bs)).toBe(900 * 100 * 2100);
    const lintel = bs.find((b) => b.wall === 'top' && b.x0 === 1000 && b.x1 === 1900);
    expect(lintel).toMatchObject({ z0: 2100, z1: 2500 });
  });

  it('keeps wall under a window sill', () => {
    const bs = wallBlocks(room, [opening({ kind: 'window', wall: 'right', offset: 500, width: 1000, height: 1200, sill: 900 })]);
    const pieces = bs.filter((b) => b.wall === 'right' && b.y0 === 500 && b.y1 === 1500);
    expect(pieces.map((b) => [b.z0, b.z1]).sort((a, b) => a[0] - b[0])).toEqual([
      [0, 900],
      [2100, 2500],
    ]);
    expect(pieces.every((b) => b.x0 === 3000 && b.x1 === 3100)).toBe(true);
  });

  it('skips the lintel when an opening reaches the ceiling', () => {
    const bs = wallBlocks(room, [opening({ kind: 'opening', height: 2500 })]);
    expect(bs.some((b) => b.wall === 'top' && b.x0 === 1000)).toBe(false);
  });
});

describe('doorLeafSegments', () => {
  it('draws an inward door part-open into the room from its hinge', () => {
    const [leaf] = doorLeafSegments(room, opening({ hinge: 'start' }));
    expect(leaf.hinge).toEqual({ x: 1000, y: 0 });
    expect(leaf.end.y).toBeGreaterThan(300);
    expect(Math.hypot(leaf.end.x - 1000, leaf.end.y)).toBeCloseTo(900);
  });
  it('closes flush in the wall and opens square to it', () => {
    const [shut] = doorLeafSegments(room, opening({}), 0);
    expect(shut.end.x).toBeCloseTo(1900);
    expect(shut.end.y).toBeCloseTo(0);
    const [open] = doorLeafSegments(room, opening({ wall: 'left', hinge: 'end' }), 1);
    expect(open.end.x).toBeCloseTo(900);
  });
  it('draws an outward door outside the wall', () => {
    const [leaf] = doorLeafSegments(room, opening({ swing: 'out' }));
    expect(leaf.end.y).toBeLessThan(-100);
  });
});

describe('furnitureParts', () => {
  it.each(CATALOG.map((c) => [c.type, c] as const))('%s has a model that fits its footprint', (type, c) => {
    expect(hasModel(type)).toBe(true);
    for (const [w, d, h] of [
      [c.width, c.depth, c.height],
      [c.min[0], c.min[1], c.min[2]],
    ]) {
      const parts = furnitureParts(type, w, d, h);
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) {
        // Small allowances for handles, trays and monitors that stick out a little.
        expect(Math.abs(p.x) + p.sx / 2).toBeLessThanOrEqual(w / 2 + 40);
        expect(Math.abs(p.y) + p.sy / 2).toBeLessThanOrEqual(d / 2 + 140);
        expect(p.z - p.sz / 2).toBeGreaterThanOrEqual(-1);
        for (const v of [p.x, p.y, p.z, p.sx, p.sy, p.sz]) expect(Number.isFinite(v)).toBe(true);
        expect(p.sx).toBeGreaterThan(0);
        expect(p.sy).toBeGreaterThan(0);
        expect(p.sz).toBeGreaterThan(0);
      }
    }
  });
});

describe('furniture colours', () => {
  it.each(CATALOG.map((c) => [c.type, c] as const))('%s is drawn in its default colour and can be recoloured', (type, c) => {
    const plain = furnitureParts(type, c.width, c.depth, c.height, c.color, c.color);
    expect(plain.some((p) => p.color.toLowerCase() === c.color.toLowerCase())).toBe(true);
    const red = furnitureParts(type, c.width, c.depth, c.height, '#cc2222', c.color);
    expect(red.some((p) => p.color === '#cc2222')).toBe(true);
    expect(red.some((p) => p.color.toLowerCase() === c.color.toLowerCase())).toBe(false);
  });
});
