import { Circle, Ellipse, Group, Line, Rect } from 'react-konva';
import { createContext, useContext, type ReactElement } from 'react';
import { isHex, shade } from '../../model/color';

// Plan-view symbols, drawn centred on the origin. Every item is designed to sit with its back
// against a top wall at rotation 0, so a chair at rotation 0 faces "up" towards a desk.

export const INK = '#2b2b2b';
export const FILL = '#f7f6f3';
export const SHADE = '#e4e1da';
export const DARK = '#5b5b5b';

const line = { stroke: INK, strokeWidth: 1.2, strokeScaleEnabled: false, listening: false } as const;
const thin = { stroke: INK, strokeWidth: 0.7, strokeScaleEnabled: false, listening: false } as const;

interface P {
  w: number;
  d: number;
  /** Unfolded sofa beds: depth from the back. */
  e?: number;
}

const box = (fill: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}) => (
  <Rect x={x} y={y} width={w} height={h} fill={fill} {...line} {...extra} />
);

/** The item's plan fill (a pale tint of its colour), provided by FurnitureSymbol. */
const FillContext = createContext(FILL);
const useFill = () => useContext(FillContext);

function Desk({ w, d }: P) {
  const fill = useFill();
  const mw = w * 0.34;
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d, { cornerRadius: 8 })}
      <Rect x={-mw / 2} y={-d / 2 + d * 0.12} width={mw} height={Math.max(d * 0.05, 18)} fill={SHADE} {...thin} />
      <Rect x={-w * 0.12} y={d * 0.1} width={w * 0.24} height={d * 0.12} cornerRadius={4} fill={fill} {...thin} />
    </Group>
  );
}

function CornerDesk({ w, d }: P) {
  const fill = useFill();
  const md = Math.min(700, d * 0.48);
  const rw = Math.min(650, w * 0.45);
  const pts = [-w / 2, -d / 2, w / 2, -d / 2, w / 2, -d / 2 + md, -w / 2 + rw, -d / 2 + md, -w / 2 + rw, d / 2, -w / 2, d / 2];
  const mw = Math.min(600, w * 0.3);
  return (
    <Group>
      <Line points={pts} closed fill={fill} {...line} />
      <Rect
        x={-w / 2 + rw * 0.35}
        y={-d / 2 + md * 0.35}
        offsetX={mw / 2}
        width={mw}
        height={Math.max(md * 0.05, 18)}
        rotation={-45}
        fill={SHADE}
        {...thin}
      />
    </Group>
  );
}

function BenchDesk({ w, d }: P) {
  const fill = useFill();
  const mw = w * 0.34;
  const mh = Math.max(d * 0.03, 18);
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d, { cornerRadius: 8 })}
      <Rect x={-w / 2} y={-12} width={w} height={24} fill={SHADE} {...thin} />
      <Rect x={-mw / 2} y={-d * 0.12 - mh} width={mw} height={mh} fill={SHADE} {...thin} />
      <Rect x={-mw / 2} y={d * 0.12} width={mw} height={mh} fill={SHADE} {...thin} />
    </Group>
  );
}

function OfficeChair({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      <Rect x={-w * 0.36} y={-d * 0.42} width={w * 0.72} height={d * 0.66} cornerRadius={Math.min(w, d) * 0.18} fill={fill} {...line} />
      <Rect x={-w * 0.42} y={d * 0.24} width={w * 0.84} height={d * 0.2} cornerRadius={Math.min(w, d) * 0.08} fill={SHADE} {...line} />
      <Rect x={-w * 0.48} y={-d * 0.22} width={w * 0.1} height={d * 0.4} cornerRadius={8} fill={SHADE} {...thin} />
      <Rect x={w * 0.38} y={-d * 0.22} width={w * 0.1} height={d * 0.4} cornerRadius={8} fill={SHADE} {...thin} />
    </Group>
  );
}

function Chair({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d * 0.8, { cornerRadius: Math.min(w, d) * 0.08 })}
      <Rect x={-w / 2} y={d * 0.3} width={w} height={d * 0.2} cornerRadius={6} fill={SHADE} {...line} />
    </Group>
  );
}

function Stool({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      <Ellipse radiusX={w / 2} radiusY={d / 2} fill={fill} {...line} />
      <Ellipse radiusX={w * 0.32} radiusY={d * 0.32} {...thin} />
    </Group>
  );
}

function TableRect({ w, d }: P) {
  const fill = useFill();
  return box(fill, -w / 2, -d / 2, w, d, { cornerRadius: Math.min(30, w / 10, d / 10) });
}

function TableRound({ w, d }: P) {
  const fill = useFill();
  return <Ellipse radiusX={w / 2} radiusY={d / 2} fill={fill} {...line} />;
}

