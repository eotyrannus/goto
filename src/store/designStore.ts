import { create } from 'zustand';
import { CATALOG_BY_TYPE, OPENING_BY_KIND } from '../model/catalog';
import { clampOpening, itemBounds, nearestWall, wallLength, type Pt } from '../model/geometry';
import type { Design, FurnitureItem, Opening, OpeningKind, Room, Selection, Settings } from '../model/types';
import { uid } from '../model/units';
import { templates } from '../model/templates';
import { normalizeDesign } from '../model/normalize';

const HISTORY_LIMIT = 200;

interface State {
  design: Design;
  past: Design[];
  future: Design[];
  /** Snapshot taken when a live gesture (dragging a wall or opening) starts. */
  gestureStart: Design | null;
  selection: Selection;
  settings: Settings;

  loadDesign: (d: Design) => void;
  /** Replace the design, recording one undo step. */
  commit: (next: Design) => void;
  beginGesture: () => void;
  /** Replace the design without recording; the whole gesture becomes one undo step at endGesture. */
  updateLive: (next: Design) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;

  setSelection: (s: Selection) => void;
  setSettings: (patch: Partial<Settings>) => void;

  rename: (name: string) => void;
  updateRoom: (patch: Partial<Room>, live?: boolean) => void;
  addItem: (type: string, at?: Pt) => void;
  updateItems: (patches: Record<string, Partial<FurnitureItem>>) => void;
  addOpening: (kind: OpeningKind, at?: Pt) => void;
  updateOpening: (id: string, patch: Partial<Opening>, live?: boolean) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  rotateSelection: (deg: number) => void;
  nudgeSelection: (dx: number, dy: number) => void;
  reorderSelection: (where: 'front' | 'back') => void;
  copySelection: () => void;
  paste: () => void;
  selectAll: () => void;
}

let clipboard: FurnitureItem[] = [];

const stamp = (d: Design): Design => ({ ...d, updatedAt: Date.now() });

export const normalizeAngle = (deg: number) => ((Math.round(deg * 10) / 10) % 360 + 360) % 360;

/** Keep openings on their walls when the room shrinks. */
function fitOpenings(room: Room, openings: Opening[]): Opening[] {
  return openings.map((o) => clampOpening(room, o));
}

