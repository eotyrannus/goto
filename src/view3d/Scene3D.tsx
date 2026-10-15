import { Edges, Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DND_MIME } from '../canvas/PlanCanvas';
import { CATALOG_BY_TYPE } from '../model/catalog';
import { findIssues } from '../model/clashes';
import { furnitureParts, type Part } from '../model/furniture3d';
import { depthExtent, openingFrame, frameToWorld } from '../model/geometry';
import type { Design, DoorMaterial, FurnitureItem, Opening, OpeningKind, Room, Wall } from '../model/types';
import { DOOR_OPEN, doorLeafSegments, wallBlocks, type Block } from '../model/walls3d';
import { isBlocked, walkWorld } from '../model/walkable';
import { FLOOR_RAISE, mod10Parts } from '../model/exterior';
import { useDesign } from '../store/designStore';
import { scene3dApi } from './api';
import { useDoors } from './doors';
import { attach, detach } from './bridge';

// Plan millimetres → three.js metres. Plan x → X, plan y → Z, height → Y (up).
const M = 0.001;
const ACCENT = '#2563eb';
const WALL_TOP = '#3a3a3a';

type Mode = 'orbit' | 'walk';

// ---------- shared geometry & materials ----------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(0.5, 24, 16);
const cylinders = new Map<number, THREE.CylinderGeometry>();
function cylinder(taper = 1) {
  if (!cylinders.has(taper)) cylinders.set(taper, new THREE.CylinderGeometry(0.5 * taper, 0.5, 1, 28));
  return cylinders.get(taper)!;
}
const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string, glow = false) {
  const key = `${color}${glow ? '*' : ''}`;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0.04,
        emissive: glow ? new THREE.Color(color) : new THREE.Color('#000000'),
        emissiveIntensity: glow ? 0.35 : 0,
      }),
    );
  }
  return materials.get(key)!;
}
const GLASS = new THREE.MeshPhysicalMaterial({ color: '#cfe3f1', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false });
/** Door glass reads a little stronger than window glass so the door is visible when shut. */
const DOOR_GLASS = new THREE.MeshPhysicalMaterial({ color: '#b9d3e6', transparent: true, opacity: 0.42, roughness: 0.05, depthWrite: false });
const metals = new Map<string, THREE.MeshStandardMaterial>();
function metal(color: string) {
  if (!metals.has(color)) metals.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.65 }));
  return metals.get(color)!;
}
/** Rounded boxes are built at their real size (in metres) so edge radii stay round. */
const rounded = new Map<string, RoundedBoxGeometry>();
function roundedBox(sx: number, sy: number, sz: number, r: number) {
  const key = [sx, sy, sz, r].map((v) => v.toFixed(4)).join('|');
  if (!rounded.has(key)) rounded.set(key, new RoundedBoxGeometry(sx, sy, sz, 4, r));
  return rounded.get(key)!;
}

/** Box in plan coordinates (mm). */
function blockProps(b: Pick<Block, 'x0' | 'x1' | 'y0' | 'y1' | 'z0' | 'z1'>) {
  return {
    position: [((b.x0 + b.x1) / 2) * M, ((b.z0 + b.z1) / 2) * M, ((b.y0 + b.y1) / 2) * M] as [number, number, number],
    scale: [(b.x1 - b.x0) * M, (b.z1 - b.z0) * M, (b.y1 - b.y0) * M] as [number, number, number],
  };
}

// ---------- room ----------

const WALLS: Wall[] = ['top', 'right', 'bottom', 'left'];

// BoxGeometry face order: +x, -x, +y (top), -y, +z, -z. Wall tops are dark, like the plan's poché.
const WALL_TOP_MAT = new THREE.MeshStandardMaterial({ color: WALL_TOP, roughness: 0.9 });
function useWallMaterials(color: string) {
  return useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    return [side, side, WALL_TOP_MAT, side, side, side];
  }, [color]);
}

/** Walls cut down to this height when they stand between the camera and the room. */
const STUB = 120;

/**
 * Dollhouse cutaway: any wall the orbit camera is behind drops to a low stub so you can see in.
 * Each wall has a full-height group and a stub group; exactly one of them is visible.
 */
/**
 * With an exterior shell, the outside view keeps everything standing (roof included); the inside
 * view lifts the roof and cuts the near walls and their cladding. Without a shell, near walls are
 * always cut in orbit mode.
 */
