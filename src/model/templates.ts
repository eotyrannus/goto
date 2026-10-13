import type { Design, FurnitureItem, Opening } from './types';
import { CATALOG_BY_TYPE, OPENING_BY_KIND } from './catalog';
import { DEFAULT_ROOM_HEIGHT } from './normalize';
import { uid } from './units';

// Rotation to put an item's back against a wall: top 0, right 90, bottom 180, left 270.

function item(type: string, x: number, y: number, rotation = 0, size?: [number, number]): FurnitureItem {
  const c = CATALOG_BY_TYPE[type];
  return { id: uid(), type, x, y, rotation, width: size?.[0] ?? c.width, depth: size?.[1] ?? c.depth, height: c.height, elevation: c.elevation };
}

function opening(kind: Opening['kind'], wall: Opening['wall'], offset: number, width: number, extra: Partial<Opening> = {}): Opening {
  const { height, sill } = OPENING_BY_KIND[kind];
  return { id: uid(), kind, wall, offset, width, height, sill, hinge: 'start', swing: 'in', ...extra };
}

export function newDesign(name: string, width = 3000, depth = 2500, parts: Partial<Design> = {}): Design {
  return {
    id: uid(),
    name,
    updatedAt: Date.now(),
    room: { width, depth, height: DEFAULT_ROOM_HEIGHT, wallThickness: 100 },
    openings: [],
    items: [],
    ...parts,
  };
}

export const templates: { name: string; description: string; build: () => Design }[] = [
  {
    name: 'Empty room',
    description: '3.0 × 2.5 m with one door',
    build: () => newDesign('Untitled room', 3000, 2500, { openings: [opening('door', 'bottom', 300, 900)] }),
  },
  {
    name: 'Focus pod',
    description: '1 person, 2.4 × 2.0 m',
    build: () =>
      newDesign('Focus pod', 2400, 2000, {
        openings: [opening('door', 'bottom', 1350, 900, { hinge: 'end' }), opening('window', 'top', 500, 1400)],
        items: [
          item('desk', 1200, 350),
          item('office-chair', 1200, 950),
          item('bookshelf', 175, 1150, 270),
          item('plant', 700, 1700),
        ],
      }),
  },
  {
    name: 'Duo pod',
    description: '2 people, 3.2 × 2.6 m',
    build: () =>
      newDesign('Duo pod', 3200, 2600, {
        openings: [opening('door', 'bottom', 2200, 900, { hinge: 'end' }), opening('window', 'top', 800, 1600)],
        items: [
          item('desk', 850, 350),
          item('desk', 2350, 350),
          item('office-chair', 850, 950),
          item('office-chair', 2350, 950),
          item('sideboard', 225, 1800, 270, [1200, 450]),
          item('plant', 1600, 2250),
          item('coat-rack', 2950, 1300),
        ],
      }),
  },
  {
    name: 'Meeting pod',
    description: '6 seats, 3.6 × 3.0 m',
    build: () =>
      newDesign('Meeting pod', 3600, 3000, {
        openings: [opening('door', 'bottom', 2500, 900, { hinge: 'end' }), opening('window', 'left', 900, 1200)],
        items: [
          item('table-rect', 1800, 1500),
          item('chair', 1300, 2190, 0),
          item('chair', 2300, 2190, 0),
          item('chair', 1300, 810, 180),
          item('chair', 2300, 810, 180),
          item('chair', 590, 1500, 90),
          item('chair', 3010, 1500, 270),
          item('tv', 1800, 45),
          item('whiteboard', 3570, 1300, 90),
        ],
      }),
  },
  {
    name: 'Lounge',
    description: 'Breakout area, 4.0 × 3.2 m',
    build: () =>
      newDesign('Lounge', 4000, 3200, {
        openings: [opening('double-door', 'bottom', 1200, 1600), opening('window', 'top', 600, 2800)],
        items: [
          item('rug', 2000, 1350, 0, [2400, 1600]),
          item('sofa', 2000, 525, 0, [2200, 850]),
          item('armchair', 600, 1500, 270),
          item('armchair', 3400, 1500, 90),
          item('coffee-table', 2000, 1500),
          item('side-table', 600, 600),
          item('plant', 3500, 500),
          item('floor-lamp', 3700, 2250),
        ],
      }),
  },
];