function CoffeeTable({ w, d }: P) {
  const fill = useFill();
  const i = Math.min(w, d) * 0.08;
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d, { cornerRadius: Math.min(w, d) * 0.12 })}
      <Rect x={-w / 2 + i} y={-d / 2 + i} width={w - 2 * i} height={d - 2 * i} cornerRadius={Math.min(w, d) * 0.08} {...thin} />
    </Group>
  );
}

function SideTable({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      <Ellipse radiusX={w / 2} radiusY={d / 2} fill={fill} {...line} />
      <Ellipse radiusX={w * 0.38} radiusY={d * 0.38} {...thin} />
    </Group>
  );
}

function Sofa({ w, d, seats }: P & { seats?: number }) {
  const fill = useFill();
  const back = Math.min(220, d * 0.26);
  const arm = Math.min(200, w * 0.13);
  const seatW = w - 2 * arm;
  const n = seats ?? Math.max(1, Math.round(seatW / 650));
  const r = Math.min(w, d) * 0.06;
  const cushions: ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    cushions.push(
      <Rect
        key={i}
        x={-w / 2 + arm + (seatW * i) / n}
        y={-d / 2 + back}
        width={seatW / n}
        height={d - back - d * 0.04}
        cornerRadius={r * 0.6}
        fill={fill}
        {...thin}
      />,
    );
  }
  return (
    <Group>
      <Rect x={-w / 2} y={-d / 2} width={w} height={d} cornerRadius={r} fill={SHADE} {...line} />
      {cushions}
      <Rect x={-w / 2} y={-d / 2 + back} width={arm} height={d - back} cornerRadius={r} fill={SHADE} {...thin} />
      <Rect x={w / 2 - arm} y={-d / 2 + back} width={arm} height={d - back} cornerRadius={r} fill={SHADE} {...thin} />
    </Group>
  );
}

/** Sofa bed: a sofa when folded; unfolded, a mattress reaching `e` from the back with pillows and a duvet. */
function SofaBed({ w, d, e }: P) {
  const fill = useFill();
  if (!e) return <Sofa w={w} d={d} />;
  const back = Math.min(220, d * 0.26);
  const arm = Math.min(200, w * 0.13);
  const r = Math.min(w, d) * 0.06;
  const top = -d / 2;
  const mw = w - 2 * arm - 20;
  const my0 = top + back;
  const len = e - back - 20;
  return (
    <Group>
      <Rect x={-w / 2} y={top} width={w} height={d} cornerRadius={r} fill={SHADE} {...line} />
      <Rect x={-w / 2} y={top + back} width={arm} height={d - back} cornerRadius={r} fill={SHADE} {...thin} />
      <Rect x={w / 2 - arm} y={top + back} width={arm} height={d - back} cornerRadius={r} fill={SHADE} {...thin} />
      <Rect x={-mw / 2} y={my0} width={mw} height={len} cornerRadius={r * 0.6} fill="#ffffff" {...line} />
      <Rect x={-mw / 2 + 40} y={my0 + 60} width={mw / 2 - 60} height={300} cornerRadius={40} fill="#ffffff" {...thin} />
      <Rect x={20} y={my0 + 60} width={mw / 2 - 60} height={300} cornerRadius={40} fill="#ffffff" {...thin} />
      <Rect x={-mw / 2 - 15} y={my0 + len * 0.3} width={mw + 30} height={len * 0.7} cornerRadius={20} fill={fill} {...thin} />
      <Line points={[-mw / 2 - 15, my0 + len * 0.3 + 120, mw / 2 + 15, my0 + len * 0.3 + 120]} {...thin} />
    </Group>
  );
}

function Bookshelf({ w, d }: P) {
  const fill = useFill();
  const bays = Math.max(1, Math.round(w / 800));
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d)}
      <Line points={[-w / 2, d / 2 - d * 0.18, w / 2, d / 2 - d * 0.18]} {...thin} />
      {Array.from({ length: bays - 1 }, (_, i) => {
        const x = -w / 2 + (w * (i + 1)) / bays;
        return <Line key={i} points={[x, -d / 2, x, d / 2]} {...thin} />;
      })}
    </Group>
  );
}

function Cabinet({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d)}
      <Line points={[-w / 2, -d / 2, w / 2, d / 2]} {...thin} />
      <Line points={[w / 2, -d / 2, -w / 2, d / 2]} {...thin} />
    </Group>
  );
}

function Sideboard({ w, d }: P) {
  const fill = useFill();
  const doors = Math.max(1, Math.round(w / 450));
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d)}
      {Array.from({ length: doors - 1 }, (_, i) => {
        const x = -w / 2 + (w * (i + 1)) / doors;
        return <Line key={i} points={[x, d / 2 - d * 0.25, x, d / 2]} {...thin} />;
      })}
      <Line points={[-w / 2, d / 2 - d * 0.25, w / 2, d / 2 - d * 0.25]} {...thin} />
    </Group>
  );
}

