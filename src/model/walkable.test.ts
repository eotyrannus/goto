import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTERIOR, FLOOR_RAISE } from './exterior';
import { newDesign } from './templates';
import type { Opening } from './types';
import { isBlocked, walkWorld } from './walkable';

const door: Opening = { id: 'd', kind: 'door', wall: 'bottom', offset: 1000, width: 900, height: 2100, sill: 0, color: '#d8c3a0', material: 'wood', hinge: 'start', swing: 'in' };
const win: Opening = { id: 'w', kind: 'window', wall: 'top', offset: 1000, width: 1200, height: 1200, sill: 900, color: '#fff', hinge: 'start', swing: 'in' };
const design = (shell: boolean) =>
  newDesign('t', 3000, 2500, { openings: [door, win], exterior: shell ? { ...DEFAULT_EXTERIOR, style: 'mod10' } : DEFAULT_EXTERIOR });

/** Walk in a straight line in small steps; true if nothing blocks the way. */
function canWalk(world: ReturnType<typeof walkWorld>, from: { x: number; y: number }, to: { x: number; y: number }) {
  for (let i = 0; i <= 100; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / 100, y: from.y + ((to.y - from.y) * i) / 100 };
    if (isBlocked(world, p)) return false;
  }
  return true;
}

describe('walking around', () => {
  const centre = { x: 1450, y: 1250 };
  it('lets you out through an open doorway but not through walls or windows', () => {
    const w = walkWorld(design(true));
    expect(canWalk(w, centre, { x: 1450, y: 4000 })).toBe(true); // out the door, across the deck
    expect(canWalk(w, centre, { x: -1500, y: 1250 })).toBe(false); // through the left wall
    expect(canWalk(w, centre, { x: 1600, y: -1500 })).toBe(false); // through the window (sill)
  });

  it('a shut door blocks the doorway', () => {
    const w = walkWorld(design(true), new Set(['d']));
    expect(canWalk(w, centre, { x: 1450, y: 4000 })).toBe(false);
  });

  it('lets you walk all the way round the outside', () => {
    const w = walkWorld(design(true));
    const corners = [
      { x: -1200, y: 4300 },
      { x: -1200, y: -1200 },
      { x: 4200, y: -1200 },
      { x: 4200, y: 4300 },
      { x: -1200, y: 4300 },
    ];
    for (let i = 0; i < corners.length - 1; i++) expect(canWalk(w, corners[i], corners[i + 1])).toBe(true);
    expect(isBlocked(w, { x: 1450, y: 9000 })).toBe(true); // beyond the yard
  });

  it('steps down from the floor to the deck to the lawn', () => {
    const w = walkWorld(design(true));
    expect(w.ground(centre)).toBe(0);
    expect(w.ground({ x: 1450, y: 3000 })).toBe(-40);
    expect(w.ground({ x: 1450, y: 4500 })).toBe(-FLOOR_RAISE);
    expect(walkWorld(design(false)).ground({ x: 1450, y: 4500 })).toBe(0);
  });
});
