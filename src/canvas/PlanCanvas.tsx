import Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Group, Label, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import { CATALOG_BY_TYPE } from '../model/catalog';
import { findIssues } from '../model/clashes';
import {
  boundsOf,
  depthExtent,
  frameToWorld,
  itemBounds,
  itemCorners,
  nearestWall,
  openingFrame,
  snapBox,
  wallLength,
  type Box,
  type Pt,
  type SnapResult,
} from '../model/geometry';
import type { FurnitureItem, Opening, OpeningKind, Room } from '../model/types';
import { formatLength } from '../model/units';
import { useDesign } from '../store/designStore';
import { ExteriorOutline, FONT, Grid, OpeningSymbol, RoomDimensions, Walls, annotationSize, planBounds } from './RoomShapes';
import { FurnitureSymbol, INK, planTint } from './symbols/Symbols';

export const DND_MIME = 'application/x-podplanner';

/** Lets the toolbar and exporters reach the live stage. */
export const canvasApi: { stage: Konva.Stage | null; fit: () => void; zoomBy: (f: number) => void } = {
  stage: null,
  fit: () => {},
  zoomBy: () => {},
};

const ACCENT = '#2563eb';
const LAYER_RANK = { floor: 0, furniture: 1, seat: 2 } as const;
const isFloor = (it: FurnitureItem) => CATALOG_BY_TYPE[it.type]?.layer === 'floor';

type Gesture =
  | { kind: 'pan'; start: Pt; view: View }
  | { kind: 'marquee'; start: Pt; additive: boolean }
  | { kind: 'opening'; id: string; grab: number; wall: Opening['wall'] }
  | { kind: 'room'; edge: 'right' | 'bottom' | 'corner' }
  | { kind: 'drag'; anchor: string; starts: Record<string, Pt> };

interface View {
  scale: number;
  x: number;
  y: number;
}

