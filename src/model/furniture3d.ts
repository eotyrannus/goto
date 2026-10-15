import { shade } from './color';

// Low-poly 3D furniture built from boxes, cylinders and spheres, parameterised by an item's
// width (w, local x), depth (d, local y, +y is the front) and height (h, z up). Coordinates are
// millimetres in the item's local frame with the origin at the centre of its footprint on the
// floor (or on its mounting height for wall-mounted items).

export interface Part {
  /** rbox: a box with rounded edges (radius), for upholstery. */
  shape: 'box' | 'rbox' | 'cyl' | 'sphere';
  /** Centre. */
  x: number;
  y: number;
  z: number;
  /** Size along each axis (cylinders/spheres: diameters on x/y, height on z). */
  sx: number;
  sy: number;
  sz: number;
  color: string;
  /** Cylinders only: top radius as a fraction of the bottom radius. */
  taper?: number;
  /** Light-emitting look (lamp shades, screens). */
  glow?: boolean;
  /** rbox only: edge radius (mm). */
  radius?: number;
  /** Lean the part's top backwards (towards -y) by this many degrees, e.g. back cushions. */
  tilt?: number;
  /** Cylinders only: lay the cylinder along the x or y axis instead of standing it up. */
  axis?: 'x' | 'y';
}

export const COLORS = {
  wood: '#c8a47a',
  woodDark: '#8a6a4b',
  white: '#f1efea',
  metal: '#9aa1a8',
  dark: '#3a3e44',
  fabric: '#8ea2b6',
  fabricWarm: '#b9a58d',
  green: '#6c9a58',
  greenDark: '#4f7d43',
  pot: '#d6d0c4',
  screen: '#1d2127',
  rug: '#b9a3c4',
  felt: '#a7a196',
  shade: '#fbf3dd',
  door: '#d8c3a0',
  aluminium: '#aeb4bb',
};

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Part> = {}): Part => ({
  shape: 'box',
  x,
  y,
  z,
  sx,
  sy,
  sz,
  color,
  ...extra,
});
const cyl = (x: number, y: number, z: number, dx: number, dy: number, h: number, color: string, extra: Partial<Part> = {}): Part => ({
  shape: 'cyl',
  x,
  y,
  z,
  sx: dx,
  sy: dy,
  sz: h,
  color,
  ...extra,
});
const sphere = (x: number, y: number, z: number, dx: number, dy: number, dz: number, color: string): Part => ({
  shape: 'sphere',
  x,
  y,
  z,
  sx: dx,
  sy: dy,
  sz: dz,
  color,
});

const rbox = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, radius: number, extra: Partial<Part> = {}): Part => ({
  shape: 'rbox',
  x,
  y,
  z,
  sx,
  sy,
  sz,
  color,
  // A radius can't exceed half the smallest side.
  radius: Math.max(1, Math.min(radius, sx / 2 - 1, sy / 2 - 1, sz / 2 - 1)),
  ...extra,
});

/** Four legs inset from the corners of a w×d footprint, from the floor up to `top`. */
function legs(w: number, d: number, top: number, size = 40, inset = 50, color = COLORS.metal): Part[] {
  const px = w / 2 - inset;
  const py = d / 2 - inset;
  return [
    [-px, -py],
    [px, -py],
    [px, py],
    [-px, py],
  ].map(([x, y]) => box(x, y, top / 2, size, size, top, color));
}

function tableTop(w: number, d: number, h: number, thick = 28, color = COLORS.wood): Part {
  return box(0, 0, h - thick / 2, w, d, thick, color);
}

function monitor(y: number, top: number, w: number): Part[] {
  const mw = Math.min(600, w * 0.4);
  return [
    box(0, y, top + 230, mw, 18, 340, COLORS.screen, { glow: true }),
    box(0, y + 30, top + 40, 60, 40, 80, COLORS.dark),
    box(0, y + 30, top + 4, 220, 160, 8, COLORS.dark),
  ];
}

function desk(w: number, d: number, h: number): Part[] {
  return [tableTop(w, d, h, 28, COLORS.white), ...legs(w, d, h - 28), ...monitor(-d / 2 + d * 0.22, h, w)];
}

