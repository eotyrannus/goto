import { describe, expect, it } from 'vitest';
import { normalizeDesign } from './normalize';
import type { Design } from './types';

describe('normalizeDesign', () => {
  it('fills in heights missing from designs saved before heights existed', () => {
    const old = {
      id: 'x',
      name: 'old',
      updatedAt: 0,
      room: { width: 3000, depth: 2000, wallThickness: 100 },
      items: [{ id: 'a', type: 'bookshelf', x: 0, y: 0, width: 900, depth: 350, rotation: 0 }],
      openings: [{ id: 'w', kind: 'window', wall: 'top', offset: 0, width: 1200, hinge: 'start', swing: 'in' }],
    } as unknown as Design;
    const d = normalizeDesign(old);
    expect(d.room.height).toBe(2500);
    expect(d.items[0].height).toBe(1800);
    expect(d.openings[0]).toMatchObject({ height: 1200, sill: 900 });
  });

  it('keeps heights that are already set', () => {
    const d = normalizeDesign({
      id: 'x',
      name: 'n',
      updatedAt: 0,
      room: { width: 3000, depth: 2000, height: 3100, wallThickness: 100 },
      items: [{ id: 'a', type: 'desk', x: 0, y: 0, width: 1, depth: 1, height: 1050, rotation: 0 }],
      openings: [],
    });
    expect(d.room.height).toBe(3100);
    expect(d.items[0].height).toBe(1050);
  });
});