function Cutaway({
  room,
  groups,
  mode,
  shell,
  inside,
}: {
  room: Room;
  groups: RefObject<Record<string, THREE.Group | null>>;
  mode: Mode;
  shell: boolean;
  inside: boolean;
}) {
  useFrame(({ camera }) => {
    const p = camera.position;
    const behind: Record<Wall, boolean> = {
      top: p.z < 0,
      bottom: p.z > room.depth * M,
      left: p.x < 0,
      right: p.x > room.width * M,
    };
    for (const w of WALLS) {
      const cut = mode === 'orbit' && behind[w] && (!shell || inside);
      const full = groups.current?.[`full-${w}`];
      const stub = groups.current?.[`stub-${w}`];
      const clad = groups.current?.[`ext-${w}`];
      if (full) full.visible = !cut;
      if (stub) stub.visible = cut;
      if (clad) clad.visible = !cut;
    }
    const roof = groups.current?.['ext-roof'];
    if (roof) roof.visible = !(mode === 'orbit' && inside);
  });
  return null;
}

function Room3D({ design, mode, inside }: { design: Design; mode: Mode; inside: boolean }) {
  const { room, openings } = design;
  const blocks = useMemo(() => wallBlocks(room, openings), [room, openings]);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const wallMats = useWallMaterials(room.wallColor);
  const shell = design.exterior.style !== 'none';
  const W = room.width * M;
  const D = room.depth * M;
  const H = room.height * M;
  const stubs = useMemo(() => blocks.filter((b) => b.z0 < STUB).map((b) => ({ ...b, z1: Math.min(b.z1, STUB) })), [blocks]);
  // Openings on a cut-away wall are hidden along with it (door leaves stay: they're in the room).
  return (
    <group>
      <Cutaway room={room} groups={groups} mode={mode} shell={shell} inside={inside} />
      {shell && <Exterior3D design={design} groups={groups} />}
      {/* Ground around the room, the floor, and a ceiling that's only visible from below. */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, shell ? -FLOOR_RAISE * M : -0.002, D / 2]} receiveShadow>
        <planeGeometry args={[W + 30, D + 30]} />
        <meshStandardMaterial color="#e2e5e9" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={room.floorColor} roughness={0.9} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[W / 2, H, D / 2]}>
        <planeGeometry args={[W, D]} />
        {/* Lit evenly: a ceiling only catches the dim underside of the scene lights. */}
        <meshBasicMaterial color="#e9e7e2" />
      </mesh>
      {WALLS.map((w) => (
        <group key={w}>
          <group ref={(g) => void (groups.current[`full-${w}`] = g)} userData={{ wallFull: true }}>
            {blocks
              .filter((b) => b.wall === w)
              .map((b, i) => (
                <mesh key={i} geometry={BOX} material={wallMats} {...blockProps(b)} castShadow receiveShadow />
              ))}
            {openings
              .filter((o) => o.wall === w && o.kind !== 'door' && o.kind !== 'double-door')
              .map((o) => (
                <Opening3D key={o.id} room={room} o={o} />
              ))}
          </group>
          <group ref={(g) => void (groups.current[`stub-${w}`] = g)} userData={{ wallStub: true }} visible={false}>
            {stubs
              .filter((b) => b.wall === w)
              .map((b, i) => (
                <mesh key={i} geometry={BOX} material={wallMats} {...blockProps(b)} receiveShadow />
              ))}
          </group>
        </group>
      ))}
      {openings
        .filter((o) => o.kind === 'door' || o.kind === 'double-door')
        .map((o) => (
          <Opening3D key={o.id} room={room} o={o} />
        ))}
    </group>
  );
}

