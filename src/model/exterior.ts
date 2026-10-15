import { shade } from './color';
import type { Pt } from './geometry';
import type { Part } from './furniture3d';
import type { Opening, Room, Wall } from './types';
import type { WallProfile } from './walls3d';

// Exterior shells drawn around the room in 3D (and as outlines on the plan).
//
// Melwood Mod 10, from the Melwood 2026 catalogue: a 3.6 m × 2.6 m building (outside), 2.8 m tall,
// with a skillion roof that is high at the front and falls to the back, a band of highlight windows
// across the top of the front wall, board-and-batten cladding, Colorbond roofing with gutter and
// downpipe, an elevated pier floor and a full-width 1.3 m pine deck in front.
//
// The catalogue offers a standard and an upgraded (taller) ceiling; its drawings show the standard
// one (2.8 m overall). We model the upgraded, habitable-height version: a raked ceiling 2.4 m at the
// back rising to 2.8 m at the front, so the building is taller than the catalogue drawing
// (≈3.35 m to the front roof edge).
//
// The shell wraps whatever room the user has drawn; "Match Mod 10 size" resizes the room to the
// catalogue footprint. Geometry is built in a canonical frame — front wall along +y (like the plan's
// bottom wall), x along the front — and rotated onto the chosen front wall.

export type ExteriorStyle = 'none' | 'mod10';

export interface Exterior {
  style: ExteriorStyle;
  /** The wall with the deck, the tall side of the roof and the highlight windows. */
  front: Wall;
  claddingColor: string;
  roofColor: string;
}

export const EXTERIOR_STYLES: { id: ExteriorStyle; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'mod10', name: 'Melwood Mod 10' },
];

/** Stock Colorbond® roof colours from the catalogue. */
export const ROOF_COLOURS = [
  { name: 'Monument', color: '#323233' },
  { name: 'Woodland Grey', color: '#4b4c46' },
  { name: 'Surfmist', color: '#e4e2d5' },
  { name: 'Night Sky', color: '#141414' },
];

export const DEFAULT_EXTERIOR: Exterior = { style: 'none', front: 'bottom', claddingColor: '#4f5b66', roofColor: ROOF_COLOURS[0].color };

/** Catalogue footprint (mm), with the upgraded 2.4 m ceiling we assume for a habitable room. */
export const MOD10 = { width: 3600, depth: 2600, deck: 1300, ceiling: 2400 };

/** How far the floor sits above the ground on its piers. */
export const FLOOR_RAISE = 300;

const CLAD = 18; // cladding board thickness
const BATTEN = { w: 42, d: 20, every: 300 };
const TRIM = '#f4f4f1';
const DECK = '#c49a63';
const BASE = '#2f3032';
const OVERHANG = { front: 450, side: 250, back: 150 };

export type ExteriorSide = Wall | 'roof' | 'base';
export type ExteriorPart = Part & { side: ExteriorSide };

// ---------- canonical frame ----------

/** Plan wall that each canonical wall (front = bottom) lands on, per chosen front. */
const SIDE_MAP: Record<Wall, Record<Wall, Wall>> = {
  bottom: { bottom: 'bottom', top: 'top', left: 'left', right: 'right' },
  top: { bottom: 'top', top: 'bottom', left: 'right', right: 'left' },
  right: { bottom: 'right', top: 'left', left: 'bottom', right: 'top' },
  left: { bottom: 'left', top: 'right', left: 'top', right: 'bottom' },
};

export interface Frame {
  /** Interior length along the front, and depth front-to-back. */
  L: number;
  D: number;
  /** Canonical → plan: rotate by `rotation` degrees about the vertical, then translate. */
  x: number;
  y: number;
  rotation: number;
  side: (canonical: Wall) => Wall;
}

export function canonicalFrame(room: Room, front: Wall): Frame {
  const { width: W, depth: D } = room;
  const side = (w: Wall) => SIDE_MAP[front][w];
  switch (front) {
    case 'bottom':
      return { L: W, D, x: 0, y: 0, rotation: 0, side };
    case 'top':
      return { L: W, D, x: W, y: D, rotation: 180, side };
    case 'right':
      // plan (x, y) = (cy, D - cx)
      return { L: D, D: W, x: 0, y: D, rotation: -90, side };
    case 'left':
      // plan (x, y) = (W - cy, cx)
      return { L: D, D: W, x: W, y: 0, rotation: 90, side };
  }
}

