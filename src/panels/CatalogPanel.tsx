import { useState, type ReactElement } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import { DND_MIME } from '../canvas/PlanCanvas';
import { OpeningSymbol, WALL_FILL } from '../canvas/RoomShapes';
import { FurnitureSymbol } from '../canvas/symbols/Symbols';
import { CATALOG, CATEGORIES, OPENINGS, type CatalogEntry, type OpeningEntry } from '../model/catalog';
import { useDesign } from '../store/designStore';

const PW = 64;
const PH = 46;

function ItemPreview({ entry }: { entry: CatalogEntry }) {
  const s = Math.min((PW - 8) / entry.width, (PH - 8) / entry.depth);
  return (
    <Stage width={PW} height={PH} listening={false}>
      <Layer>
        <Group x={PW / 2} y={PH / 2} scaleX={s} scaleY={s}>
          <FurnitureSymbol type={entry.type} w={entry.width} d={entry.depth} color={entry.color} />
        </Group>
      </Layer>
    </Stage>
  );
}

function OpeningPreview({ entry }: { entry: OpeningEntry }) {
  const t = 100;
  const total = entry.width + 600;
  const s = Math.min((PW - 6) / total, (PH - 10) / (entry.width * 0.55 + t + 200));
  const o = { id: 'p', kind: entry.kind, wall: 'top' as const, offset: 300, width: entry.width, height: entry.height, sill: entry.sill, color: entry.color, hinge: 'start' as const, swing: 'in' as const };
  return (
    <Stage width={PW} height={PH} listening={false}>
      <Layer>
        <Group x={3} y={10} scaleX={s} scaleY={s}>
          <Rect x={0} y={0} width={300} height={t} fill={WALL_FILL} />
          <Rect x={300 + entry.width} y={0} width={300} height={t} fill={WALL_FILL} />
          <Group x={300} y={t}>
            <OpeningSymbol o={o} t={t} />
          </Group>
        </Group>
      </Layer>
    </Stage>
  );
}

export function CatalogPanel() {
  const addItem = useDesign((s) => s.addItem);
  const addOpening = useDesign((s) => s.addOpening);
  const [q, setQ] = useState('');
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());

  const tile = (key: string, name: string, payload: string, onAdd: () => void, preview: ReactElement) => (
    <button
      key={key}
      className="tile"
      draggable
      title={`${name} — drag onto the plan or click to add`}
      data-testid={`catalog-${payload}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, payload);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onAdd}
    >
      {preview}
      <span>{name}</span>
    </button>
  );

  const openings = OPENINGS.filter((o) => match(o.name));
  return (
    <aside className="panel catalog">
      <input className="search" placeholder="Search furniture…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="catalog-scroll">
        {openings.length > 0 && (
          <section>
            <h3>Doors & windows</h3>
            <div className="tiles">
              {openings.map((o) => tile(o.kind, o.name, `opening:${o.kind}`, () => addOpening(o.kind), <OpeningPreview entry={o} />))}
            </div>
          </section>
        )}
        {CATEGORIES.map((cat) => {
          const entries = CATALOG.filter((c) => c.category === cat && match(c.name));
          if (!entries.length) return null;
          return (
            <section key={cat}>
              <h3>{cat}</h3>
              <div className="tiles">
                {entries.map((c) => tile(c.type, c.name, `item:${c.type}`, () => addItem(c.type), <ItemPreview entry={c} />))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
