import type { Design } from '../model/types';

// Designs live in localStorage: an index of metadata plus one key per design.

const INDEX_KEY = 'podplanner.index';
const LAST_KEY = 'podplanner.last';
const designKey = (id: string) => `podplanner.design.${id}`;

export interface DesignMeta {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listDesigns(): DesignMeta[] {
  return read<DesignMeta[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadDesign(id: string): Design | null {
  const d = read<Design | null>(designKey(id), null);
  return d && isDesign(d) ? d : null;
}

export function saveDesign(design: Design, thumbnail?: string): boolean {
  const ok = write(designKey(design.id), design);
  const index = read<DesignMeta[]>(INDEX_KEY, []);
  const prev = index.find((m) => m.id === design.id);
  const meta: DesignMeta = {
    id: design.id,
    name: design.name,
    updatedAt: design.updatedAt,
    thumbnail: thumbnail ?? prev?.thumbnail,
  };
  write(INDEX_KEY, [meta, ...index.filter((m) => m.id !== design.id)]);
  write(LAST_KEY, design.id);
  return ok;
}

export function deleteDesign(id: string) {
  try {
    localStorage.removeItem(designKey(id));
  } catch {
    // storage unavailable; nothing to delete
  }
  write(
    INDEX_KEY,
    read<DesignMeta[]>(INDEX_KEY, []).filter((m) => m.id !== id),
  );
}

export const lastDesignId = () => read<string | null>(LAST_KEY, null);

export function isDesign(x: unknown): x is Design {
  const d = x as Design;
  return (
    !!d &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    !!d.room &&
    typeof d.room.width === 'number' &&
    typeof d.room.depth === 'number' &&
    Array.isArray(d.items) &&
    Array.isArray(d.openings)
  );
}
