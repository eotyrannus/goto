import { useEffect, useRef, useState } from 'react';
import { CATALOG_BY_TYPE, DOOR_MATERIALS, isDoor, OPENING_BY_KIND, OPENINGS } from '../model/catalog';
import { findIssues, ISSUE_TEXT } from '../model/clashes';
import { wallLength } from '../model/geometry';
import type { DoorMaterial, FurnitureItem, Opening, Wall } from '../model/types';
import { cmToMm, formatArea, mmToCm } from '../model/units';
import { ROOM_COLORS } from '../model/color';
import { DEFAULT_EXTERIOR, EXTERIOR_STYLES, MOD10, mod10RoomSize, ROOF_COLOURS, type Exterior } from '../model/exterior';
import { useDesign } from '../store/designStore';

/** Numeric field that edits a millimetre value in centimetres; commits on Enter or blur. */
function LengthField({ label, mm, onChange, unit = 'cm', testId }: { label: string; mm: number; onChange: (mm: number) => void; unit?: string; testId?: string }) {
  const [text, setText] = useState(String(mmToCm(mm)));
  useEffect(() => setText(String(mmToCm(mm))), [mm]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(v) && cmToMm(v) !== Math.round(mm)) onChange(cmToMm(v));
    else setText(String(mmToCm(mm)));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-unit">
        <input
          data-testid={testId}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(String(mmToCm(mm)));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <em>{unit}</em>
      </div>
    </label>
  );
}

/** Text field that commits once editing finishes, so typing is a single undo step. */
export function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onChange(text)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

const SWATCHES = [
  '#ffffff', '#f1efea', '#d9d4ca', '#a7a196', '#5b5f66', '#2f3237',
  '#e6dac6', '#c8a47a', '#8a6a4b', '#8ea2b6', '#4f6d8f', '#6c9a58',
  '#b9a3c4', '#c97b63', '#d9b44a', '#9e3b3b',
];

/**
 * Colour picker plus quick swatches. Dragging inside the native picker previews live and is
 * recorded as a single undo step when the picker closes.
 */
function ColorField({
  label,
  value,
  defaultColor,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  defaultColor?: string;
  onChange: (color: string, live: boolean) => void;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    // React's onChange fires on every 'input'; the native 'change' fires once the picker closes.
    const done = () => {
      if (!editing.current) return;
      editing.current = false;
      useDesign.getState().endGesture();
    };
    el.addEventListener('change', done);
    el.addEventListener('blur', done);
    return () => {
      el.removeEventListener('change', done);
      el.removeEventListener('blur', done);
    };
  }, []);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="color-row">
        <input
          ref={input}
          type="color"
          value={value}
          data-testid={testId}
          onChange={(e) => {
            if (!editing.current) {
              editing.current = true;
              useDesign.getState().beginGesture();
            }
            onChange(e.target.value, true);
          }}
        />
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={c.toLowerCase() === value.toLowerCase() ? 'on' : ''}
              style={{ background: c }}
              title={c}
              aria-label={`Colour ${c}`}
              onClick={() => onChange(c, false)}
            />
          ))}
        </div>
      </div>
      {defaultColor && defaultColor.toLowerCase() !== value.toLowerCase() && (
        <button className="link reset-color" onClick={() => onChange(defaultColor, false)}>
          Reset to default colour
        </button>
      )}
    </div>
  );
}

function AngleField({ deg, onChange }: { deg: number; onChange: (deg: number) => void }) {
  const [text, setText] = useState(String(deg));
  useEffect(() => setText(String(deg)), [deg]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v !== deg) onChange(v);
    else setText(String(deg));
  };
  return (
    <label className="field">
      <span>Rotation</span>
      <div className="input-unit">
        <input value={text} inputMode="decimal" onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <em>°</em>
      </div>
    </label>
  );
}

const WALL_NAMES: Record<Wall, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };

