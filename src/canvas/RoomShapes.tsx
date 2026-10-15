import { Group, Line, Rect, Text } from 'react-konva';
import { doorLeaves } from '../model/geometry';
import type { Opening, Room, Wall } from '../model/types';
import { formatLength } from '../model/units';
import { INK } from './symbols/Symbols';

export const WALL_FILL = '#3a3a3a';
export const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

/** Font size (mm) for annotations, scaled to the room so labels stay legible at "fit" zoom. */
export const annotationSize = (room: Room) => Math.min(Math.max(Math.max(room.width, room.depth) / 32, 60), 260);

/** Walls as solid poché, split around openings. */
export function Walls({ room, openings }: { room: Room; openings: Opening[] }) {
  const { width: W, depth: D, wallThickness: t } = room;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const along = (wall: Wall, start: number, end: number) => {
    const gaps = openings
      .filter((o) => o.wall === wall)
      .map((o) => [o.offset, o.offset + o.width] as const)
      .sort((a, b) => a[0] - b[0]);
    const pieces: [number, number][] = [];
    let cursor = start;
    for (const [a, b] of gaps) {
      if (a > cursor) pieces.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (end > cursor) pieces.push([cursor, end]);
    return pieces;
  };
  // Top and bottom walls own the corners.
  for (const [a, b] of along('top', -t, W + t)) rects.push({ x: a, y: -t, w: b - a, h: t });
  for (const [a, b] of along('bottom', -t, W + t)) rects.push({ x: a, y: D, w: b - a, h: t });
  for (const [a, b] of along('left', 0, D)) rects.push({ x: -t, y: a, w: t, h: b - a });
  for (const [a, b] of along('right', 0, D)) rects.push({ x: W, y: a, w: t, h: b - a });
  return (
    <Group listening={false}>
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={WALL_FILL} />
      ))}
    </Group>
  );
}

const thin = { stroke: INK, strokeWidth: 0.8, strokeScaleEnabled: false, listening: false } as const;

/** Drawn in the opening's local frame: x along the wall, y into the room, wall at y ∈ [-t, 0]. */
export function OpeningSymbol({ o, t }: { o: Opening; t: number }) {
  const w = o.width;
  const parts = [];
  if (o.kind === 'window') {
    parts.push(
      <Rect key="frame" x={0} y={-t} width={w} height={t} fill="#ffffff" {...thin} />,
      <Line key="g1" points={[0, -t * 0.58, w, -t * 0.58]} {...thin} />,
      <Line key="g2" points={[0, -t * 0.42, w, -t * 0.42]} {...thin} />,
    );
  } else if (o.kind === 'sliding-door') {
    parts.push(
      <Rect key="p1" x={0} y={-t * 0.7} width={w * 0.55} height={t * 0.2} fill="#ffffff" {...thin} />,
      <Rect key="p2" x={w * 0.45} y={-t * 0.5} width={w * 0.55} height={t * 0.2} fill="#ffffff" {...thin} />,
    );
  } else if (o.kind === 'opening') {
    parts.push(
      <Line key="h1" points={[0, -t, w, -t]} dash={[6, 4]} {...thin} />,
      <Line key="h2" points={[0, 0, w, 0]} dash={[6, 4]} {...thin} />,
    );
  } else {
    doorLeaves(o, t).forEach((leaf, i) => {
      parts.push(
        <Line
          key={`leaf${i}`}
          points={[leaf.hinge.x, leaf.hinge.y, leaf.open.x, leaf.open.y]}
          stroke={o.material === 'glass' || o.material === 'aluminium-glass' || o.material === 'wood-glass' ? '#4a86b8' : INK}
          strokeWidth={2}
          strokeScaleEnabled={false}
          listening={false}
        />,
        <Line key={`arc${i}`} points={leaf.arc.slice(1).flatMap((p) => [p.x, p.y])} dash={[5, 4]} {...thin} />,
      );
    });
  }
  return (
    <>
      {parts}
      {/* Generous invisible hit area so thin openings are easy to grab. */}
      <Rect x={0} y={-t - 80} width={w} height={t + 220} fill="rgba(0,0,0,0)" />
    </>
  );
}

function DimensionLine({ x1, y1, x2, y2, label, fs, vertical }: { x1: number; y1: number; x2: number; y2: number; label: string; fs: number; vertical?: boolean }) {
  const tick = fs * 0.35;
  return (
    <Group listening={false}>
      <Line points={[x1, y1, x2, y2]} {...thin} />
      <Line points={[x1 - tick, y1 + tick, x1 + tick, y1 - tick]} {...thin} strokeWidth={1.4} />
      <Line points={[x2 - tick, y2 + tick, x2 + tick, y2 - tick]} {...thin} strokeWidth={1.4} />
      {vertical ? (
        <Text x={x1 - fs * 1.5} y={y2} width={y2 - y1} align="center" rotation={-90} text={label} fontSize={fs} fontFamily={FONT} fill={INK} />
      ) : (
        <Text x={x1} y={y1 - fs * 1.5} width={x2 - x1} align="center" text={label} fontSize={fs} fontFamily={FONT} fill={INK} />
      )}
    </Group>
  );
}

/** Overall room dimensions outside the top and left walls. */
export function RoomDimensions({ room }: { room: Room }) {
  const { width: W, depth: D, wallThickness: t } = room;
  const fs = annotationSize(room);
  const gap = t + fs * 1.6;
  return (
    <Group listening={false}>
      <Line points={[0, -t - fs * 0.3, 0, -gap - fs * 0.4]} {...thin} />
      <Line points={[W, -t - fs * 0.3, W, -gap - fs * 0.4]} {...thin} />
      <DimensionLine x1={0} y1={-gap} x2={W} y2={-gap} label={formatLength(W)} fs={fs} />
      <Line points={[-t - fs * 0.3, 0, -gap - fs * 0.4, 0]} {...thin} />
      <Line points={[-t - fs * 0.3, D, -gap - fs * 0.4, D]} {...thin} />
      <DimensionLine x1={-gap} y1={0} x2={-gap} y2={D} label={formatLength(D)} fs={fs} vertical />
    </Group>
  );
}

export function Grid({ room, grid, scale, show, floor = '#ffffff' }: { room: Room; grid: number; scale: number; show: boolean; floor?: string }) {
  const { width: W, depth: D } = room;
  const lines = [];
  if (show && grid > 0) {
    // Thin out minor lines when they'd be closer than ~6px on screen.
    let step = grid;
    while (step * scale < 6) step *= 2;
    for (let x = step; x < W; x += step) {
      const major = x % 1000 === 0;
      lines.push(<Line key={`x${x}`} points={[x, 0, x, D]} stroke={major ? '#d5dae1' : '#eceef2'} strokeWidth={1} strokeScaleEnabled={false} />);
    }
    for (let y = step; y < D; y += step) {
      const major = y % 1000 === 0;
      lines.push(<Line key={`y${y}`} points={[0, y, W, y]} stroke={major ? '#d5dae1' : '#eceef2'} strokeWidth={1} strokeScaleEnabled={false} />);
    }
  }
  return (
    <>
      <Rect x={0} y={0} width={W} height={D} fill={floor} />
      {lines}
    </>
  );
}