function cornerDesk(w: number, d: number, h: number): Part[] {
  const md = Math.min(700, d * 0.48);
  const rw = Math.min(650, w * 0.45);
  const t = 28;
  return [
    box(0, -d / 2 + md / 2, h - t / 2, w, md, t, COLORS.white),
    box(-w / 2 + rw / 2, md / 2, h - t / 2, rw, d - md, t, COLORS.white),
    box(w / 2 - 50, -d / 2 + 50, (h - t) / 2, 40, 40, h - t, COLORS.metal),
    box(w / 2 - 50, -d / 2 + md - 50, (h - t) / 2, 40, 40, h - t, COLORS.metal),
    box(-w / 2 + 50, -d / 2 + 50, (h - t) / 2, 40, 40, h - t, COLORS.metal),
    box(-w / 2 + 50, d / 2 - 50, (h - t) / 2, 40, 40, h - t, COLORS.metal),
    box(-w / 2 + rw - 50, d / 2 - 50, (h - t) / 2, 40, 40, h - t, COLORS.metal),
    ...monitor(-d / 2 + md * 0.3, h, w * 0.7).map((p) => ({ ...p, x: p.x - w * 0.12 })),
  ];
}

function benchDesk(w: number, d: number, h: number): Part[] {
  return [
    tableTop(w, d, h, 28, COLORS.white),
    ...legs(w, d, h - 28),
    box(0, 0, h + 200, w, 25, 400, COLORS.felt),
    ...monitor(-d * 0.18, h, w).map((p) => ({ ...p })),
    ...monitor(d * 0.18, h, w).map((p) => ({ ...p, y: -p.y })),
  ];
}

function officeChair(w: number, d: number, h: number): Part[] {
  const seat = Math.min(480, h * 0.44);
  const r = Math.min(w, d);
  return [
    cyl(0, 0, 25, r * 0.85, r * 0.85, 30, COLORS.dark),
    cyl(0, 0, (seat - 40) / 2 + 25, 50, 50, seat - 60, COLORS.metal),
    box(0, -d * 0.06, seat, w * 0.74, d * 0.68, 70, COLORS.fabric),
    box(0, d * 0.34, seat + (h - seat) * 0.55, w * 0.72, 60, (h - seat) * 0.8, COLORS.fabric),
    box(-w * 0.42, -d * 0.05, seat + 160, 50, d * 0.45, 30, COLORS.dark),
    box(w * 0.42, -d * 0.05, seat + 160, 50, d * 0.45, 30, COLORS.dark),
  ];
}

function chair(w: number, d: number, h: number): Part[] {
  const seat = Math.min(460, h * 0.54);
  return [
    box(0, -d * 0.05, seat - 20, w, d * 0.86, 40, COLORS.fabricWarm),
    ...legs(w * 0.95, d * 0.86, seat - 40, 30, 30, COLORS.woodDark).map((p) => ({ ...p, y: p.y - d * 0.05 })),
    box(0, d / 2 - 20, seat + (h - seat) / 2, w, 35, h - seat, COLORS.woodDark),
  ];
}

function stool(w: number, d: number, h: number): Part[] {
  return [cyl(0, 0, h - 25, w, d, 50, COLORS.wood), cyl(0, 0, (h - 50) / 2, 50, 50, h - 50, COLORS.metal), cyl(0, 0, 10, w * 0.7, d * 0.7, 20, COLORS.metal)];
}

function tableRect(w: number, d: number, h: number): Part[] {
  return [tableTop(w, d, h, 32), ...legs(w, d, h - 32, 50, 80, COLORS.dark)];
}

function tableRound(w: number, d: number, h: number): Part[] {
  return [
    cyl(0, 0, h - 16, w, d, 32, COLORS.wood),
    cyl(0, 0, (h - 32) / 2, 90, 90, h - 32, COLORS.dark),
    cyl(0, 0, 12, w * 0.55, d * 0.55, 24, COLORS.dark),
  ];
}

function coffeeTable(w: number, d: number, h: number): Part[] {
  return [tableTop(w, d, h, 30), ...legs(w, d, h - 30, 35, 60, COLORS.woodDark)];
}

function sideTable(w: number, d: number, h: number): Part[] {
  return [cyl(0, 0, h - 14, w, d, 28, COLORS.wood), cyl(0, 0, (h - 28) / 2, 50, 50, h - 28, COLORS.dark), cyl(0, 0, 10, w * 0.6, d * 0.6, 20, COLORS.dark)];
}

const CUSHION = '#9db0c2'; // derived: a lighter shade of the sofa's colour
const PILLOW = '#6f86a0'; // derived: a darker shade for throw pillows