export function PlanCanvas() {
  const design = useDesign((s) => s.design);
  const selection = useDesign((s) => s.selection);
  const settings = useDesign((s) => s.settings);
  const { room } = design;

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Group>());
  const gesture = useRef<Gesture | null>(null);
  const fitScale = useRef(1);
  const fittedFor = useRef<string | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 0.2, x: 0, y: 0 });
  const [panKey, setPanKey] = useState(false);
  const [preview, setPreview] = useState<Record<string, Pt> | null>(null);
  const [guides, setGuides] = useState<SnapResult['guides']>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);

  const selectedIds = useMemo(() => (selection?.kind === 'items' ? selection.ids : []), [selection]);

  // ----- viewport -----

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const { room: r, exterior } = useDesign.getState().design;
    // Generous padding leaves space to drag the walls outwards.
    const b = planBounds(r, exterior, annotationSize(r) * 5);
    const scale = Math.min(size.w / (b.maxX - b.minX), size.h / (b.maxY - b.minY)) * 0.92;
    fitScale.current = scale;
    setView({ scale, x: size.w / 2 - ((b.minX + b.maxX) / 2) * scale, y: size.h / 2 - ((b.minY + b.maxY) / 2) * scale });
  }, [size.w, size.h]);

  const zoomAt = useCallback((factor: number, at?: Pt) => {
    setView((v) => {
      const scale = Math.min(Math.max(v.scale * factor, 0.01), 5);
      const p = at ?? { x: size.w / 2, y: size.h / 2 };
      const world = { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
      return { scale, x: p.x - world.x * scale, y: p.y - world.y * scale };
    });
  }, [size.w, size.h]);

  useEffect(() => {
    if (size.w && fittedFor.current !== design.id) {
      fittedFor.current = design.id;
      fit();
    }
  }, [design.id, size.w, fit]);

  // Re-frame when an exterior shell (and its deck) appears or goes away.
  const shellKey = `${design.exterior.style}:${design.exterior.front}`;
  const lastShell = useRef(shellKey);
  useEffect(() => {
    if (lastShell.current !== shellKey) {
      lastShell.current = shellKey;
      fit();
    }
  }, [shellKey, fit]);

  useEffect(() => {
    canvasApi.stage = stageRef.current;
    canvasApi.fit = fit;
    canvasApi.zoomBy = (f) => zoomAt(f);
  }, [fit, zoomAt]);

  // Space bar held = pan mode.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        e.preventDefault();
        setPanKey(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setPanKey(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ----- derived data -----

  const items = useMemo(() => {
    const live = preview ? design.items.map((it) => (preview[it.id] ? { ...it, ...preview[it.id] } : it)) : design.items;
    return live;
  }, [design.items, preview]);

  const ordered = useMemo(
    () => [...design.items].sort((a, b) => LAYER_RANK[CATALOG_BY_TYPE[a.type]?.layer ?? 'furniture'] - LAYER_RANK[CATALOG_BY_TYPE[b.type]?.layer ?? 'furniture']),
    [design.items],
  );

  const issues = useMemo(
    () => (settings.showClashes ? findIssues({ ...design, items }) : new Map()),
    [design, items, settings.showClashes],
  );

  // Attach the transformer to the selected, unlocked items.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const sel = selectedIds
      .map((id) => design.items.find((it) => it.id === id))
      .filter((it): it is FurnitureItem => !!it && !it.locked)
      .map((it) => nodes.current.get(it.id))
      .filter((n): n is Konva.Group => !!n);
    tr.nodes(sel);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, design.items]);

  // ----- helpers -----

  const worldPointer = (): Pt | null => stageRef.current?.getRelativePointerPosition() ?? null;
  const setCursor = (c: string) => {
    if (stageRef.current) stageRef.current.container().style.cursor = c;
  };
  const snapStep = (fine = false) => (settings.snap && !fine ? Math.min(settings.gridSize, 50) : 10);
  const store = () => useDesign.getState();

  // ----- items -----

  const onItemDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, it: FurnitureItem) => {
    const evt = e.evt as MouseEvent;
    if (panKey || evt.button === 1) return; // let the stage pan
    e.cancelBubble = true;
    const s = store();
    const current = s.selection?.kind === 'items' ? s.selection.ids : [];
    if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
      const ids = current.includes(it.id) ? current.filter((id) => id !== it.id) : [...current, it.id];
      s.setSelection(ids.length ? { kind: 'items', ids } : null);
    } else if (!current.includes(it.id)) {
      s.setSelection({ kind: 'items', ids: [it.id] });
    }
  };

  const onDragStart = (it: FurnitureItem) => {
    const s = store();
    const ids = s.selection?.kind === 'items' && s.selection.ids.includes(it.id) ? s.selection.ids : [it.id];
    const starts: Record<string, Pt> = {};
    for (const x of s.design.items) if (ids.includes(x.id) && !x.locked) starts[x.id] = { x: x.x, y: x.y };
    gesture.current = { kind: 'drag', anchor: it.id, starts };
  };

  const onDragMove = (e: Konva.KonvaEventObject<DragEvent | MouseEvent>, it: FurnitureItem) => {
    const g = gesture.current;
    if (g?.kind !== 'drag') return;
    const node = e.target;
    const proposed = node.position();
    // Snap on the folded footprint so the box stays centred on the item's origin.
    const b = itemBounds({ ...it, x: 0, y: 0, expanded: false });
    const free = !settings.snap || (e.evt as MouseEvent).altKey;
    let pos: Pt = proposed;
    let newGuides: SnapResult['guides'] = [];
    if (!free) {
      const others = design.items.filter((x) => !(x.id in g.starts)).map(itemBounds);
      const targets = {
        x: [0, room.width, ...others.flatMap((o) => [o.minX, o.maxX, (o.minX + o.maxX) / 2])],
        y: [0, room.depth, ...others.flatMap((o) => [o.minY, o.maxY, (o.minY + o.maxY) / 2])],
      };
      const res = snapBox(proposed, { x: b.maxX, y: b.maxY }, targets, settings.gridSize, 8 / view.scale);
      pos = { x: res.x, y: res.y };
      newGuides = res.guides;
      node.position(pos);
    }
    const start = g.starts[it.id] ?? { x: it.x, y: it.y };
    const dx = pos.x - start.x;
    const dy = pos.y - start.y;
    const next: Record<string, Pt> = {};
    for (const [id, s] of Object.entries(g.starts)) {
      next[id] = { x: s.x + dx, y: s.y + dy };
      if (id !== it.id) nodes.current.get(id)?.position(next[id]);
    }
    setGuides(newGuides);
    setPreview(next);
  };

  const onDragEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    setGuides([]);
    if (g?.kind === 'drag' && preview) store().updateItems(preview);
    setPreview(null);
  };

  const onTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    const patches: Record<string, Partial<FurnitureItem>> = {};
    for (const node of tr.nodes()) {
      const it = design.items.find((x) => x.id === node.id());
      if (!it) continue;
      const width = Math.round((it.width * Math.abs(node.scaleX())) / 10) * 10;
      const depth = Math.round((it.depth * Math.abs(node.scaleY())) / 10) * 10;
      node.scale({ x: 1, y: 1 });
      patches[it.id] = { x: node.x(), y: node.y(), rotation: node.rotation(), width, depth };
    }
    store().updateItems(patches);
  };

  // ----- openings & room edges -----

  const onOpeningDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, o: Opening) => {
    if (panKey || (e.evt as MouseEvent).button === 1) return;
    e.cancelBubble = true;
    const s = store();
    s.setSelection({ kind: 'opening', id: o.id });
    const p = worldPointer();
    if (!p) return;
    const nw = nearestWall(room, p);
    s.beginGesture();
    gesture.current = { kind: 'opening', id: o.id, wall: o.wall, grab: nw.wall === o.wall ? nw.along - o.offset : o.width / 2 };
  };

  const cycleDoor = (o: Opening) => {
    if (o.kind !== 'door' && o.kind !== 'double-door') return;
    const order: [Opening['hinge'], Opening['swing']][] = [
      ['start', 'in'],
      ['end', 'in'],
      ['end', 'out'],
      ['start', 'out'],
    ];
    const i = order.findIndex(([h, s]) => h === o.hinge && s === o.swing);
    const [hinge, swing] = order[(i + 1) % order.length];
    store().updateOpening(o.id, { hinge, swing });
  };

  const onRoomHandleDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, edge: 'right' | 'bottom' | 'corner') => {
    if (panKey) return;
    e.cancelBubble = true;
    store().setSelection(null);
    store().beginGesture();
    gesture.current = { kind: 'room', edge };
  };

  // ----- stage-level gestures -----

  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const evt = e.evt as MouseEvent;
    const stage = stageRef.current!;
    if (panKey || evt.button === 1) {
      evt.preventDefault();
      gesture.current = { kind: 'pan', start: stage.getPointerPosition()!, view };
      setCursor('grabbing');
      return;
    }
    if (e.target !== stage) return;
    const p = worldPointer();
    if (!p) return;
    gesture.current = { kind: 'marquee', start: p, additive: evt.shiftKey || evt.metaKey || evt.ctrlKey };
  };

  const onStageMove = () => {
    const g = gesture.current;
    if (!g) return;
    const stage = stageRef.current!;
    if (g.kind === 'pan') {
      const p = stage.getPointerPosition()!;
      setView({ ...g.view, x: g.view.x + p.x - g.start.x, y: g.view.y + p.y - g.start.y });
      return;
    }
    const p = worldPointer();
    if (!p) return;
    if (g.kind === 'marquee') {
      setMarquee(boundsOf([g.start, p]));
    } else if (g.kind === 'opening') {
      const o = design.openings.find((x) => x.id === g.id);
      if (!o) return;
      const nw = nearestWall(room, p);
      if (nw.wall !== g.wall) {
        g.wall = nw.wall;
        g.grab = o.width / 2;
      }
      const step = snapStep();
      const offset = Math.round((nw.along - g.grab) / step) * step;
      store().updateOpening(o.id, { wall: nw.wall, offset }, true);
    } else if (g.kind === 'room') {
      const step = snapStep();
      const patch: { width?: number; depth?: number } = {};
      if (g.edge !== 'bottom') patch.width = Math.round(p.x / step) * step;
      if (g.edge !== 'right') patch.depth = Math.round(p.y / step) * step;
      store().updateRoom(patch, true);
    }
  };

  const finishGesture = useCallback(() => {
    const g = gesture.current;
    if (!g || g.kind === 'drag') return;
    gesture.current = null;
    if (g.kind === 'pan') setCursor(panKey ? 'grab' : 'default');
    if (g.kind === 'opening' || g.kind === 'room') store().endGesture();
    if (g.kind === 'marquee') {
      setMarquee((m) => {
        const s = store();
        const tiny = !m || (m.maxX - m.minX) * view.scale < 3 && (m.maxY - m.minY) * view.scale < 3;
        if (tiny) {
          if (!g.additive) s.setSelection(null);
        } else {
          const hit = s.design.items.filter((it) => {
            const b = itemBounds(it);
            return b.minX < m!.maxX && b.maxX > m!.minX && b.minY < m!.maxY && b.maxY > m!.minY;
          });
          const prev = g.additive && s.selection?.kind === 'items' ? s.selection.ids : [];
          const ids = [...new Set([...prev, ...hit.map((it) => it.id)])];
          s.setSelection(ids.length ? { kind: 'items', ids } : null);
        }
        return null;
      });
    }
  }, [panKey, view.scale]);

  useEffect(() => {
    window.addEventListener('mouseup', finishGesture);
    return () => window.removeEventListener('mouseup', finishGesture);
  }, [finishGesture]);

  useEffect(() => setCursor(panKey ? 'grab' : 'default'), [panKey]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    zoomAt(Math.exp(-e.evt.deltaY * 0.0015), p);
  };

  // ----- drop from catalog -----

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: DragEvent) => {
    const data = e.dataTransfer.getData(DND_MIME);
    const stage = stageRef.current;
    if (!data || !stage) return;
    e.preventDefault();
    stage.setPointersPositions(e.nativeEvent);
    const p = stage.getRelativePointerPosition();
    if (!p) return;
    const [kind, type] = data.split(':');
    if (kind === 'item') store().addItem(type, p);
    else store().addOpening(type as OpeningKind, p);
  };

  // ----- render -----

  const renderItem = (it: FurnitureItem) => (
    <Group
      key={it.id}
      id={it.id}
      name="item"
      ref={(n) => {
        if (n) nodes.current.set(it.id, n);
        else nodes.current.delete(it.id);
      }}
      x={it.x}
      y={it.y}
      rotation={it.rotation}
      draggable={!it.locked && !panKey}
      onMouseDown={(e) => onItemDown(e, it)}
      onTouchStart={(e) => onItemDown(e, it)}
      onDragStart={() => onDragStart(it)}
      onDragMove={(e) => onDragMove(e, it)}
      onDragEnd={onDragEnd}
      onDblClick={() => it.expandedLength !== undefined && store().toggleExpanded(it.id)}
      onMouseEnter={() => !panKey && setCursor(it.locked ? 'not-allowed' : 'move')}
      onMouseLeave={() => !panKey && setCursor('default')}
    >
      <FurnitureSymbol
        type={it.type}
        w={it.width}
        d={it.depth}
        color={settings.colorPlan ? it.color : undefined}
        expandedLength={it.expanded ? it.expandedLength : undefined}
      />
      {/* Invisible hit area: the whole footprint, including an unfolded bed. */}
      <Rect x={-it.width / 2} y={depthExtent(it)[0]} width={it.width} height={depthExtent(it)[1] - depthExtent(it)[0]} fill="rgba(0,0,0,0)" />
    </Group>
  );

  const px = (n: number) => n / view.scale; // screen pixels → mm
  const fs = annotationSize(room);
  const selectedOpening = selection?.kind === 'opening' ? design.openings.find((o) => o.id === selection.id) : undefined;
  const singleItem = selectedIds.length === 1 ? items.find((it) => it.id === selectedIds[0]) : undefined;

  return (
    <div ref={containerRef} className="canvas" onDragOver={onDragOver} onDrop={onDrop} data-testid="canvas">
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          onMouseDown={onStageDown}
          onTouchStart={onStageDown}
          onMouseMove={onStageMove}
          onTouchMove={onStageMove}
          onTouchEnd={finishGesture}
          onWheel={onWheel}
          onContextMenu={(e) => e.evt.preventDefault()}
        >
          <Layer name="grid" listening={false}>
            <Grid room={room} grid={settings.gridSize} scale={view.scale} show={settings.showGrid} floor={settings.colorPlan ? planTint(room.floorColor, 0.75) : undefined} />
          </Layer>

          <Layer name="content">
            <ExteriorOutline room={room} exterior={design.exterior} tint={settings.colorPlan} />
            <Walls room={room} openings={design.openings} />
            {/* Rugs go under door leaves and swing arcs; everything else sits on top. */}
            {ordered.filter(isFloor).map(renderItem)}
            {design.openings.map((o) => {
              const f = openingFrame(room, o);
              return (
                <Group
                  key={o.id}
                  x={f.x}
                  y={f.y}
                  rotation={f.rotation}
                  onMouseDown={(e) => onOpeningDown(e, o)}
                  onTouchStart={(e) => onOpeningDown(e, o)}
                  onDblClick={() => cycleDoor(o)}
                  onMouseEnter={() => !panKey && setCursor('grab')}
                  onMouseLeave={() => !panKey && setCursor('default')}
                >
                  <OpeningSymbol o={o} t={room.wallThickness} />
                </Group>
              );
            })}
            {ordered.filter((it) => !isFloor(it)).map(renderItem)}
            {items.map((it) => {
              const text = it.label || (settings.showNames ? CATALOG_BY_TYPE[it.type]?.name : '');
              if (!text) return null;
              const size = Math.min(Math.max(Math.min(it.width, it.depth) * 0.16, fs * 0.6), fs);
              return (
                <Text
                  key={`label-${it.id}`}
                  x={it.x - 1500}
                  y={it.y - size / 2}
                  width={3000}
                  align="center"
                  text={text}
                  fontSize={size}
                  fontFamily={FONT}
                  fill={INK}
                  listening={false}
                />
              );
            })}
            <RoomDimensions room={room} />
          </Layer>

          <Layer name="ui">
            {[...issues.entries()].map(([id]) => {
              const it = items.find((x) => x.id === id);
              if (!it) return null;
              return (
                <Line
                  key={`issue-${id}`}
                  points={itemCorners(it).flatMap((p) => [p.x, p.y])}
                  closed
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  dash={[6, 3]}
                  strokeScaleEnabled={false}
                  fill="rgba(220,38,38,0.10)"
                  listening={false}
                />
              );
            })}

            {guides.map((g, i) => (
              <Line
                key={`guide-${i}`}
                points={g.axis === 'x' ? [g.value, -room.wallThickness, g.value, room.depth + room.wallThickness] : [-room.wallThickness, g.value, room.width + room.wallThickness, g.value]}
                stroke="#db2777"
                strokeWidth={1}
                dash={[4, 4]}
                strokeScaleEnabled={false}
                listening={false}
              />
            ))}

            {settings.showClearances && singleItem && <Clearances it={singleItem} room={room} px={px} />}
            {selectedOpening && <OpeningHighlight o={selectedOpening} room={room} px={px} />}

            {/* Room resize handles on the right and bottom walls. */}
            {[
              { edge: 'right' as const, x: room.width + room.wallThickness / 2, y: room.depth / 2, w: 10, h: 28, cursor: 'ew-resize' },
              { edge: 'bottom' as const, x: room.width / 2, y: room.depth + room.wallThickness / 2, w: 28, h: 10, cursor: 'ns-resize' },
              { edge: 'corner' as const, x: room.width + room.wallThickness / 2, y: room.depth + room.wallThickness / 2, w: 12, h: 12, cursor: 'nwse-resize' },
            ].map((h) => (
              <Rect
                key={h.edge}
                name={`room-handle-${h.edge}`}
                x={h.x - px(h.w) / 2}
                y={h.y - px(h.h) / 2}
                width={px(h.w)}
                height={px(h.h)}
                cornerRadius={px(3)}
                fill="#ffffff"
                stroke={ACCENT}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                onMouseDown={(e) => onRoomHandleDown(e, h.edge)}
                onTouchStart={(e) => onRoomHandleDown(e, h.edge)}
                onMouseEnter={() => setCursor(h.cursor)}
                onMouseLeave={() => setCursor('default')}
              />
            ))}

            <Transformer
              ref={trRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={6}
              keepRatio={false}
              flipEnabled={false}
              ignoreStroke
              anchorSize={9}
              anchorCornerRadius={2}
              anchorStroke={ACCENT}
              borderStroke={ACCENT}
              rotateAnchorOffset={26}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox)}
              onTransformEnd={onTransformEnd}
            />

            {marquee && (
              <Rect
                x={marquee.minX}
                y={marquee.minY}
                width={marquee.maxX - marquee.minX}
                height={marquee.maxY - marquee.minY}
                fill="rgba(37,99,235,0.08)"
                stroke={ACCENT}
                strokeWidth={1}
                dash={[4, 3]}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}
      <div className="canvas-controls">
        <button onClick={() => zoomAt(1 / 1.25)} title="Zoom out">−</button>
        <button onClick={fit} title="Fit room to view">{Math.round((view.scale / fitScale.current) * 100)}%</button>
        <button onClick={() => zoomAt(1.25)} title="Zoom in">+</button>
      </div>
    </div>
  );
}