/** Canonical point → plan point. */
export function toPlan(f: Frame, p: Pt): Pt {
  const a = (f.rotation * Math.PI) / 180;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  return { x: f.x + p.x * c - p.y * s, y: f.y + p.x * s + p.y * c };
}

interface Gap {
  a: number;
  b: number;
  z0: number;
  z1: number;
}

/** Openings as gaps along each canonical wall (positions measured along canonical +x / +y). */
function canonicalGaps(room: Room, openings: Opening[], f: Frame): Record<Wall, Gap[]> {
  const out: Record<Wall, Gap[]> = { top: [], bottom: [], left: [], right: [] };
  for (const cw of ['top', 'bottom', 'left', 'right'] as Wall[]) {
    const pw = f.side(cw);
    for (const o of openings.filter((x) => x.wall === pw)) {
      // Plan span of the opening along its wall, then into canonical coordinates via its ends.
      const horizontal = pw === 'top' || pw === 'bottom';
      const fixed = pw === 'top' ? 0 : pw === 'bottom' ? room.depth : pw === 'left' ? 0 : room.width;
      const e1 = horizontal ? { x: o.offset, y: fixed } : { x: fixed, y: o.offset };
      const e2 = horizontal ? { x: o.offset + o.width, y: fixed } : { x: fixed, y: o.offset + o.width };
      const c1 = toCanonical(f, e1);
      const c2 = toCanonical(f, e2);
      const alongX = cw === 'top' || cw === 'bottom';
      const u1 = alongX ? c1.x : c1.y;
      const u2 = alongX ? c2.x : c2.y;
      out[cw].push({ a: Math.min(u1, u2), b: Math.max(u1, u2), z0: o.sill, z1: o.sill + o.height });
    }
  }
  return out;
}