/** Shared upholstered shell: tapered legs, base, rolled arms and back frame. */
function sofaShell(w: number, d: number, h: number) {
  const legH = Math.min(110, h * 0.14);
  const arm = Math.min(190, w * 0.12);
  const backD = Math.min(180, d * 0.21);
  const baseH = h * 0.28;
  const armTop = h * 0.74;
  const seatTop = legH + baseH;
  const parts: Part[] = [
    // Tapered wooden legs, wider at the top.
    ...[
      [-w / 2 + 70, -d / 2 + 70],
      [w / 2 - 70, -d / 2 + 70],
      [w / 2 - 70, d / 2 - 70],
      [-w / 2 + 70, d / 2 - 70],
    ].map(([x, y]) => cyl(x, y, legH / 2, 42, 42, legH, COLORS.woodDark, { taper: 1.5 })),
    rbox(0, 0, legH + baseH / 2, w - 10, d - 20, baseH, COLORS.fabric, 35),
    rbox(0, -d / 2 + backD / 2, legH + (h - legH) / 2, w - 2 * arm + 40, backD, h - legH, COLORS.fabric, 45),
  ];
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - arm / 2);
    parts.push(
      rbox(x, 0, legH + (armTop - legH - arm * 0.35) / 2, arm, d, armTop - legH - arm * 0.35, COLORS.fabric, 40),
      // A rolled top along the full depth of the arm.
      cyl(x, 0, armTop - arm * 0.5, arm * 1.04, d - 8, arm, COLORS.fabric, { axis: 'y' }),
    );
  }
  return { parts, legH, arm, backD, seatTop, seatW: w - 2 * arm };
}

function sofa(w: number, d: number, h: number, seats?: number): Part[] {
  const { parts, backD, seatTop, seatW } = sofaShell(w, d, h);
  const n = seats ?? Math.max(1, Math.round(seatW / 650));
  const cw = seatW / n;
  const seatD = d - backD - 30;
  const seatH = Math.min(160, h * 0.2);
  const backH = Math.max(h - seatTop - seatH - 40, 120);
  for (let i = 0; i < n; i++) {
    const cx = -seatW / 2 + cw * (i + 0.5);
    parts.push(
      rbox(cx, -d / 2 + backD + seatD / 2, seatTop + seatH / 2, cw - 14, seatD, seatH, CUSHION, 60),
      rbox(cx, -d / 2 + backD + 70, seatTop + seatH + backH / 2, cw - 18, 150, backH, CUSHION, 65, { tilt: 11 }),
    );
  }
  // Throw pillows in the corners of anything wider than an armchair.
  if (n > 1) {
    const ps = Math.min(400, cw * 0.55);
    for (const side of [-1, 1]) {
      parts.push(rbox(side * (seatW / 2 - ps / 2 - 30), -d / 2 + backD + 190, seatTop + seatH + ps / 2 - 30, ps, 110, ps, PILLOW, 50, { tilt: 20 }));
    }
  }
  return parts;
}

/** Folded it's a sofa; unfolded, a mattress on a metal frame reaches `expandedLength` from the back. */
function sofaBed(w: number, d: number, h: number, expandedLength?: number): Part[] {
  if (!expandedLength) return sofa(w, d, h);
  const { parts, backD, seatTop, seatW } = sofaShell(w, d, h);
  const y0 = -d / 2 + backD + 10;
  const y1 = -d / 2 + expandedLength - 20;
  const top = Math.min(seatTop + 90, 470);
  const mh = 150;
  const mw = seatW - 20;
  const len = y1 - y0;
  parts.push(
    // Metal frame and fold-out legs under the far end.
    box(0, (y0 + y1) / 2 + 40, top - mh - 15, mw - 40, len - 80, 20, COLORS.metal),
    cyl(-mw / 2 + 60, y1 - 60, (top - mh - 25) / 2, 30, 30, top - mh - 25, COLORS.metal),
    cyl(mw / 2 - 60, y1 - 60, (top - mh - 25) / 2, 30, 30, top - mh - 25, COLORS.metal),
    rbox(0, (y0 + y1) / 2, top - mh / 2, mw, len, mh, '#f4f2ee', 45),
    // Duvet over the lower two thirds, pillows at the head.
    rbox(0, y0 + len * 0.62, top + 25, mw + 30, len * 0.68, 60, CUSHION, 30),
    rbox(-mw / 4, y0 + 220, top + 55, mw / 2 - 60, 320, 120, '#ffffff', 55),
    rbox(mw / 4, y0 + 220, top + 55, mw / 2 - 60, 320, 120, '#ffffff', 55),
    // Back cushions stay up.
    rbox(0, -d / 2 + backD + 70, top + 200, seatW - 18, 150, 380, CUSHION, 65, { tilt: 11 }),
  );
  return parts;
}

