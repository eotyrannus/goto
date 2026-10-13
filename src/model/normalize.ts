import { CATALOG_BY_TYPE, OPENING_BY_KIND } from './catalog';
import type { Design } from './types';

export const DEFAULT_ROOM_HEIGHT = 2500;

/** Fill in fields added after a design was saved (heights), so older files keep working. */
export function normalizeDesign(d: Design): Design {
  return {
    ...d,
    room: { ...d.room, height: d.room.height ?? DEFAULT_ROOM_HEIGHT },
    items: d.items.map((it) => ({
      ...it,
      height: it.height ?? CATALOG_BY_TYPE[it.type]?.height ?? 750,
      elevation: it.elevation ?? CATALOG_BY_TYPE[it.type]?.elevation ?? 0,
    })),
    openings: d.openings.map((o) => ({
      ...o,
      height: o.height ?? OPENING_BY_KIND[o.kind]?.height ?? 2100,
      sill: o.sill ?? OPENING_BY_KIND[o.kind]?.sill ?? 0,
    })),
  };
}