function Opening3D({ room, o }: { room: Room; o: Opening }) {
  const t = room.wallThickness;
  // The opening's footprint in plan coordinates.
  const f = openingFrame(room, o);
  const a = frameToWorld(f, { x: 0, y: -t });
  const b = frameToWorld(f, { x: o.width, y: 0 });
  const span = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
  const horizontal = o.wall === 'top' || o.wall === 'bottom';
  const top = o.sill + o.height;
  const frameW = 45;

  if (o.kind === 'window') {
    const mid = horizontal ? (span.y0 + span.y1) / 2 : (span.x0 + span.x1) / 2;
    const glass = horizontal
      ? { ...span, y0: mid - 6, y1: mid + 6, z0: o.sill, z1: top }
      : { ...span, x0: mid - 6, x1: mid + 6, z0: o.sill, z1: top };
    const frame = (p: Partial<Block>) => ({ ...span, z0: o.sill, z1: top, ...p });
    const pieces = horizontal
      ? [frame({ z1: o.sill + frameW }), frame({ z0: top - frameW }), frame({ x1: span.x0 + frameW }), frame({ x0: span.x1 - frameW }), frame({ x0: (span.x0 + span.x1) / 2 - 15, x1: (span.x0 + span.x1) / 2 + 15 })]
      : [frame({ z1: o.sill + frameW }), frame({ z0: top - frameW }), frame({ y1: span.y0 + frameW }), frame({ y0: span.y1 - frameW }), frame({ y0: (span.y0 + span.y1) / 2 - 15, y1: (span.y0 + span.y1) / 2 + 15 })];
    return (
      <group>
        <mesh geometry={BOX} material={GLASS} {...blockProps(glass)} />
        {pieces.map((p, i) => (
          <mesh key={i} geometry={BOX} material={material(o.color)} {...blockProps({ ...p, ...(horizontal ? { y0: (span.y0 + span.y1) / 2 - 30, y1: (span.y0 + span.y1) / 2 + 30 } : { x0: (span.x0 + span.x1) / 2 - 30, x1: (span.x0 + span.x1) / 2 + 30 }) })} castShadow />
        ))}
      </group>
    );
  }

  if (o.kind === 'sliding-door' || o.kind === 'door' || o.kind === 'double-door') return <Door3D room={room} o={o} />;
  return null;
}

/** Ease a value towards a target each frame (doors swing rather than snap). */
function useEased(target: number) {
  const value = useRef(target);
  return (dt: number) => {
    value.current += (target - value.current) * Math.min(1, dt * 7);
    if (Math.abs(target - value.current) < 0.001) value.current = target;
    return value.current;
  };
}

/** Hinged or sliding door that opens and closes when clicked (in orbit and walk modes). */
function Door3D({ room, o }: { room: Room; o: Opening }) {
  const shut = useDoors((s) => !!s.shut[o.id]);
  const toggle = useDoors((s) => s.toggle);
  const step = useEased(shut ? 0 : 1);
  const leaves = useRef<(THREE.Group | null)[]>([]);
  const sliding = useRef<THREE.Group>(null);
  const t = room.wallThickness;
  const f = openingFrame(room, o);
  const kind = o.material ?? 'wood';
  const panelThick = Math.min(40, t * 0.2);

  useFrame((_, dt) => {
    const amount = step(dt);
    if (o.kind === 'sliding-door') {
      // The inner panel slides along the wall behind the fixed one.
      const p = frameToWorld(f, { x: o.width * 0.45 * amount, y: -t * 0.6 });
      sliding.current?.position.set(p.x * M, 0, p.y * M);
      return;
    }
    doorLeafSegments(room, o, amount * DOOR_OPEN).forEach((leaf, i) => {
      const g = leaves.current[i];
      if (!g) return;
      g.position.set(leaf.hinge.x * M, 0, leaf.hinge.y * M);
      g.rotation.y = -Math.atan2(leaf.end.y - leaf.hinge.y, leaf.end.x - leaf.hinge.x);
    });
  });

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 5) return;
      e.stopPropagation();
      toggle(o.id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => (document.body.style.cursor = ''),
  };

  const along = (-f.rotation * Math.PI) / 180;
  if (o.kind === 'sliding-door') {
    const fixed = frameToWorld(f, { x: o.width * 0.45, y: -t * 0.4 });
    const panel = <DoorPanel len={o.width * 0.55} height={o.height} thick={panelThick} kind={kind} color={o.color} sliding />;
    return (
      <group name={`door-${o.id}`} {...handlers}>
        <group position={[fixed.x * M, 0, fixed.y * M]} rotation-y={along}>
          {panel}
        </group>
        <group ref={sliding} rotation-y={along}>
          {panel}
        </group>
      </group>
    );
  }
  const len = o.kind === 'double-door' ? o.width / 2 : o.width;
  return (
    <group name={`door-${o.id}`} {...handlers}>
      {doorLeafSegments(room, o).map((_, i) => (
        <group key={i} ref={(g) => void (leaves.current[i] = g)}>
          <DoorPanel len={len} height={o.height - 10} thick={40} kind={kind} color={o.color} />
        </group>
      ))}
    </group>
  );
}