function ExteriorProps() {
  const design = useDesign((s) => s.design);
  const updateExterior = useDesign((s) => s.updateExterior);
  const updateRoom = useDesign((s) => s.updateRoom);
  const { exterior: ext, room } = design;
  const outside = { w: room.width + 2 * room.wallThickness, d: room.depth + 2 * room.wallThickness };
  const along = ext.front === 'top' || ext.front === 'bottom' ? outside.w : outside.d;
  const deep = ext.front === 'top' || ext.front === 'bottom' ? outside.d : outside.w;
  const target = mod10RoomSize(room, ext.front);
  const matches = target.width === room.width && target.depth === room.depth && target.height === room.height;
  return (
    <>
      <h3>Exterior</h3>
      <label className="field">
        <span>Design</span>
        <select
          data-testid="exterior-style"
          value={ext.style}
          onChange={(e) => {
            const style = e.target.value as Exterior['style'];
            // Face the front (deck, tall side, highlights) towards the first door, if there is one.
            const door = design.openings.find((o) => isDoor(o.kind));
            updateExterior({ style, ...(style !== 'none' && ext.style === 'none' && door ? { front: door.wall } : {}) });
          }}
        >
          {EXTERIOR_STYLES.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
      </label>
      {ext.style === 'mod10' && (
        <>
          <label className="field">
            <span>Front (deck side)</span>
            <select data-testid="exterior-front" value={ext.front} onChange={(e) => updateExterior({ front: e.target.value as Wall })}>
              {(['top', 'right', 'bottom', 'left'] as Wall[]).map((w) => (
                <option key={w} value={w}>{WALL_NAMES[w]} wall</option>
              ))}
            </select>
          </label>
          <p className="hint">
            Mod 10 with the upgraded ceiling: {mmToCm(MOD10.width)} × {mmToCm(MOD10.depth)} cm outside, {mmToCm(MOD10.ceiling)} cm ceiling, plus
            a {mmToCm(MOD10.deck)} cm deck. Yours: {mmToCm(along)} × {mmToCm(deep)} cm outside, {mmToCm(room.height)} cm ceiling.{' '}
            {!matches && (
              <button className="link" data-testid="match-mod10" onClick={() => updateRoom(target)}>
                Match Mod 10 size
              </button>
            )}
          </p>
          <ColorField
            label="Cladding colour"
            value={ext.claddingColor}
            defaultColor={DEFAULT_EXTERIOR.claddingColor}
            onChange={(claddingColor, live) => updateExterior({ claddingColor }, live)}
            testId="cladding-color"
          />
          <div className="field">
            <span>Colorbond® roof</span>
            <div className="btn-row wrap roof-colours">
              {ROOF_COLOURS.map((r) => (
                <button key={r.name} className={r.color === ext.roofColor ? 'active' : ''} onClick={() => updateExterior({ roofColor: r.color })}>
                  <i style={{ background: r.color }} />
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function RoomProps() {
  const design = useDesign((s) => s.design);
  const updateRoom = useDesign((s) => s.updateRoom);
  const { room } = design;
  return (
    <>
      <h2>Room</h2>
      <div className="grid2">
        <LengthField label="Width" mm={room.width} onChange={(width) => updateRoom({ width })} testId="room-width" />
        <LengthField label="Depth" mm={room.depth} onChange={(depth) => updateRoom({ depth })} testId="room-depth" />
      </div>
      <div className="grid2">
        <LengthField label="Ceiling height" mm={room.height} onChange={(height) => updateRoom({ height })} testId="room-height" />
        <LengthField label="Wall thickness" mm={room.wallThickness} onChange={(wallThickness) => updateRoom({ wallThickness })} />
      </div>
      <div className="grid2">
        <ColorField label="Wall colour" value={room.wallColor} defaultColor={ROOM_COLORS.wall} onChange={(wallColor, live) => updateRoom({ wallColor }, live)} testId="wall-color" />
        <ColorField label="Floor colour" value={room.floorColor} defaultColor={ROOM_COLORS.floor} onChange={(floorColor, live) => updateRoom({ floorColor }, live)} testId="floor-color" />
      </div>
      <p className="muted">
        Floor area <strong>{formatArea(room.width * room.depth)}</strong>
      </p>
      <p className="hint">
        Drag the blue handles on the right and bottom walls to resize. Drag furniture, doors and windows in from the left.
      </p>
      <ExteriorProps />
      <h3>Shortcuts</h3>
      <dl className="shortcuts">
        <dt>Del</dt><dd>Delete selection</dd>
        <dt>R / Shift+R</dt><dd>Rotate 90° / −90°</dd>
        <dt>Ctrl+D</dt><dd>Duplicate</dd>
        <dt>Ctrl+C / V</dt><dd>Copy / paste</dd>
        <dt>Ctrl+Z / Y</dt><dd>Undo / redo</dd>
        <dt>Arrows</dt><dd>Nudge 1 cm (Shift: 10 cm)</dd>
        <dt>Alt+drag</dt><dd>Move without snapping</dd>
        <dt>Space+drag</dt><dd>Pan (or middle mouse)</dd>
        <dt>Wheel</dt><dd>Zoom</dd>
        <dt>Dbl-click door</dt><dd>Flip swing / hinge</dd>
        <dt>Dbl-click sofa bed</dt><dd>Fold / unfold</dd>
      </dl>
    </>
  );
}

function ItemProps({ it }: { it: FurnitureItem }) {
  const s = useDesign();
  const entry = CATALOG_BY_TYPE[it.type];
  const issues = findIssues(s.design).get(it.id);
  const patch = (p: Partial<FurnitureItem>) => s.updateItems({ [it.id]: p });
  return (
    <>
      <h2>{entry?.name ?? it.type}</h2>
      <TextField label="Label" value={it.label ?? ''} placeholder="Shown on the plan" onChange={(label) => patch({ label })} />
      <div className="grid2">
        <LengthField label="Width" mm={it.width} onChange={(width) => patch({ width })} testId="item-width" />
        <LengthField label="Depth" mm={it.depth} onChange={(depth) => patch({ depth })} testId="item-depth" />
        <LengthField label="Height" mm={it.height} onChange={(height) => patch({ height })} testId="item-height" />
        <LengthField label="Mounted at" mm={it.elevation} onChange={(elevation) => patch({ elevation })} testId="item-elevation" />
        <LengthField label="X (centre)" mm={it.x} onChange={(x) => patch({ x })} />
        <LengthField label="Y (centre)" mm={it.y} onChange={(y) => patch({ y })} />
      </div>
      <div className="grid2 align-end">
        <AngleField deg={it.rotation} onChange={(rotation) => patch({ rotation })} />
        <div className="btn-row">
          <button onClick={() => patch({ rotation: it.rotation - 90 })} title="Rotate −90°">⟲</button>
          <button onClick={() => patch({ rotation: it.rotation + 90 })} title="Rotate 90°">⟳</button>
        </div>
      </div>
      {it.expandedLength !== undefined && (
        <div className="grid2 align-end">
          <LengthField label="Expanded length" mm={it.expandedLength} onChange={(expandedLength) => patch({ expandedLength })} testId="item-expanded-length" />
          <div className="btn-row">
            <button className={it.expanded ? 'active' : ''} onClick={() => s.toggleExpanded(it.id)} data-testid="toggle-expanded">
              {it.expanded ? 'Fold sofa' : 'Unfold bed'}
            </button>
          </div>
        </div>
      )}
      <ColorField label="Colour" value={it.color} defaultColor={entry?.color} onChange={(color, live) => s.updateItems({ [it.id]: { color } }, live)} testId="item-color" />
      {entry && (
        <p className="hint">
          Size range {mmToCm(entry.min[0])}–{mmToCm(entry.max[0])} × {mmToCm(entry.min[1])}–{mmToCm(entry.max[1])} ×{' '}
          {mmToCm(entry.min[2])}–{mmToCm(entry.max[2])} cm.{' '}
          <button className="link" onClick={() => patch({ width: entry.width, depth: entry.depth, height: entry.height })}>Reset size</button>
        </p>
      )}
      {issues && (
        <ul className="issues">
          {[...issues].map((i) => (
            <li key={i}>{ISSUE_TEXT[i]}</li>
          ))}
        </ul>
      )}
      <label className="check">
        <input type="checkbox" checked={!!it.locked} onChange={(e) => patch({ locked: e.target.checked })} /> Lock position
      </label>
      <div className="btn-row wrap">
        <button onClick={s.duplicateSelection}>Duplicate</button>
        <button onClick={() => s.reorderSelection('front')}>To front</button>
        <button onClick={() => s.reorderSelection('back')}>To back</button>
        <button className="danger" onClick={s.deleteSelection} disabled={it.locked}>Delete</button>
      </div>
    </>
  );
}

const WALLS: Wall[] = ['top', 'right', 'bottom', 'left'];

function OpeningProps({ o }: { o: Opening }) {
  const s = useDesign();
  const room = s.design.room;
  const patch = (p: Partial<Opening>) => s.updateOpening(o.id, p);
  const hinged = o.kind === 'door' || o.kind === 'double-door';
  return (
    <>
      <h2>{OPENINGS.find((x) => x.kind === o.kind)?.name}</h2>
      <label className="field">
        <span>Type</span>
        <select
          value={o.kind}
          onChange={(e) => {
            // Switching between doors and windows also swaps in that kind's usual height and sill.
            const kind = e.target.value as Opening['kind'];
            const { height, sill, color } = OPENING_BY_KIND[kind];
            const customColour = o.color !== OPENING_BY_KIND[o.kind].color;
            patch({ kind, height, sill, ...(customColour ? {} : { color }), material: isDoor(kind) ? (o.material ?? 'wood') : undefined });
          }}
        >
          {OPENINGS.map((x) => (
            <option key={x.kind} value={x.kind}>{x.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Wall</span>
        <select value={o.wall} onChange={(e) => patch({ wall: e.target.value as Wall })}>
          {WALLS.map((w) => (
            <option key={w} value={w}>{w[0].toUpperCase() + w.slice(1)}</option>
          ))}
        </select>
      </label>
      {isDoor(o.kind) && (
        <label className="field">
          <span>Material</span>
          <select
            data-testid="door-material"
            value={o.material ?? 'wood'}
            onChange={(e) => {
              const material = e.target.value as DoorMaterial;
              // Swap in the new material's usual colour unless the user picked their own.
              const prevDefault = DOOR_MATERIALS.find((m) => m.id === (o.material ?? 'wood'))?.color;
              const nextDefault = DOOR_MATERIALS.find((m) => m.id === material)!.color;
              patch({ material, ...(o.color === prevDefault ? { color: nextDefault } : {}) });
            }}
          >
            {DOOR_MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid2">
        <LengthField label="Width" mm={o.width} onChange={(width) => patch({ width })} testId="opening-width" />
        <LengthField label={o.wall === 'top' || o.wall === 'bottom' ? 'From left' : 'From top'} mm={o.offset} onChange={(offset) => patch({ offset })} />
        <LengthField label="Height" mm={o.height} onChange={(height) => patch({ height })} testId="opening-height" />
        {o.kind === 'window' ? (
          <LengthField label="Sill height" mm={o.sill} onChange={(sill) => patch({ sill })} testId="opening-sill" />
        ) : (
          <div />
        )}
      </div>
      {o.kind !== 'opening' && (
        <ColorField
          label={o.kind === 'window' ? 'Frame colour' : o.material === 'glass' ? 'Fittings colour' : o.material?.endsWith('glass') ? 'Frame colour' : 'Door colour'}
          value={o.color}
          defaultColor={isDoor(o.kind) ? DOOR_MATERIALS.find((m) => m.id === (o.material ?? 'wood'))!.color : OPENING_BY_KIND[o.kind].color}
          onChange={(color, live) => s.updateOpening(o.id, { color }, live)}
          testId="opening-color"
        />
      )}
      <p className="hint">Wall length {mmToCm(wallLength(room, o.wall))} cm. Drag along the wall to move; drag to another wall to re-hang.</p>
      {hinged && (
        <div className="grid2">
          {o.kind === 'door' && (
            <label className="field">
              <span>Hinge</span>
              <select value={o.hinge} onChange={(e) => patch({ hinge: e.target.value as Opening['hinge'] })}>
                <option value="start">{o.wall === 'top' || o.wall === 'bottom' ? 'Left' : 'Top'}</option>
                <option value="end">{o.wall === 'top' || o.wall === 'bottom' ? 'Right' : 'Bottom'}</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Opens</span>
            <select value={o.swing} onChange={(e) => patch({ swing: e.target.value as Opening['swing'] })}>
              <option value="in">Inwards</option>
              <option value="out">Outwards</option>
            </select>
          </label>
        </div>
      )}
      <div className="btn-row wrap">
        <button onClick={s.duplicateSelection}>Duplicate</button>
        <button className="danger" onClick={s.deleteSelection}>Delete</button>
      </div>
    </>
  );
}

function MultiProps({ items }: { items: FurnitureItem[] }) {
  const s = useDesign();
  const same = items.every((it) => it.color === items[0].color);
  return (
    <>
      <h2>{items.length} items selected</h2>
      <ColorField
        label={same ? 'Colour' : 'Colour (mixed)'}
        value={items[0].color}
        onChange={(color, live) => s.updateItems(Object.fromEntries(items.map((it) => [it.id, { color }])), live)}
      />
      <div className="btn-row wrap">
        <button onClick={() => s.rotateSelection(90)}>Rotate 90°</button>
        <button onClick={s.duplicateSelection}>Duplicate</button>
        <button className="danger" onClick={s.deleteSelection}>Delete</button>
      </div>
      <p className="hint">Drag any selected item to move the group. Shift-click to add or remove items.</p>
    </>
  );
}

export function PropertiesPanel() {
  const selection = useDesign((s) => s.selection);
  const design = useDesign((s) => s.design);
  let body = <RoomProps />;
  if (selection?.kind === 'opening') {
    const o = design.openings.find((x) => x.id === selection.id);
    if (o) body = <OpeningProps o={o} />;
  } else if (selection?.kind === 'items') {
    const sel = design.items.filter((it) => selection.ids.includes(it.id));
    if (sel.length === 1) body = <ItemProps it={sel[0]} />;
    else if (sel.length > 1) body = <MultiProps items={sel} />;
  }
  return <aside className="panel props" data-testid="properties">{body}</aside>;
}
