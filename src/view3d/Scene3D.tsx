import { Edges, Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DND_MIME } from '../canvas/PlanCanvas';
import { CATALOG_BY_TYPE } from '../model/catalog';
import { findIssues } from '../model/clashes';
import { furnitureParts, type Part } from '../model/furniture3d';
import { itemBounds, openingFrame, frameToWorld } from '../model/geometry';
import type { Design, FurnitureItem, Opening, OpeningKind, Room, Wall } from '../model/types';
import { doorLeafSegments, wallBlocks, type Block } from '../model/walls3d';
import { useDesign } from '../store/designStore';
import { scene3dApi } from './api';
import { attach, detach } from './bridge';

// Plan millimetres → three.js metres. Plan x → X, plan y → Z, height → Y (up).
const M = 0.001;
const ACCENT = '#2563eb';
const WALL = '#f3f1ec';
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
const WALL_SIDE = new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.95 });
const WALL_MATS = [WALL_SIDE, WALL_SIDE, new THREE.MeshStandardMaterial({ color: WALL_TOP, roughness: 0.9 }), WALL_SIDE, WALL_SIDE, WALL_SIDE];

/** Walls cut down to this height when they stand between the camera and the room. */
const STUB = 120;

/**
 * Dollhouse cutaway: any wall the orbit camera is behind drops to a low stub so you can see in.
 * Each wall has a full-height group and a stub group; exactly one of them is visible.
 */
function Cutaway({ room, groups, mode }: { room: Room; groups: RefObject<Record<string, THREE.Group | null>>; mode: Mode }) {
  useFrame(({ camera }) => {
    const p = camera.position;
    const behind: Record<Wall, boolean> = {
      top: p.z < 0,
      bottom: p.z > room.depth * M,
      left: p.x < 0,
      right: p.x > room.width * M,
    };
    for (const w of WALLS) {
      const cut = mode === 'orbit' && behind[w];
      const full = groups.current?.[`full-${w}`];
      const stub = groups.current?.[`stub-${w}`];
      if (full) full.visible = !cut;
      if (stub) stub.visible = cut;
    }
  });
  return null;
}

function Room3D({ design, mode }: { design: Design; mode: Mode }) {
  const { room, openings } = design;
  const blocks = useMemo(() => wallBlocks(room, openings), [room, openings]);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const W = room.width * M;
  const D = room.depth * M;
  const H = room.height * M;
  const stubs = useMemo(() => blocks.filter((b) => b.z0 < STUB).map((b) => ({ ...b, z1: Math.min(b.z1, STUB) })), [blocks]);
  // Openings on a cut-away wall are hidden along with it (door leaves stay: they're in the room).
  return (
    <group>
      <Cutaway room={room} groups={groups} mode={mode} />
      {/* Ground around the room, the floor, and a ceiling that's only visible from below. */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.002, D / 2]} receiveShadow>
        <planeGeometry args={[W + 30, D + 30]} />
        <meshStandardMaterial color="#e2e5e9" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e6dac6" roughness={0.9} />
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
                <mesh key={i} geometry={BOX} material={WALL_MATS} {...blockProps(b)} castShadow receiveShadow />
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
                <mesh key={i} geometry={BOX} material={WALL_MATS} {...blockProps(b)} receiveShadow />
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
          <mesh key={i} geometry={BOX} material={material('#ffffff')} {...blockProps({ ...p, ...(horizontal ? { y0: (span.y0 + span.y1) / 2 - 30, y1: (span.y0 + span.y1) / 2 + 30 } : { x0: (span.x0 + span.x1) / 2 - 30, x1: (span.x0 + span.x1) / 2 + 30 }) })} castShadow />
        ))}
      </group>
    );
  }

  if (o.kind === 'sliding-door') {
    const panel = (from: number, to: number, depthFrom: number, depthTo: number) => {
      const p1 = frameToWorld(f, { x: o.width * from, y: -t * depthFrom });
      const p2 = frameToWorld(f, { x: o.width * to, y: -t * depthTo });
      return { x0: Math.min(p1.x, p2.x), x1: Math.max(p1.x, p2.x), y0: Math.min(p1.y, p2.y), y1: Math.max(p1.y, p2.y), z0: 0, z1: o.height };
    };
    return (
      <group>
        <mesh geometry={BOX} material={material('#d8c3a0')} {...blockProps(panel(0, 0.55, 0.7, 0.5))} castShadow />
        <mesh geometry={BOX} material={material('#d8c3a0')} {...blockProps(panel(0.45, 1, 0.5, 0.3))} castShadow />
      </group>
    );
  }

  if (o.kind === 'door' || o.kind === 'double-door') {
    return (
      <group>
        {doorLeafSegments(room, o).map((leaf, i) => {
          const dx = leaf.end.x - leaf.hinge.x;
          const dy = leaf.end.y - leaf.hinge.y;
          const len = Math.hypot(dx, dy);
          return (
            <group key={i} position={[((leaf.hinge.x + leaf.end.x) / 2) * M, 0, ((leaf.hinge.y + leaf.end.y) / 2) * M]} rotation-y={-Math.atan2(dy, dx)}>
              <mesh geometry={BOX} material={material('#d8c3a0')} position={[0, ((o.height - 10) / 2) * M, 0]} scale={[len * M, (o.height - 10) * M, 40 * M]} castShadow />
              <mesh geometry={BOX} material={material('#5b5b5b')} position={[len * 0.38 * M, 1.0, 0]} scale={[0.12, 0.02, 0.07]} />
            </group>
          );
        })}
      </group>
    );
  }
  return null;
}

// ---------- furniture ----------

const PartMesh = ({ p }: { p: Part }) => (
  <mesh
    geometry={p.shape === 'box' ? BOX : p.shape === 'sphere' ? SPHERE : cylinder(p.taper)}
    material={material(p.color, p.glow)}
    position={[p.x * M, p.z * M, p.y * M]}
    scale={[p.sx * M, p.sz * M, p.sy * M]}
    castShadow
    receiveShadow
  />
);

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
  const parts = useMemo(() => furnitureParts(it.type, it.width, it.depth, it.height), [it.type, it.width, it.depth, it.height]);
  const s = useDesign.getState;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > 5) return;
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
        <mesh position={[0, (it.height / 2) * M, 0]} scale={[(it.width + 30) * M, (it.height + 30) * M, (it.depth + 30) * M]} userData={{ helper: true }} raycast={() => null}>
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

  // Blockers: furniture you can't walk through (rugs and high wall-mounted things don't count).
  const blockers = useMemo(
    () =>
      design.items
        .filter((it) => CATALOG_BY_TYPE[it.type]?.layer !== 'floor' && it.elevation < 1700)
        .map((it) => {
          const b = itemBounds(it);
          const pad = 180;
          return { x0: (b.minX - pad) * M, x1: (b.maxX + pad) * M, z0: (b.minY - pad) * M, z1: (b.maxY + pad) * M };
        }),
    [design.items],
  );
  const blocked = (x: number, z: number) => {
    const m = 0.25;
    if (x < m || z < m || x > room.width * M - m || z > room.depth * M - m) return true;
    return blockers.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  };

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
    camera.position.set(start.x * M, eye, start.z * M);
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
    camera.position.y = eye;
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

function Contents({ mode }: { mode: Mode }) {
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
      <Room3D design={design} mode={mode} />
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
        <Contents mode={mode} />
      </Canvas>
      <div className="scene3d-controls">
        {mode === 'orbit' ? (
          <>
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