/**
 * One door leaf in its own frame: x runs 0..len from the hinge (or panel edge), y is up, z is
 * through the leaf. `kind` picks the build: solid wood, frameless glass, or a wood or aluminium
 * frame around a glass centre. `color` is the wood / frame colour.
 */
function DoorPanel({ len, height, thick, kind, color, sliding = false }: { len: number; height: number; thick: number; kind: DoorMaterial; color: string; sliding?: boolean }) {
  const part = (x0: number, x1: number, y0: number, y1: number, mat: THREE.Material, depth = thick) => (
    <mesh
      geometry={BOX}
      material={mat}
      position={[((x0 + x1) / 2) * M, ((y0 + y1) / 2) * M, 0]}
      scale={[(x1 - x0) * M, (y1 - y0) * M, depth * M]}
      castShadow
    />
  );
  const lever = <mesh geometry={BOX} material={metal('#5b5f66')} position={[len * 0.88 * M, 1.0, 0]} scale={[0.12, 0.02, (thick + 50) * M]} />;
  const pull = (
    <mesh geometry={cylinder()} material={metal('#c3c8ce')} position={[len * 0.9 * M, 1.05, 0]} scale={[0.025, 0.5, (thick + 70) * M]} />
  );
  if (kind === 'wood') {
    return (
      <>
        {part(0, len, 0, height, material(color))}
        {!sliding && lever}
      </>
    );
  }
  if (kind === 'glass') {
    // Frameless toughened glass with small patch fittings and a long bar handle.
    return (
      <>
        {part(2, len - 2, 2, height - 2, DOOR_GLASS, 12)}
        {part(0, 140, 0, 70, metal(color), 24)}
        {part(0, 140, height - 70, height, metal(color), 24)}
        {pull}
      </>
    );
  }
  const frameMat = kind === 'aluminium-glass' ? metal(color) : material(color);
  const stile = kind === 'aluminium-glass' ? 55 : 110;
  const bottom = kind === 'aluminium-glass' ? 95 : 220;
  return (
    <>
      {part(0, stile, 0, height, frameMat)}
      {part(len - stile, len, 0, height, frameMat)}
      {part(stile, len - stile, height - stile, height, frameMat)}
      {part(stile, len - stile, 0, bottom, frameMat)}
      {part(stile, len - stile, bottom, height - stile, DOOR_GLASS, 10)}
      {!sliding && (kind === 'aluminium-glass' ? pull : lever)}
    </>
  );
}

// ---------- exterior shell ----------

/** Wedges (boxes with a sloping top) are built at real size, like rounded boxes. */
const wedges = new Map<string, THREE.BufferGeometry>();
function wedge(sx: number, sy: number, back: number, front: number) {
  const key = [sx, sy, back, front].map((v) => v.toFixed(4)).join('|');
  if (!wedges.has(key)) {
    const g = new THREE.BoxGeometry(sx, 1, sy);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Bottom at 0; top at `back` on the -Z (plan -y) end and `front` on the +Z end.
      pos.setY(i, pos.getY(i) > 0 ? (pos.getZ(i) < 0 ? back : front) : 0);
    }
    g.computeVertexNormals();
    wedges.set(key, g);
  }
  return wedges.get(key)!;
}

function Exterior3D({ design, groups }: { design: Design; groups: RefObject<Record<string, THREE.Group | null>> }) {
  const { room, openings, exterior } = design;
  const { parts, frame } = useMemo(() => mod10Parts(room, openings, exterior), [room, openings, exterior]);
  const bySide = useMemo(() => {
    const out = new Map<string, Part[]>();
    for (const p of parts) out.set(p.side, [...(out.get(p.side) ?? []), p]);
    return out;
  }, [parts]);
  return (
    <group position={[frame.x * M, 0, frame.y * M]} rotation-y={(-frame.rotation * Math.PI) / 180} name="exterior">
      {[...bySide.entries()].map(([side, list]) => (
        <group key={side} ref={(g) => void (groups.current[`ext-${side}`] = g)} userData={{ wallFull: side !== 'base' }}>
          {list.map((p, i) => (
            <PartMesh key={i} p={p} />
          ))}
        </group>
      ))}
    </group>
  );
}

