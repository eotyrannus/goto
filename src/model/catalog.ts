import type { OpeningKind } from './types';

/**
 * How an item takes part in clash checks:
 * floor – rugs etc., never clash; seat – chairs and pedestals, may tuck under desks and tables;
 * furniture – solid pieces that shouldn't overlap each other.
 */
export type ItemLayer = 'floor' | 'seat' | 'furniture';

export type Category = 'Work' | 'Meeting' | 'Lounge' | 'Storage' | 'Fixtures' | 'Decor';

export interface CatalogEntry {
  type: string;
  name: string;
  category: Category;
  width: number;
  depth: number;
  height: number;
  /** [width, depth, height] limits. */
  min: [number, number, number];
  max: [number, number, number];
  layer: ItemLayer;
}

const e = (
  type: string,
  name: string,
  category: Category,
  [width, depth, height]: [number, number, number],
  layer: ItemLayer = 'furniture',
  min: [number, number] = [200, 200],
  max: [number, number] = [4000, 3000],
): CatalogEntry => ({
  type,
  name,
  category,
  width,
  depth,
  height,
  layer,
  min: [...min, layer === 'floor' ? 2 : 50],
  max: [...max, 3000],
});

export const CATALOG: CatalogEntry[] = [
  e('desk', 'Desk', 'Work', [1400, 700, 740], 'furniture', [600, 400]),
  e('desk-l', 'Corner desk', 'Work', [1600, 1600, 740], 'furniture', [1000, 1000]),
  e('bench-desk', 'Bench desk (2p)', 'Work', [1400, 1500, 740], 'furniture', [1000, 1000]),
  e('office-chair', 'Office chair', 'Work', [620, 620, 1100], 'seat', [400, 400], [900, 900]),
  e('pedestal', 'Pedestal', 'Work', [420, 550, 600], 'seat', [300, 300], [800, 900]),

  e('table-rect', 'Meeting table', 'Meeting', [1800, 900, 740], 'furniture', [600, 600]),
  e('table-round', 'Round table', 'Meeting', [1100, 1100, 740], 'furniture', [500, 500], [2500, 2500]),
  e('chair', 'Chair', 'Meeting', [480, 520, 850], 'seat', [350, 350], [800, 800]),
  e('stool', 'Stool', 'Meeting', [400, 400, 650], 'seat', [250, 250], [700, 700]),

  e('sofa', 'Sofa', 'Lounge', [2000, 850, 800], 'furniture', [1200, 600]),
  e('armchair', 'Armchair', 'Lounge', [850, 850, 800], 'furniture', [500, 500], [1400, 1400]),
  e('coffee-table', 'Coffee table', 'Lounge', [1000, 550, 420], 'furniture', [300, 300]),
  e('side-table', 'Side table', 'Lounge', [450, 450, 550], 'furniture', [250, 250], [900, 900]),

  e('bookshelf', 'Bookshelf', 'Storage', [900, 350, 1800], 'furniture', [300, 200]),
  e('cabinet', 'Tall cabinet', 'Storage', [1000, 450, 1950], 'furniture', [300, 300]),
  e('sideboard', 'Sideboard', 'Storage', [1600, 450, 800], 'furniture', [400, 300]),
  e('filing-cabinet', 'Filing cabinet', 'Storage', [470, 620, 1300], 'furniture', [300, 400], [1000, 1000]),

  e('whiteboard', 'Whiteboard', 'Fixtures', [1800, 60, 1200], 'furniture', [400, 20], [4000, 200]),
  e('tv', 'TV / screen', 'Fixtures', [1450, 90, 800], 'furniture', [400, 30], [3000, 400]),
  e('partition', 'Acoustic panel', 'Fixtures', [1200, 50, 1500], 'furniture', [300, 20], [4000, 200]),
  e('printer', 'Printer', 'Fixtures', [600, 550, 1000], 'furniture', [300, 300], [1500, 1200]),

  e('plant', 'Plant', 'Decor', [550, 550, 1200], 'furniture', [200, 200], [1500, 1500]),
  e('floor-lamp', 'Floor lamp', 'Decor', [400, 400, 1600], 'furniture', [200, 200], [800, 800]),
  e('coat-rack', 'Coat stand', 'Decor', [450, 450, 1750], 'furniture', [250, 250], [800, 800]),
  e('rug', 'Rug', 'Decor', [2000, 1400, 10], 'floor', [500, 500], [6000, 6000]),
];

export const CATALOG_BY_TYPE: Record<string, CatalogEntry> = Object.fromEntries(CATALOG.map((c) => [c.type, c]));

export const CATEGORIES: Category[] = ['Work', 'Meeting', 'Lounge', 'Storage', 'Fixtures', 'Decor'];

export interface OpeningEntry {
  kind: OpeningKind;
  name: string;
  width: number;
  height: number;
  sill: number;
}

export const OPENINGS: OpeningEntry[] = [
  { kind: 'door', name: 'Door', width: 900, height: 2100, sill: 0 },
  { kind: 'double-door', name: 'Double door', width: 1600, height: 2100, sill: 0 },
  { kind: 'sliding-door', name: 'Sliding door', width: 1200, height: 2100, sill: 0 },
  { kind: 'window', name: 'Window', width: 1200, height: 1200, sill: 900 },
  { kind: 'opening', name: 'Opening', width: 900, height: 2100, sill: 0 },
];

export const OPENING_BY_KIND = Object.fromEntries(OPENINGS.map((o) => [o.kind, o])) as Record<OpeningKind, OpeningEntry>;