export const useDesign = create<State>((set, get) => {
  const commit = (next: Design) => {
    const { design, past } = get();
    set({ design: stamp(next), past: [...past, design].slice(-HISTORY_LIMIT), future: [] });
  };
  const selectedItemIds = () => {
    const s = get().selection;
    return s?.kind === 'items' ? s.ids : [];
  };

  return {
    design: templates[1].build(),
    past: [],
    future: [],
    gestureStart: null,
    selection: null,
    settings: { gridSize: 100, showGrid: true, snap: true, showNames: false, showClearances: true, showClashes: true },

    loadDesign: (d) => set({ design: normalizeDesign(d), past: [], future: [], selection: null, gestureStart: null }),
    commit,
    beginGesture: () => set({ gestureStart: get().design }),
    updateLive: (next) => set({ design: next }),
    endGesture: () => {
      const { gestureStart, design, past } = get();
      if (gestureStart && gestureStart !== design) {
        set({ design: stamp(design), past: [...past, gestureStart].slice(-HISTORY_LIMIT), future: [] });
      }
      set({ gestureStart: null });
    },
    undo: () => {
      const { past, design, future } = get();
      if (!past.length) return;
      set({ design: past[past.length - 1], past: past.slice(0, -1), future: [design, ...future], selection: null });
    },
    redo: () => {
      const { past, design, future } = get();
      if (!future.length) return;
      set({ design: future[0], past: [...past, design], future: future.slice(1), selection: null });
    },

    setSelection: (selection) => set({ selection }),
    setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

    rename: (name) => commit({ ...get().design, name }),

    updateRoom: (patch, live = false) => {
      const d = get().design;
      const room = { ...d.room, ...patch };
      room.width = Math.min(Math.max(Math.round(room.width), 1000), 30000);
      room.depth = Math.min(Math.max(Math.round(room.depth), 1000), 30000);
      room.height = Math.min(Math.max(Math.round(room.height), 1800), 6000);
      room.wallThickness = Math.min(Math.max(Math.round(room.wallThickness), 20), 500);
      const next = { ...d, room, openings: fitOpenings(room, d.openings) };
      if (live) get().updateLive(next);
      else commit(next);
    },

    addItem: (type, at) => {
      const entry = CATALOG_BY_TYPE[type];
      if (!entry) return;
      const d = get().design;
      const item: FurnitureItem = {
        id: uid(),
        type,
        x: Math.round(at?.x ?? d.room.width / 2),
        y: Math.round(at?.y ?? d.room.depth / 2),
        width: entry.width,
        depth: entry.depth,
        height: entry.height,
        rotation: 0,
      };
      // Keep a freshly placed item inside the room when it fits.
      const b = itemBounds(item);
      if (b.maxX > d.room.width) item.x -= b.maxX - d.room.width;
      if (b.minX < 0) item.x -= b.minX;
      if (b.maxY > d.room.depth) item.y -= b.maxY - d.room.depth;
      if (b.minY < 0) item.y -= b.minY;
      commit({ ...d, items: [...d.items, item] });
      set({ selection: { kind: 'items', ids: [item.id] } });
    },

    updateItems: (patches) => {
      const d = get().design;
      commit({
        ...d,
        items: d.items.map((it) => {
          const p = patches[it.id];
          if (!p) return it;
          const entry = CATALOG_BY_TYPE[it.type];
          const next = { ...it, ...p };
          if (entry) {
            next.width = Math.min(Math.max(Math.round(next.width), entry.min[0]), entry.max[0]);
            next.depth = Math.min(Math.max(Math.round(next.depth), entry.min[1]), entry.max[1]);
            next.height = Math.min(Math.max(Math.round(next.height), entry.min[2]), entry.max[2]);
          }
          next.x = Math.round(next.x);
          next.y = Math.round(next.y);
          next.rotation = normalizeAngle(next.rotation);
          return next;
        }),
      });
    },

    addOpening: (kind, at) => {
      const d = get().design;
      const entry = OPENING_BY_KIND[kind];
      let wall: Opening['wall'] = 'top';
      let center = d.room.width / 2;
      if (at) {
        const nw = nearestWall(d.room, at);
        wall = nw.wall;
        center = nw.along;
      }
      const width = Math.min(entry.width, wallLength(d.room, wall));
      const opening = clampOpening(d.room, {
        id: uid(),
        kind,
        wall,
        offset: center - width / 2,
        width,
        height: entry.height,
        sill: entry.sill,
        hinge: 'start' as const,
        swing: 'in' as const,
      });
      commit({ ...d, openings: [...d.openings, opening] });
      set({ selection: { kind: 'opening', id: opening.id } });
    },

    updateOpening: (id, patch, live = false) => {
      const d = get().design;
      const next = {
        ...d,
        openings: d.openings.map((o) => (o.id === id ? clampOpening(d.room, { ...o, ...patch }) : o)),
      };
      if (live) get().updateLive(next);
      else commit(next);
    },

    deleteSelection: () => {
      const { selection, design } = get();
      if (!selection) return;
      if (selection.kind === 'opening') {
        commit({ ...design, openings: design.openings.filter((o) => o.id !== selection.id) });
      } else {
        const ids = new Set(selection.ids);
        commit({ ...design, items: design.items.filter((it) => !ids.has(it.id) || it.locked) });
      }
      set({ selection: null });
    },

    duplicateSelection: () => {
      const { selection, design } = get();
      if (selection?.kind === 'opening') {
        const o = design.openings.find((x) => x.id === selection.id);
        if (!o) return;
        const copy = clampOpening(design.room, { ...o, id: uid(), offset: o.offset + o.width + 100 });
        commit({ ...design, openings: [...design.openings, copy] });
        set({ selection: { kind: 'opening', id: copy.id } });
        return;
      }
      const ids = new Set(selectedItemIds());
      const copies = design.items
        .filter((it) => ids.has(it.id))
        .map((it) => ({ ...it, id: uid(), x: it.x + 200, y: it.y + 200, locked: false }));
      if (!copies.length) return;
      commit({ ...design, items: [...design.items, ...copies] });
      set({ selection: { kind: 'items', ids: copies.map((c) => c.id) } });
    },

    rotateSelection: (deg) => {
      const ids = selectedItemIds();
      const items = get().design.items.filter((it) => ids.includes(it.id) && !it.locked);
      if (!items.length) return;
      get().updateItems(Object.fromEntries(items.map((it) => [it.id, { rotation: it.rotation + deg }])));
    },

    nudgeSelection: (dx, dy) => {
      const { selection, design } = get();
      if (selection?.kind === 'opening') {
        const o = design.openings.find((x) => x.id === selection.id);
        if (!o) return;
        const along = o.wall === 'top' || o.wall === 'bottom' ? dx : dy;
        if (along) get().updateOpening(o.id, { offset: o.offset + along });
        return;
      }
      const ids = selectedItemIds();
      const items = design.items.filter((it) => ids.includes(it.id) && !it.locked);
      if (!items.length) return;
      get().updateItems(Object.fromEntries(items.map((it) => [it.id, { x: it.x + dx, y: it.y + dy }])));
    },

    reorderSelection: (where) => {
      const ids = new Set(selectedItemIds());
      const d = get().design;
      const sel = d.items.filter((it) => ids.has(it.id));
      const rest = d.items.filter((it) => !ids.has(it.id));
      commit({ ...d, items: where === 'front' ? [...rest, ...sel] : [...sel, ...rest] });
    },

    copySelection: () => {
      const ids = new Set(selectedItemIds());
      clipboard = get().design.items.filter((it) => ids.has(it.id));
    },

    paste: () => {
      if (!clipboard.length) return;
      const d = get().design;
      const copies = clipboard.map((it) => ({ ...it, id: uid(), x: it.x + 200, y: it.y + 200, locked: false }));
      clipboard = copies;
      commit({ ...d, items: [...d.items, ...copies] });
      set({ selection: { kind: 'items', ids: copies.map((c) => c.id) } });
    },

    selectAll: () => set({ selection: { kind: 'items', ids: get().design.items.map((it) => it.id) } }),
  };
});