// ---------- furniture ----------

function PartMesh({ p }: { p: Part }) {
  const common = { material: p.glass ? GLASS : material(p.color, p.glow), castShadow: !p.glass, receiveShadow: true };
  const position: [number, number, number] = [p.x * M, p.z * M, p.y * M];
  const tilt = -THREE.MathUtils.degToRad(p.tilt ?? 0);
  if (p.shape === 'wedge') {
    return <mesh {...common} geometry={wedge(p.sx * M, p.sy * M, p.sz * M, (p.topFront ?? p.sz) * M)} position={position} />;
  }
  if (p.shape === 'rbox') {
    // Built at real size; tilt leans the top towards the back (-y on the plan, -Z here).
    return <mesh {...common} geometry={roundedBox(p.sx * M, p.sz * M, p.sy * M, (p.radius ?? 20) * M)} position={position} rotation-x={-THREE.MathUtils.degToRad(p.tilt ?? 0)} />;
  }
  if (p.shape === 'cyl' && p.axis) {
    // Cylinders stand on Y; lay them along the plan's x or y axis.
    return p.axis === 'y' ? (
      <mesh {...common} geometry={cylinder(p.taper)} position={position} rotation-x={Math.PI / 2} scale={[p.sx * M, p.sy * M, p.sz * M]} />
    ) : (
      <mesh {...common} geometry={cylinder(p.taper)} position={position} rotation-z={Math.PI / 2} scale={[p.sz * M, p.sx * M, p.sy * M]} />
    );
  }
  return (
    <mesh
      {...common}
      geometry={p.shape === 'box' ? BOX : p.shape === 'sphere' ? SPHERE : cylinder(p.taper)}
      position={position}
      rotation-x={tilt}
      scale={[p.sx * M, p.sz * M, p.sy * M]}
    />
  );
}

const Item3D = memo(function Item3D({
  it,
  selected,
  issue,
  hovered,
  interactive,
}: {
  it: FurnitureItem;
  selected: boolean;
  issue: boolean;
  hovered: boolean;
  interactive: boolean;
}) {
  const parts = useMemo(
    () =>
      furnitureParts(it.type, it.width, it.depth, it.height, it.color, CATALOG_BY_TYPE[it.type]?.color, it.expanded ? it.expandedLength : undefined),
    [it.type, it.width, it.depth, it.height, it.color, it.expanded, it.expandedLength],
  );
  const s = useDesign.getState;
  const unfolds = it.expandedLength !== undefined;
  const [back, front] = depthExtent(it);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    if (!interactive) {
      // Walking: there's no selection, so a click folds or unfolds a sofa bed.
      if (unfolds) {
        e.stopPropagation();
        s().toggleExpanded(it.id);
      }
      return;
    }
    e.stopPropagation();
    const st = s();
    const current = st.selection?.kind === 'items' ? st.selection.ids : [];
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const ids = current.includes(it.id) ? current.filter((x) => x !== it.id) : [...current, it.id];
      st.setSelection(ids.length ? { kind: 'items', ids } : null);
    } else st.setSelection({ kind: 'items', ids: [it.id] });
  };
  const outline = selected ? ACCENT : issue ? '#dc2626' : null;
  return (
    <group
      name={`item-${it.id}`}
      position={[it.x * M, it.elevation * M, it.y * M]}
      rotation-y={(-it.rotation * Math.PI) / 180}
      onClick={onClick}
      onDoubleClick={(e) => {
        if (!interactive || !unfolds) return;
        e.stopPropagation();
        s().toggleExpanded(it.id);
      }}
      onPointerOver={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        scene3dApi.setHovered(it.id);
      }}
      onPointerOut={() => scene3dApi.setHovered(null)}
    >
      {parts.map((p, i) => (
        <PartMesh key={i} p={p} />
      ))}
      {outline && (
        <mesh
          position={[0, (it.height / 2) * M, ((back + front) / 2) * M]}
          scale={[(it.width + 30) * M, (it.height + 30) * M, (front - back + 30) * M]}
          userData={{ helper: true }}
          raycast={() => null}
        >
          <boxGeometry />
          <meshBasicMaterial visible={false} />
          <Edges color={outline} />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, (it.height + 150) * M, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="tip3d">{it.label || CATALOG_BY_TYPE[it.type]?.name || it.type}</div>
        </Html>
      )}
    </group>
  );
});