function bookshelf(w: number, d: number, h: number): Part[] {
  const t = 20;
  const shelves = Math.max(2, Math.round(h / 360));
  const parts: Part[] = [
    box(0, -d / 2 + 6, h / 2, w, 12, h, COLORS.wood),
    box(-w / 2 + t / 2, 0, h / 2, t, d, h, COLORS.wood),
    box(w / 2 - t / 2, 0, h / 2, t, d, h, COLORS.wood),
    box(0, 0, h - t / 2, w, d, t, COLORS.wood),
  ];
  const bookColors = ['#7b8fa6', '#b5835a', '#5f7f6b', '#c9b48f', '#8a6f8f'];
  const inner = w - 2 * t;
  for (let i = 0; i < shelves; i++) {
    const z = (h * i) / shelves;
    parts.push(box(0, 0, z + t / 2, inner, d, t, COLORS.wood));
    // A run of books on every shelf but the top one.
    const bh = Math.min(260, h / shelves - 60);
    const run = inner * (0.45 + ((i * 37) % 30) / 100);
    const start = -inner / 2 + ((i * 53) % 4) * 30 + 20;
    const books = Math.max(3, Math.round(run / 45));
    for (let b = 0; b < books && bh > 60; b++) {
      parts.push(box(start + b * (run / books) + run / books / 2, 0, z + t + bh / 2, run / books - 6, d * 0.75, bh * (0.85 + ((b * 7) % 3) * 0.05), bookColors[(b + i) % bookColors.length]));
    }
  }
  return parts;
}

function cabinet(w: number, d: number, h: number): Part[] {
  return [
    box(0, 0, h / 2, w, d, h, COLORS.white),
    box(0, d / 2 + 2, h / 2, 6, 4, h - 40, COLORS.metal),
    box(-40, d / 2 + 12, h * 0.55, 15, 20, 160, COLORS.dark),
    box(40, d / 2 + 12, h * 0.55, 15, 20, 160, COLORS.dark),
  ];
}

function sideboard(w: number, d: number, h: number): Part[] {
  const doors = Math.max(1, Math.round(w / 450));
  const parts: Part[] = [box(0, 0, 100 + (h - 100) / 2, w, d, h - 100, COLORS.wood), ...legs(w, d, 100, 35, 50, COLORS.dark)];
  for (let i = 1; i < doors; i++) parts.push(box(-w / 2 + (w * i) / doors, d / 2 + 2, 100 + (h - 100) / 2, 5, 4, h - 140, COLORS.woodDark));
  for (let i = 0; i < doors; i++) parts.push(box(-w / 2 + (w * (i + 0.5)) / doors, d / 2 + 10, h - 120, 120, 16, 14, COLORS.dark));
  return parts;
}

function drawers(w: number, d: number, h: number, count: number): Part[] {
  const parts: Part[] = [box(0, 0, h / 2, w, d, h, COLORS.white)];
  for (let i = 1; i < count; i++) parts.push(box(0, d / 2 + 2, (h * i) / count, w - 20, 4, 6, COLORS.metal));
  for (let i = 0; i < count; i++) parts.push(box(0, d / 2 + 10, (h * (i + 0.7)) / count, w * 0.4, 16, 16, COLORS.dark));
  return parts;
}

function whiteboard(w: number, d: number, h: number): Part[] {
  return [
    box(0, 0, h / 2, w, d, h, '#ffffff'),
    box(0, d / 2 + 1, h / 2, w, 4, h, '#fbfbfb'),
    box(0, 0, h / 2, w + 30, d * 0.8, h + 30, COLORS.metal),
    box(0, d / 2 + 30, 15, w * 0.6, 60, 20, COLORS.metal),
  ];
}

function tv(w: number, d: number, h: number): Part[] {
  return [box(0, 0, h / 2, w, d, h, COLORS.dark), box(0, d / 2 + 1, h / 2, w - 30, 4, h - 30, COLORS.screen, { glow: true })];
}

function partition(w: number, d: number, h: number): Part[] {
  return [box(0, 0, 80 + (h - 80) / 2, w, d, h - 80, COLORS.felt), box(-w / 2 + 80, 0, 40, 60, 300, 80, COLORS.dark), box(w / 2 - 80, 0, 40, 60, 300, 80, COLORS.dark)];
}

function printer(w: number, d: number, h: number): Part[] {
  return [
    box(0, 0, h * 0.4, w, d, h * 0.8, COLORS.white),
    box(0, -d * 0.05, h * 0.9, w * 0.9, d * 0.8, h * 0.2, '#d9d9d9'),
    box(w * 0.2, d / 2 - 40, h * 0.95, w * 0.3, 60, 30, COLORS.dark),
    box(0, d / 2 + 60, h * 0.5, w * 0.6, 120, 15, '#e6e6e6'),
  ];
}