function FilingCabinet({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d)}
      <Line points={[-w * 0.22, d / 2 - d * 0.1, w * 0.22, d / 2 - d * 0.1]} {...line} />
    </Group>
  );
}

function Whiteboard({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} {...line} />
      <Line points={[-w / 2 + w * 0.02, d / 2, w / 2 - w * 0.02, d / 2]} stroke={INK} strokeWidth={2.4} strokeScaleEnabled={false} listening={false} />
    </Group>
  );
}

function Tv({ w, d }: P) {
  return <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={DARK} cornerRadius={4} {...line} />;
}

function Partition({ w, d }: P) {
  const fill = useFill();
  return <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} {...line} />;
}

function Printer({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d, { cornerRadius: 10 })}
      <Rect x={-w * 0.36} y={-d * 0.36} width={w * 0.72} height={d * 0.4} cornerRadius={6} fill={SHADE} {...thin} />
      <Rect x={-w * 0.3} y={d * 0.18} width={w * 0.6} height={d * 0.18} {...thin} />
    </Group>
  );
}

function Plant({ w, d }: P) {
  const fill = useFill();
  const leaves = 7;
  return (
    <Group>
      {Array.from({ length: leaves }, (_, i) => (
        <Ellipse
          key={i}
          radiusX={w * 0.26}
          radiusY={d * 0.1}
          offsetX={-w * 0.22}
          rotation={(360 / leaves) * i}
          fill="#e2eadb"
          {...thin}
        />
      ))}
      <Circle radius={Math.min(w, d) * 0.14} fill={fill} {...line} />
    </Group>
  );
}

function FloorLamp({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      <Ellipse radiusX={w / 2} radiusY={d / 2} fill={fill} {...line} />
      <Line points={[-w / 2, 0, w / 2, 0]} {...thin} />
      <Line points={[0, -d / 2, 0, d / 2]} {...thin} />
      <Ellipse radiusX={w * 0.12} radiusY={d * 0.12} fill={SHADE} {...thin} />
    </Group>
  );
}

function CoatRack({ w, d }: P) {
  const fill = useFill();
  const hooks = 6;
  return (
    <Group>
      <Ellipse radiusX={w * 0.35} radiusY={d * 0.35} fill={fill} {...line} />
      {Array.from({ length: hooks }, (_, i) => {
        const a = (Math.PI * 2 * i) / hooks;
        return <Line key={i} points={[0, 0, (Math.cos(a) * w) / 2, (Math.sin(a) * d) / 2]} {...thin} />;
      })}
      <Ellipse radiusX={w * 0.08} radiusY={d * 0.08} fill={SHADE} {...thin} />
    </Group>
  );
}

function Rug({ w, d }: P) {
  const fill = useFill();
  const i = Math.min(w, d) * 0.06;
  return (
    <Group>
      <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} {...thin} />
      <Rect x={-w / 2 + i} y={-d / 2 + i} width={w - 2 * i} height={d - 2 * i} dash={[6, 4]} {...thin} />
    </Group>
  );
}

function Fallback({ w, d }: P) {
  const fill = useFill();
  return (
    <Group>
      {box(fill, -w / 2, -d / 2, w, d)}
      <Line points={[-w / 2, -d / 2, w / 2, d / 2]} {...thin} />
    </Group>
  );
}

const SYMBOLS: Record<string, (p: P) => ReactElement> = {
  desk: Desk,
  'desk-l': CornerDesk,
  'bench-desk': BenchDesk,
  'office-chair': OfficeChair,
  pedestal: FilingCabinet,
  'table-rect': TableRect,
  'table-round': TableRound,
  chair: Chair,
  stool: Stool,
  sofa: (p) => <Sofa {...p} />,
  'sofa-bed': SofaBed,
  armchair: (p) => <Sofa {...p} seats={1} />,
  'coffee-table': CoffeeTable,
  'side-table': SideTable,
  bookshelf: Bookshelf,
  cabinet: Cabinet,
  sideboard: Sideboard,
  'filing-cabinet': FilingCabinet,
  whiteboard: Whiteboard,
  tv: Tv,
  partition: Partition,
  printer: Printer,
  plant: Plant,
  'floor-lamp': FloorLamp,
  'coat-rack': CoatRack,
  rug: Rug,
};

/** Mix a colour towards white so plan fills stay pale enough for linework to read. */
export const planTint = (color: string, amount = 0.7) => (isHex(color) ? shade(color, amount) : FILL);

export function FurnitureSymbol({ type, w, d, color, expandedLength }: { type: string; w: number; d: number; color?: string; expandedLength?: number }) {
  const S = SYMBOLS[type] ?? Fallback;
  return (
    <FillContext.Provider value={color ? planTint(color) : FILL}>
      <S w={w} d={d} e={expandedLength} />
    </FillContext.Provider>
  );
}