// ---------- cameras ----------

function roomView(room: Room) {
  const center = new THREE.Vector3((room.width / 2) * M, (room.height / 3) * M, (room.depth / 2) * M);
  const radius = 0.5 * Math.hypot(room.width, room.depth, room.height) * M;
  return { center, dist: (radius / Math.sin(THREE.MathUtils.degToRad(45 / 2))) * 1.05 };
}

function OrbitRig({ design }: { design: Design }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const { room } = design;

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const place = (kind: 'fit' | 'top') => {
      const { center, dist } = roomView(room);
      const c = controls.current;
      if (kind === 'top') {
        camera.position.set(center.x, dist * 1.1, center.z + 0.001);
        c?.target.set(center.x, 0, center.z);
      } else {
        // Three-quarter view from the front-right, looking slightly down into the room.
        const dir = new THREE.Vector3(0.55, 0.85, 1).normalize();
        camera.position.copy(center.clone().addScaledVector(dir, dist));
        c?.target.copy(center);
      }
      c?.update();
    };
    cam.fov = 45;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    scene3dApi.view = place;
    place('fit');
    // Only re-frame when a different design is opened, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.id, camera]);

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.5} maxDistance={60} />;
}

/** First-person walk: drag to look, WASD / arrows to move, Shift to go faster. */
function WalkRig({ design }: { design: Design }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const { room } = design;
  const eye = Math.min(1600, room.height - 150) * M;

  // Walls (except doorways), shut doors and furniture block you; the ground steps from the
  // floor to the deck to the lawn. Positions here are metres; the walk world works in mm.
  const shut = useDoors((s) => s.shut);
  const world = useMemo(
    () => walkWorld(design, new Set(Object.keys(shut).filter((id) => shut[id]))),
    [design, shut],
  );
  const blocked = (x: number, z: number) => isBlocked(world, { x: x / M, y: z / M });

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 70;
    cam.near = 0.05;
    cam.updateProjectionMatrix();

    // Start just inside the first door, facing into the room; otherwise near the bottom wall.
    let start = { x: room.width / 2, z: room.depth - 600, yaw: 0 };
    const door = design.openings.find((o) => o.kind !== 'window');
    if (door) {
      const f = openingFrame(room, door);
      const p = frameToWorld(f, { x: door.width / 2, y: 700 });
      const inward = frameToWorld({ ...f, x: 0, y: 0 }, { x: 0, y: 1 });
      start = { x: p.x, z: p.y, yaw: Math.atan2(-inward.x, -inward.y) };
    }
    if (blocked(start.x * M, start.z * M)) start = { x: room.width / 2, z: room.depth / 2, yaw: start.yaw };
    camera.position.set(start.x * M, eye + world.ground({ x: start.x, y: start.z }) * M, start.z * M);
    look.current = { yaw: start.yaw, pitch: -0.08 };

    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      look.current.yaw += (e.clientX - drag.x) * 0.005;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + (e.clientY - drag.y) * 0.004, -1.2, 1.2);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      keys.current.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.code);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
    // Re-place only when entering walk mode or opening another design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.id, camera, gl]);

  useFrame((_, dt) => {
    const k = keys.current;
    const { yaw, pitch } = look.current;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (fwd || strafe) {
      // Cap the step so a stalled frame can't tunnel through a wall.
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.8 : 1.3) * Math.min(dt, 0.1);
      const dx = (-Math.sin(yaw) * fwd + Math.cos(yaw) * strafe) * speed;
      const dz = (-Math.cos(yaw) * fwd - Math.sin(yaw) * strafe) * speed;
      const p = camera.position;
      // Slide along obstacles by trying each axis on its own.
      if (!blocked(p.x + dx, p.z)) p.x += dx;
      if (!blocked(p.x, p.z + dz)) p.z += dz;
    }
    // Ease up and down steps rather than snapping.
    const p = camera.position;
    const target = eye + world.ground({ x: p.x / M, y: p.z / M }) * M;
    p.y += (target - p.y) * Math.min(1, dt * 10);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  });
  return null;
}

