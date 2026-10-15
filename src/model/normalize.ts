import { CATALOG_BY_TYPE, OPENING_BY_KIND } from './catalog';
import { ROOM_COLORS } from './color';
import type { Design } from './types';

export const DEFAULT_ROOM_HEIGHT = 2500;

/** Fill in fields added after a design was saved (heights, colours), so older files keep working. */
export function normalizeDesign(d: Design): Design {
  return {
    ...d,
    room: {
      ...d.room,
      height: d.room.height ?? DEFAULT_ROOM_HEIGHT,
      wallColor: d.room.wallColor ?? ROOM_COLORS.wall,
      floorColor: d.room.floorColor ?? ROOM_COLORS.floor,
    },
    items: d.items.map((it) => ({
      ...it,
      height: it.height ?? CATALOG_BY_TYPE[it.type]?.height ?? 750,
      elevation: it.elevation ?? CATALOG_BY_TYPE[it.type]?.elevation ?? 0,
      color: it.color ?? CATALOG_BY_TYPE[it.type]?.color ?? '#f1efea',
    })),
    openings: d.openings.map((o) => ({
      ...o,
      height: o.height ?? OPENING_BY_KIND[o.kind]?.height ?? 2100,
      sill: o.sill ?? OPENING_BY_KIND[o.kind]?.sill ?? 0,
      color: o.color ?? OPENING_BY_KIND[o.kind]?.color ?? '#d8c3a0',
    })),
  };
}