export function toCanonical(f: Frame, p: Pt): Pt {
  const a = (f.rotation * Math.PI) / 180;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  const dx = p.x - f.x;
  const dy = p.y - f.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

// ---------- Mod 10 ----------

/**
 * Heights for a room with ceiling height H (the low, back side of the raked ceiling):
 * the ceiling rises 400 mm to the front; walls carry on 150 mm above it to the roof; the highlight
 * windows run across the front from just above door height to just under the ceiling.
 */
export function mod10Heights(room: Room) {
  const H = room.height;
  return {
    backCeiling: H,
    frontCeiling: H + 400,
    backTop: H + 150,
    frontTop: H + 550,
    highlight: { z0: H - 200, z1: H + 340 },
  };
}

/** Highlight window spans along the canonical front (x), in the shell's outer coordinates. */
function highlightSpans(room: Room, L: number) {
  const t = room.wallThickness;
  const inset = 160;
  const mullion = 100;
  const x0 = -t + inset;
  const w = (L + 2 * t - 2 * inset - mullion) / 2;
  return [x0, x0 + w + mullion].map((a) => ({ a, b: a + w }));
}

/**
 * The room's walls under a Mod 10 roof: they rise to the sloping roof line (the raked ceiling sits
 * just below), and the highlight windows are cut through the front wall.
 */
export function mod10Profile(room: Room, ext: Exterior): WallProfile {
  const f = canonicalFrame(room, ext.front);
  const t = room.wallThickness;
  const { backTop, frontTop, highlight } = mod10Heights(room);
  const yBack = -t;
  const yFront = f.D + t;
  const top = (p: Pt) => {
    const y = Math.min(Math.max(toCanonical(f, p).y, yBack), yFront);
    return backTop + ((y - yBack) / (yFront - yBack)) * (frontTop - backTop);
  };
  const horizontal = ext.front === 'top' || ext.front === 'bottom';
  const gaps = highlightSpans(room, f.L).map(({ a, b }) => {
    const pa = toPlan(f, { x: a, y: f.D + t / 2 });
    const pb = toPlan(f, { x: b, y: f.D + t / 2 });
    const [ua, ub] = horizontal ? [pa.x, pb.x] : [pa.y, pb.y];
    return { wall: ext.front, offset: Math.min(ua, ub), width: Math.abs(ub - ua), sill: highlight.z0, height: highlight.z1 - highlight.z0 };
  });
  return { top, gaps };
}

export function mod10Parts(room: Room, openings: Opening[], ext: Exterior): { parts: ExteriorPart[]; frame: Frame } {
  const f = canonicalFrame(room, ext.front);
  const { L, D } = f;
  const t = room.wallThickness;
  const { backTop, frontTop, backCeiling, frontCeiling, highlight } = mod10Heights(room);
  const clad = ext.claddingColor;
  const batten = shade(clad, -0.08);
  const parts: ExteriorPart[] = [];
  const add = (side: ExteriorSide, p: Part) => parts.push({ ...p, side });
  const gaps = canonicalGaps(room, openings, f);

  // Outer faces of the room's walls.
  const yBack = -t;
  const yFront = D + t;
  const xLeft = -t;
  const xRight = L + t;
  const depthOut = yFront - yBack;
  /** Height of the wall top at canonical y (sloping from back to front). */
  const topAt = (y: number) => backTop + ((y - yBack) / depthOut) * (frontTop - backTop);

  // Highlight windows: two panes across the top of the front wall (cut through the room's wall
  // too, by mod10Profile, so they're visible from inside under the raked ceiling).
  const highlights: Gap[] = highlightSpans(room, L).map(({ a, b }) => ({ a, b, z0: highlight.z0, z1: highlight.z1 }));

  /**
   * A run of wall skin along one canonical wall, split around gaps. `top(u)` gives the height of
   * the run's top edge at position u; `band` limits the run to z ≥ band[0] (used for the infill
   * above the ceiling). Pieces with a sloping top become wedges.
   */
  const run = (
    side: Wall,
    u0: number,
    u1: number,
    across: [number, number],
    top: (u: number) => number,
    color: string,
    holes: Gap[],
    zMin = 0,
  ) => {
    const alongX = side === 'top' || side === 'bottom';
    const piece = (a: number, b: number, z0: number, z1fn: (u: number) => number) => {
      if (b - a < 1) return;
      const za = z1fn(a);
      const zb = z1fn(b);
      if (Math.max(za, zb) - z0 < 1) return;
      const [c0, c1] = across;
      if (alongX) {
        add(f.side(side), { shape: 'box', x: (a + b) / 2, y: (c0 + c1) / 2, z: (z0 + za) / 2, sx: b - a, sy: c1 - c0, sz: za - z0, color });
      } else if (Math.abs(za - zb) < 1) {
        add(f.side(side), { shape: 'box', x: (c0 + c1) / 2, y: (a + b) / 2, z: (z0 + za) / 2, sx: c1 - c0, sy: b - a, sz: za - z0, color });
      } else {
        add(f.side(side), { shape: 'wedge', x: (c0 + c1) / 2, y: (a + b) / 2, z: z0, sx: c1 - c0, sy: b - a, sz: za - z0, topFront: zb - z0, color });
      }
    };
    // Cut the run into strips at every hole edge; in each strip, keep the heights no hole covers.
    // (Holes may overlap along the wall, e.g. a door under a highlight window.)
    const inRun = holes.filter((g) => g.b > u0 && g.a < u1);
    const edges = [...new Set([u0, u1, ...inRun.flatMap((g) => [g.a, g.b])])].filter((u) => u >= u0 && u <= u1).sort((p, q) => p - q);
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i];
      const b = edges[i + 1];
      const covering = inRun.filter((g) => g.a < b - 0.5 && g.b > a + 0.5).sort((p, q) => p.z0 - q.z0);
      let z = zMin;
      for (const g of covering) {
        if (g.z0 > z) piece(a, b, z, () => Math.min(g.z0, top(a), top(b)));
        z = Math.max(z, g.z1);
      }
      piece(a, b, z, top);
    }
  };

  const front = gaps.bottom;
  const backGaps = gaps.top;
  const xOut0 = xLeft - CLAD;
  const xOut1 = xRight + CLAD;

  // Cladding skin (outside the room's walls); front and back own the corners.
  run('bottom', xOut0, xOut1, [yFront, yFront + CLAD], () => frontTop, clad, [...front, ...highlights]);
  run('top', xOut0, xOut1, [yBack - CLAD, yBack], () => backTop, clad, backGaps);
  run('left', yBack, yFront, [xOut0, xLeft], topAt, clad, gaps.left);
  run('right', yBack, yFront, [xRight, xOut1], topAt, clad, gaps.right);

  // Battens every 300 mm, interrupted by openings.
  const battens = (side: Wall, u0: number, u1: number, outer: number, dir: 1 | -1, top: (u: number) => number, holes: Gap[]) => {
    const alongX = side === 'top' || side === 'bottom';
    for (let u = u0 + BATTEN.every / 2; u < u1 - BATTEN.w; u += BATTEN.every) {
      const blocking = holes.filter((g) => u + BATTEN.w / 2 > g.a && u - BATTEN.w / 2 < g.b).sort((p, q) => p.z0 - q.z0);
      let z = 0;
      const segs: [number, number][] = [];
      for (const g of blocking) {
        if (g.z0 > z) segs.push([z, g.z0]);
        z = Math.max(z, g.z1);
      }
      segs.push([z, top(u) - 10]);
      for (const [z0, z1] of segs) {
        if (z1 - z0 < 20) continue;
        const c = outer + (dir * BATTEN.d) / 2;
        add(
          f.side(side),
          alongX
            ? { shape: 'box', x: u, y: c, z: (z0 + z1) / 2, sx: BATTEN.w, sy: BATTEN.d, sz: z1 - z0, color: batten }
            : { shape: 'box', x: c, y: u, z: (z0 + z1) / 2, sx: BATTEN.d, sy: BATTEN.w, sz: z1 - z0, color: batten },
        );
      }
    }
  };
  battens('bottom', xOut0, xOut1, yFront + CLAD, 1, () => frontTop, [...front, ...highlights]);
  battens('top', xOut0, xOut1, yBack - CLAD, -1, () => backTop, backGaps);
  battens('left', yBack, yFront, xOut0, -1, topAt, gaps.left);
  battens('right', yBack, yFront, xOut1, 1, topAt, gaps.right);

  // White trims around every opening and the highlight windows, on the outside face.
  const trims = (side: Wall, outer: number, dir: 1 | -1, holes: Gap[], bottomTrim: (g: Gap) => boolean) => {
    const alongX = side === 'top' || side === 'bottom';
    const w = 55;
    const d = BATTEN.d + 6;
    const c = outer + (dir * d) / 2;
    for (const g of holes) {
      const rects: [number, number, number, number][] = [
        [g.a - w, g.a, g.z0, g.z1 + w],
        [g.b, g.b + w, g.z0, g.z1 + w],
        [g.a - w, g.b + w, g.z1, g.z1 + w],
      ];
      if (bottomTrim(g)) rects.push([g.a - w, g.b + w, g.z0 - w, g.z0]);
      for (const [a, b, z0, z1] of rects) {
        add(
          f.side(side),
          alongX
            ? { shape: 'box', x: (a + b) / 2, y: c, z: (z0 + z1) / 2, sx: b - a, sy: d, sz: z1 - z0, color: TRIM }
            : { shape: 'box', x: c, y: (a + b) / 2, z: (z0 + z1) / 2, sx: d, sy: b - a, sz: z1 - z0, color: TRIM },
        );
      }
    }
  };
  const isWindow = (g: Gap) => g.z0 > 1;
  trims('bottom', yFront + CLAD, 1, [...front, ...highlights], isWindow);
  trims('top', yBack - CLAD, -1, backGaps, isWindow);
  trims('left', xOut0, -1, gaps.left, isWindow);
  trims('right', xOut1, 1, gaps.right, isWindow);

  // Highlight glazing with a white mullion between the panes.
  for (const g of highlights) {
    add(f.side('bottom'), { shape: 'box', x: (g.a + g.b) / 2, y: D + t / 2, z: (g.z0 + g.z1) / 2, sx: g.b - g.a, sy: 10, sz: g.z1 - g.z0, color: '#cfe3f1', glass: true });
  }

  // Corner boards.
  for (const [x, y] of [
    [xOut0, yBack - CLAD],
    [xOut1, yBack - CLAD],
    [xOut0, yFront + CLAD],
    [xOut1, yFront + CLAD],
  ]) {
    const top = y < 0 ? backTop : frontTop;
    add(x < 0 ? f.side('left') : f.side('right'), { shape: 'box', x, y, z: top / 2 - 10, sx: 70, sy: 70, sz: top - 20, color: batten });
  }

  // ---------- raked ceiling, inside, following the roof ----------
  const ceilSlope = Math.atan2(frontCeiling - backCeiling, D);
  const ceilDeg = (ceilSlope * 180) / Math.PI;
  const ceilT = 20;
  add('roof', {
    shape: 'box',
    x: L / 2,
    y: D / 2,
    z: (backCeiling + frontCeiling) / 2 + ceilT / 2 / Math.cos(ceilSlope),
    sx: L,
    sy: D / Math.cos(ceilSlope),
    sz: ceilT,
    color: '#e9e7e2',
    unlit: true,
    tilt: ceilDeg,
  });

  // ---------- roof ----------
  const slope = Math.atan2(frontTop - backTop, depthOut + 2 * CLAD);
  const yRoofBack = yBack - CLAD - OVERHANG.back;
  const yRoofFront = yFront + CLAD + OVERHANG.front;
  const xRoof0 = xOut0 - OVERHANG.side;
  const xRoof1 = xOut1 + OVERHANG.side;
  const run2 = yRoofFront - yRoofBack;
  const roofLen = run2 / Math.cos(slope);
  const lineAt = (y: number) => backTop + (y - (yBack - CLAD)) * Math.tan(slope); // underside of roof
  const yc = (yRoofBack + yRoofFront) / 2;
  const sheet = 50;
  const deg = (slope * 180) / Math.PI;
  const roofCol = ext.roofColor;
  const zc = (y: number, lift: number) => lineAt(y) + lift / Math.cos(slope);
  add('roof', { shape: 'box', x: (xRoof0 + xRoof1) / 2, y: yc, z: zc(yc, sheet / 2), sx: xRoof1 - xRoof0, sy: roofLen, sz: sheet, color: roofCol, tilt: deg });
  // Corrugated-look ribs running down the slope.
  for (let x = xRoof0 + 95; x < xRoof1 - 40; x += 190) {
    add('roof', { shape: 'box', x, y: yc, z: zc(yc, sheet + 9), sx: 22, sy: roofLen, sz: 18, color: shade(roofCol, 0.06), tilt: deg });
  }
  // Fascia at the front, barge boards on the sides, white soffit under the front overhang.
  add('roof', { shape: 'box', x: (xRoof0 + xRoof1) / 2, y: yRoofFront, z: lineAt(yRoofFront) - 30, sx: xRoof1 - xRoof0, sy: 25, sz: 160, color: roofCol });
  for (const x of [xRoof0, xRoof1]) {
    add('roof', { shape: 'box', x, y: yc, z: zc(yc, -10), sx: 25, sy: roofLen, sz: 150, color: roofCol, tilt: deg });
  }
  const soffitY0 = yFront + CLAD;
  const soffitYc = (soffitY0 + yRoofFront) / 2;
  add('roof', { shape: 'box', x: (xRoof0 + xRoof1) / 2, y: soffitYc, z: zc(soffitYc, -6), sx: xRoof1 - xRoof0 - 50, sy: (yRoofFront - soffitY0) / Math.cos(slope), sz: 10, color: TRIM, tilt: deg });
  // Gutter along the back and a downpipe at one corner.
  add('roof', { shape: 'box', x: (xRoof0 + xRoof1) / 2, y: yRoofBack - 50, z: lineAt(yRoofBack) - 40, sx: xRoof1 - xRoof0, sy: 110, sz: 100, color: roofCol });
  add('roof', { shape: 'cyl', x: xRoof1 - 160, y: yBack - CLAD - 60, z: (lineAt(yRoofBack) - 90 - FLOOR_RAISE) / 2, sx: 90, sy: 90, sz: lineAt(yRoofBack) - 90 + FLOOR_RAISE, color: roofCol });

  // ---------- base: dark skirt over the piers ----------
  const skirtH = FLOOR_RAISE - 40;
  for (const [x0, x1, y0, y1] of [
    [xOut0, xOut1, yBack - CLAD, yBack],
    [xOut0, xOut1, yFront, yFront + CLAD],
    [xOut0, xLeft, yBack, yFront],
    [xRight, xOut1, yBack, yFront],
  ]) {
    add('base', { shape: 'box', x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: -skirtH / 2, sx: x1 - x0, sy: y1 - y0, sz: skirtH, color: BASE });
  }

  // ---------- deck: full width, 1.3 m deep, boards running along the front ----------
  const deckTop = -40;
  const deckY0 = yFront + CLAD;
  const deckY1 = deckY0 + MOD10.deck;
  const boardW = 88;
  const gap = 6;
  let i = 0;
  for (let y = deckY0; y + boardW <= deckY1 + 1; y += boardW + gap, i++) {
    add('base', {
      shape: 'box',
      x: (xOut0 + xOut1) / 2,
      y: y + boardW / 2,
      z: deckTop - 12,
      sx: xOut1 - xOut0,
      sy: boardW,
      sz: 24,
      color: i % 3 === 1 ? shade(DECK, -0.06) : i % 3 === 2 ? shade(DECK, 0.05) : DECK,
    });
  }
  // Bearers, a fascia board and posts down to the ground.
  const under = deckTop - 24;
  add('base', { shape: 'box', x: (xOut0 + xOut1) / 2, y: deckY1 - 30, z: under - 70, sx: xOut1 - xOut0, sy: 40, sz: 140, color: shade(DECK, -0.25) });
  for (const x of [xOut0 + 60, (xOut0 + xOut1) / 2, xOut1 - 60]) {
    add('base', { shape: 'box', x, y: deckY1 - 90, z: (under - FLOOR_RAISE) / 2, sx: 90, sy: 90, sz: FLOOR_RAISE + under, color: shade(DECK, -0.3) });
  }

  return { parts, frame: f };
}

