import type { FurnitureItem, Opening, Room, Wall } from './types';

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotate(p: Pt, deg: number): Pt {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function itemCorners(it: Pick<FurnitureItem, 'x' | 'y' | 'width' | 'depth' | 'rotation'>): Pt[] {
  const hw = it.width / 2;
  const hd = it.depth / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => {
    const r = rotate(p, it.rotation);
    return { x: r.x + it.x, y: r.y + it.y };
  });
}

export function boundsOf(points: Pt[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export const itemBounds = (it: FurnitureItem) => boundsOf(itemCorners(it));

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/** Separating-axis test for two convex polygons. Shapes that merely touch (within `tolerance`) don't count. */
export function convexOverlap(a: Pt[], b: Pt[], tolerance = 1): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axis = { x: p2.y - p1.y, y: p1.x - p2.x };
      const len = Math.hypot(axis.x, axis.y);
      if (len === 0) continue;
      axis.x /= len;
      axis.y /= len;
      const project = (pts: Pt[]) => {
        let min = Infinity;
        let max = -Infinity;
        for (const p of pts) {
          const d = p.x * axis.x + p.y * axis.y;
          if (d < min) min = d;
          if (d > max) max = d;
        }
        return [min, max] as const;
      };
      const [aMin, aMax] = project(a);
      const [bMin, bMax] = project(b);
      if (aMax - tolerance <= bMin || bMax - tolerance <= aMin) return false;
    }
  }
  return true;
}

export function insideRoom(it: FurnitureItem, room: Room, tolerance = 1): boolean {
  const b = itemBounds(it);
  return b.minX >= -tolerance && b.minY >= -tolerance && b.maxX <= room.width + tolerance && b.maxY <= room.depth + tolerance;
}

// ---------- walls & openings ----------

export const wallLength = (room: Room, wall: Wall) => (wall === 'top' || wall === 'bottom' ? room.width : room.depth);

/**
 * Local frame of an opening: origin on the interior wall face at the opening's start,
 * +x runs along the opening, +y points into the room, and the wall occupies y ∈ [-t, 0].
 */
export function openingFrame(room: Room, o: Pick<Opening, 'wall' | 'offset' | 'width'>): Pt & { rotation: number } {
  switch (o.wall) {
    case 'top':
      return { x: o.offset, y: 0, rotation: 0 };
    case 'right':
      return { x: room.width, y: o.offset, rotation: 90 };
    case 'bottom':
      return { x: o.offset + o.width, y: room.depth, rotation: 180 };
    case 'left':
      return { x: 0, y: o.offset + o.width, rotation: 270 };
  }
}

export function frameToWorld(frame: Pt & { rotation: number }, p: Pt): Pt {
  const r = rotate(p, frame.rotation);
  return { x: r.x + frame.x, y: r.y + frame.y };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Keep an opening on its wall and, when it has heights, below the ceiling. */
export function clampOpening<T extends Pick<Opening, 'wall' | 'offset' | 'width'> & Partial<Pick<Opening, 'height' | 'sill'>>>(
  room: Room,
  o: T,
): T {
  const len = wallLength(room, o.wall);
  const width = clamp(o.width, 300, len);
  const out = { ...o, width, offset: clamp(o.offset, 0, len - width) };
  if (o.height !== undefined && o.sill !== undefined) {
    out.sill = clamp(Math.round(o.sill), 0, room.height - 300);
    out.height = clamp(Math.round(o.height), 300, room.height - out.sill);
  }
  return out;
}

/** Closest wall to a point, with the coordinate along that wall. */
export function nearestWall(room: Room, p: Pt): { wall: Wall; along: number; distance: number } {
  const cands: { wall: Wall; along: number; distance: number }[] = [
    { wall: 'top', along: p.x, distance: Math.abs(p.y) },
    { wall: 'bottom', along: p.x, distance: Math.abs(p.y - room.depth) },
    { wall: 'left', along: p.y, distance: Math.abs(p.x) },
    { wall: 'right', along: p.y, distance: Math.abs(p.x - room.width) },
  ];
  return cands.reduce((best, c) => (c.distance < best.distance ? c : best));
}

function sector(center: Pt, radius: number, fromDeg: number, toDeg: number, steps = 12): Pt[] {
  const pts: Pt[] = [center];
  for (let i = 0; i <= steps; i++) {
    const a = rad(fromDeg + ((toDeg - fromDeg) * i) / steps);
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

/**
 * Door leaves and the arcs they sweep, in the opening's local frame (see openingFrame).
 * Each leaf hinges on a jamb; `open` is the leaf end when fully open, `arc` the sweep polygon.
 */
export function doorLeaves(o: Pick<Opening, 'kind' | 'width' | 'hinge' | 'swing' | 'wall'>, wallThickness: number) {
  const s = o.swing === 'in' ? 1 : -1;
  const y0 = o.swing === 'in' ? 0 : -wallThickness;
  const leaf = (hingeX: number, len: number, closedDir: 1 | -1) => {
    const hinge = { x: hingeX, y: y0 };
    // angle 0 points along +x; the leaf rotates from the closed direction to perpendicular (±90°).
    const closedAngle = closedDir === 1 ? 0 : 180;
    const openAngle = closedDir === 1 ? 90 * s : 180 - 90 * s;
    return {
      hinge,
      open: { x: hingeX, y: y0 + s * len },
      arc: sector(hinge, len, closedAngle, openAngle),
    };
  };
  if (o.kind === 'double-door') {
    const half = o.width / 2;
    return [leaf(0, half, 1), leaf(o.width, half, -1)];
  }
  if (o.kind === 'door') {
    // `hinge` is in room terms (start = left/top); the frame runs backwards on bottom and left walls.
    const reversed = o.wall === 'bottom' || o.wall === 'left';
    const atFrameStart = (o.hinge === 'start') !== reversed;
    return atFrameStart ? [leaf(0, o.width, 1)] : [leaf(o.width, o.width, -1)];
  }
  return [];
}

/** World-space polygons that an inward-swinging door sweeps through. */
export function doorSwingPolygons(room: Room, o: Opening): Pt[][] {
  if (o.swing !== 'in') return [];
  const frame = openingFrame(room, o);
  return doorLeaves(o, room.wallThickness).map((l) => l.arc.map((p) => frameToWorld(frame, p)));
}

// ---------- snapping ----------

export interface SnapResult {
  x: number;
  y: number;
  guides: { axis: 'x' | 'y'; value: number }[];
}

/**
 * Snap a moving box (given by its half-extents around a proposed centre) to target lines,
 * falling back to aligning the box's top-left corner to the grid.
 */
export function snapBox(
  center: Pt,
  half: Pt,
  targets: { x: number[]; y: number[] },
  grid: number,
  threshold: number,
): SnapResult {
  const guides: SnapResult['guides'] = [];
  const axisSnap = (c: number, h: number, lines: number[], axis: 'x' | 'y') => {
    let best: { value: number; line: number; dist: number } | null = null;
    for (const offset of [-h, 0, h]) {
      for (const line of lines) {
        const dist = Math.abs(c + offset - line);
        if (dist <= threshold && (!best || dist < best.dist)) best = { value: line - offset, line, dist };
      }
    }
    if (best) {
      guides.push({ axis, value: best.line });
      return best.value;
    }
    return grid > 0 ? Math.round((c - h) / grid) * grid + h : c;
  };
  return {
    x: axisSnap(center.x, half.x, targets.x, 'x'),
    y: axisSnap(center.y, half.y, targets.y, 'y'),
    guides,
  };
}