function plant(w: number, d: number, h: number): Part[] {
  const potH = Math.min(h * 0.32, 420);
  const r = Math.min(w, d);
  return [
    cyl(0, 0, potH / 2, r * 0.5, r * 0.5, potH, COLORS.pot, { taper: 1.25 }),
    sphere(0, 0, potH + (h - potH) * 0.45, w * 0.8, d * 0.8, (h - potH) * 0.75, COLORS.green),
    sphere(w * 0.15, -d * 0.1, potH + (h - potH) * 0.7, w * 0.55, d * 0.55, (h - potH) * 0.55, COLORS.greenDark),
    sphere(-w * 0.12, d * 0.12, potH + (h - potH) * 0.3, w * 0.6, d * 0.6, (h - potH) * 0.45, COLORS.greenDark),
  ];
}

function floorLamp(w: number, d: number, h: number): Part[] {
  const shadeH = Math.min(320, h * 0.22);
  return [
    cyl(0, 0, 12, w * 0.75, d * 0.75, 24, COLORS.dark),
    cyl(0, 0, (h - shadeH) / 2, 30, 30, h - shadeH, COLORS.metal),
    cyl(0, 0, h - shadeH / 2, w * 0.6, d * 0.6, shadeH, COLORS.shade, { taper: 0.75, glow: true }),
  ];
}

function coatRack(w: number, d: number, h: number): Part[] {
  const parts: Part[] = [cyl(0, 0, 12, w * 0.8, d * 0.8, 24, COLORS.dark), cyl(0, 0, h / 2, 35, 35, h, COLORS.woodDark)];
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + Math.PI / 4;
    parts.push(box(Math.cos(a) * 90, Math.sin(a) * 90, h - 120, 120, 25, 25, COLORS.woodDark));
  }
  return parts;
}

function rug(w: number, d: number, h: number): Part[] {
  return [box(0, 0, h / 2, w, d, h, COLORS.rug), box(0, 0, h + 0.5, w * 0.86, d * 0.82, 1, '#a58fb3')];
}

const BUILDERS: Record<string, (w: number, d: number, h: number) => Part[]> = {
  desk,
  'desk-l': cornerDesk,
  'bench-desk': benchDesk,
  'office-chair': officeChair,
  pedestal: (w, d, h) => drawers(w, d, h, 3),
  'table-rect': tableRect,
  'table-round': tableRound,
  chair,
  stool,
  sofa: (w, d, h) => sofa(w, d, h),
  'sofa-bed': (w, d, h) => sofaBed(w, d, h),
  armchair: (w, d, h) => sofa(w, d, h, 1),
  'coffee-table': coffeeTable,
  'side-table': sideTable,
  bookshelf,
  cabinet,
  sideboard,
  'filing-cabinet': (w, d, h) => drawers(w, d, h, 4),
  whiteboard,
  tv,
  partition,
  printer,
  plant,
  'floor-lamp': floorLamp,
  'coat-rack': coatRack,
  rug,
};

/** Colours derived from an item's main colour (sofa cushions, the rug's centre panel). */
const DERIVED: Record<string, number> = {
  [CUSHION]: 0.18, // sofa cushions: a lighter shade
  [PILLOW]: -0.18, // throw pillows: a darker shade
  '#a58fb3': -0.1, // rug centre panel: a darker shade
};

/**
 * Parts for an item. `color` recolours the item's main parts — those drawn in its catalog
 * default colour `main` — and the details derived from it; other details keep their colours.
 */
export function furnitureParts(
  type: string,
  w: number,
  d: number,
  h: number,
  color?: string,
  main?: string,
  /** Unfolded sofa beds: depth from the back. */
  expandedLength?: number,
): Part[] {
  const build = BUILDERS[type];
  let parts =
    type === 'sofa-bed' ? sofaBed(w, d, h, expandedLength) : build ? build(w, d, h) : [box(0, 0, h / 2, w, d, h, COLORS.white)];
  if (color && main && color.toLowerCase() !== main.toLowerCase()) {
    parts = parts.map((p) => {
      if (p.color.toLowerCase() === main.toLowerCase()) return { ...p, color };
      const amount = DERIVED[p.color.toLowerCase()];
      return amount !== undefined ? { ...p, color: shade(color, amount) } : p;
    });
  }
  // Odd proportions can push a detail to zero size or below the floor; keep every part solid and grounded.
  return parts.map((p) => {
    const sx = Math.max(p.sx, 1);
    const sy = Math.max(p.sy, 1);
    const sz = Math.max(p.sz, 1);
    return { ...p, sx, sy, sz, z: Math.max(p.z, sz / 2) };
  });
}

export const hasModel = (type: string) => type in BUILDERS;