/** Plan outlines of the deck and roof (plan coordinates), for drawing on the 2D plan. */
export function mod10Outline(room: Room, ext: Exterior): { deck: Pt[]; roof: Pt[]; boards: [Pt, Pt][] } {
  const f = canonicalFrame(room, ext.front);
  const t = room.wallThickness;
  const yBack = -t - CLAD;
  const yFront = f.D + t + CLAD;
  const x0 = -t - CLAD;
  const x1 = f.L + t + CLAD;
  const rect = (a: number, b: number, c: number, d: number) => [toPlan(f, { x: a, y: c }), toPlan(f, { x: b, y: c }), toPlan(f, { x: b, y: d }), toPlan(f, { x: a, y: d })];
  const boards: [Pt, Pt][] = [];
  for (let y = yFront + 94; y < yFront + MOD10.deck; y += 94) boards.push([toPlan(f, { x: x0, y }), toPlan(f, { x: x1, y })]);
  return {
    deck: rect(x0, x1, yFront, yFront + MOD10.deck),
    roof: rect(x0 - OVERHANG.side, x1 + OVERHANG.side, yBack - OVERHANG.back, yFront + OVERHANG.front),
    boards,
  };
}

/** Interior room size giving the Mod 10's catalogue footprint outside (for the chosen front) and its 2.4 m ceiling. */
export function mod10RoomSize(room: Room, front: Wall): { width: number; depth: number; height: number } {
  const outside = 2 * (room.wallThickness + CLAD);
  const along = MOD10.width - outside;
  const deep = MOD10.depth - outside;
  const size = front === 'top' || front === 'bottom' ? { width: along, depth: deep } : { width: deep, depth: along };
  return { ...size, height: MOD10.ceiling };
}