function DimLabel({ x, y, text, px }: { x: number; y: number; text: string; px: (n: number) => number }) {
  return (
    <Label x={x} y={y} listening={false}>
      <Tag fill={ACCENT} cornerRadius={px(3)} pointerDirection="none" />
      <Text text={text} fontSize={px(11)} padding={px(3)} fill="#ffffff" fontFamily={FONT} offsetX={0} />
    </Label>
  );
}

function centeredLabel(x: number, y: number, text: string, px: (n: number) => number) {
  // Approximate text width so the label can be centred on the point.
  const w = px(text.length * 6.2 + 6);
  const h = px(17);
  return <DimLabel key={`${x},${y}`} x={x - w / 2} y={y - h / 2} text={text} px={px} />;
}

/** Distances from the selected item to each wall. */
function Clearances({ it, room, px }: { it: FurnitureItem; room: Room; px: (n: number) => number }) {
  const b = itemBounds(it);
  const cy = (b.minY + b.maxY) / 2;
  const cx = (b.minX + b.maxX) / 2;
  const segs: { x1: number; y1: number; x2: number; y2: number; len: number }[] = [
    { x1: 0, y1: cy, x2: b.minX, y2: cy, len: b.minX },
    { x1: b.maxX, y1: cy, x2: room.width, y2: cy, len: room.width - b.maxX },
    { x1: cx, y1: 0, x2: cx, y2: b.minY, len: b.minY },
    { x1: cx, y1: b.maxY, x2: cx, y2: room.depth, len: room.depth - b.maxY },
  ].filter((s) => s.len > 5);
  return (
    <Group listening={false}>
      {segs.map((s, i) => (
        <Group key={i}>
          <Line points={[s.x1, s.y1, s.x2, s.y2]} stroke={ACCENT} strokeWidth={1} dash={[3, 3]} strokeScaleEnabled={false} />
          {s.len * 1 > px(36) && centeredLabel((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, formatLength(s.len), px)}
        </Group>
      ))}
      <Label x={b.minX} y={b.maxY + px(8)}>
        <Tag fill="#111827" cornerRadius={px(3)} />
        <Text
          text={`${Math.round(it.width / 10)} × ${Math.round(it.depth / 10)} × ${Math.round(it.height / 10)} cm`}
          fontSize={px(11)}
          padding={px(3)}
          fill="#ffffff"
          fontFamily={FONT}
        />
      </Label>
    </Group>
  );
}

/** Outline of the selected opening plus its distance to each wall corner. */
function OpeningHighlight({ o, room, px }: { o: Opening; room: Room; px: (n: number) => number }) {
  const f = openingFrame(room, o);
  const t = room.wallThickness;
  const len = wallLength(room, o.wall);
  // In the opening's frame the wall spans [-before, width + after]; bottom and left walls run backwards.
  const reversed = o.wall === 'bottom' || o.wall === 'left';
  const before = reversed ? len - o.offset - o.width : o.offset;
  const after = reversed ? o.offset : len - o.offset - o.width;
  const inset = px(18);
  const seg = (x1: number, x2: number, key: string) => {
    const a = frameToWorld(f, { x: x1, y: inset });
    const b = frameToWorld(f, { x: x2, y: inset });
    return (
      Math.abs(x2 - x1) > 5 && (
        <Group key={key}>
          <Line points={[a.x, a.y, b.x, b.y]} stroke={ACCENT} strokeWidth={1} dash={[3, 3]} strokeScaleEnabled={false} />
          {centeredLabel((a.x + b.x) / 2, (a.y + b.y) / 2, formatLength(Math.abs(x2 - x1)), px)}
        </Group>
      )
    );
  };
  const mid = frameToWorld(f, { x: o.width / 2, y: -t - px(14) });
  return (
    <Group listening={false}>
      <Group x={f.x} y={f.y} rotation={f.rotation}>
        <Rect x={0} y={-t} width={o.width} height={t} stroke={ACCENT} strokeWidth={2} strokeScaleEnabled={false} />
      </Group>
      {seg(-before, 0, 'before')}
      {seg(o.width, o.width + after, 'after')}
      {centeredLabel(mid.x, mid.y, formatLength(o.width), px)}
    </Group>
  );
}