// ---------- api bridge (export, picking, tests) ----------

function ApiBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    attach({ gl, scene, camera });
    return detach;
  }, [gl, scene, camera]);
  return null;
}

// ---------- scene ----------

function Contents({ mode, inside }: { mode: Mode; inside: boolean }) {
  const design = useDesign((s) => s.design);
  const selection = useDesign((s) => s.selection);
  const settings = useDesign((s) => s.settings);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    scene3dApi.setHovered = setHovered;
  }, []);
  const issues = useMemo(() => (settings.showClashes ? findIssues(design) : new Map()), [design, settings.showClashes]);
  const selected = new Set(selection?.kind === 'items' ? selection.ids : []);
  const { room } = design;
  const W = room.width * M;
  const D = room.depth * M;
  const span = Math.max(W, D) + 2;

  return (
    <>
      <color attach="background" args={['#e9edf2']} />
      <hemisphereLight args={['#ffffff', '#d8d0c2', 1.1]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        castShadow
        position={[W / 2 + 2.5, room.height * M + 5, D / 2 + 3.5]}
        intensity={1.9}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      >
        <object3D attach="target" position={[W / 2, 0, D / 2]} />
      </directionalLight>
      <Room3D design={design} mode={mode} inside={inside} />
      {design.items.map((it) => (
        <Item3D
          key={it.id}
          it={it}
          selected={selected.has(it.id)}
          issue={issues.has(it.id)}
          hovered={hovered === it.id && mode === 'orbit'}
          interactive={mode === 'orbit'}
        />
      ))}
      {mode === 'orbit' ? <OrbitRig design={design} /> : <WalkRig design={design} />}
      <ApiBridge />
    </>
  );
}

export default function Scene3D() {
  const [mode, setMode] = useState<Mode>('orbit');
  const [inside, setInside] = useState(false);
  const shell = useDesign((s) => s.design.exterior.style !== 'none');
  const downAt = useRef<{ x: number; y: number } | null>(null);

  // While walking, the plan's keyboard shortcuts (arrows nudge, R rotates…) stand down.
  useEffect(() => {
    document.body.dataset.walking = mode === 'walk' ? '1' : '';
    if (mode === 'walk') useDesign.getState().setSelection(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMode('orbit');
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.dataset.walking = '';
    };
  }, [mode]);

  const onDrop = (e: DragEvent) => {
    const data = e.dataTransfer.getData(DND_MIME);
    if (!data) return;
    e.preventDefault();
    const p = scene3dApi.floorPoint(e.clientX, e.clientY);
    if (!p) return;
    const [kind, type] = data.split(':');
    if (kind === 'item') useDesign.getState().addItem(type, p);
    else useDesign.getState().addOpening(type as OpeningKind, p);
  };

  return (
    <div
      className="scene3d"
      data-testid="scene3d"
      onPointerDown={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
    >
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.05, far: 200, position: [6, 6, 6] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={(e) => {
          const d = downAt.current;
          if (mode === 'orbit' && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) useDesign.getState().setSelection(null);
        }}
      >
        <Contents mode={mode} inside={inside} />
      </Canvas>
      <div className="scene3d-controls">
        {mode === 'orbit' ? (
          <>
            {shell && (
              <button className={inside ? 'active' : ''} onClick={() => setInside(!inside)} data-testid="toggle-inside" title="Lift the roof and cut the near walls to see your layout">
                {inside ? 'Outside view' : 'Inside view'}
              </button>
            )}
            <button onClick={() => scene3dApi.view('fit')} title="Three-quarter view of the whole room">Fit</button>
            <button onClick={() => scene3dApi.view('top')} title="Look straight down">Top</button>
            <button onClick={() => setMode('walk')} data-testid="walk-button" title="Walk around inside at eye height">Walk</button>
          </>
        ) : (
          <button className="active" onClick={() => setMode('orbit')} data-testid="exit-walk">Exit walk</button>
        )}
      </div>
      <div className="scene3d-hint">
        {mode === 'orbit'
          ? 'Drag to orbit · right-drag to pan · wheel to zoom · click to select'
          : 'Drag to look around · W A S D or arrows to move · Shift to go faster · Esc to stop walking'}
      </div>
    </div>
  );
}
