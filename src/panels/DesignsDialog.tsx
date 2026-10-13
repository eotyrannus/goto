import { useEffect, useState } from 'react';
import { templates } from '../model/templates';
import { uid } from '../model/units';
import { useDesign } from '../store/designStore';
import { deleteDesign, listDesigns, loadDesign, saveDesign, type DesignMeta } from '../store/persistence';

export function DesignsDialog({ onClose }: { onClose: () => void }) {
  const current = useDesign((s) => s.design);
  const load = useDesign((s) => s.loadDesign);
  const [list, setList] = useState<DesignMeta[]>(() => listDesigns());
  const refresh = () => setList(listDesigns());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = (id: string) => {
    const d = loadDesign(id);
    if (d) load(d);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Designs">
        <header>
          <h2>Designs</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <h3>Start a new design</h3>
        <div className="templates">
          {templates.map((t) => (
            <button
              key={t.name}
              className="template"
              data-testid={`template-${t.name}`}
              onClick={() => {
                load(t.build());
                onClose();
              }}
            >
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
        <h3>Saved in this browser</h3>
        {list.length === 0 && <p className="muted">Nothing saved yet — designs save automatically as you work.</p>}
        <ul className="design-list">
          {list.map((m) => (
            <li key={m.id} className={m.id === current.id ? 'current' : ''}>
              <button className="thumb" onClick={() => open(m.id)} title="Open">
                {m.thumbnail ? <img src={m.thumbnail} alt="" /> : <span className="muted">No preview</span>}
              </button>
              <div className="meta">
                <strong>{m.name}</strong>
                <span className="muted">{new Date(m.updatedAt).toLocaleString()}</span>
              </div>
              <div className="btn-row">
                <button onClick={() => open(m.id)}>Open</button>
                <button
                  onClick={() => {
                    const d = loadDesign(m.id);
                    if (!d) return;
                    saveDesign({ ...d, id: uid(), name: `${d.name} (copy)`, updatedAt: Date.now() }, m.thumbnail);
                    refresh();
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="danger"
                  disabled={m.id === current.id}
                  title={m.id === current.id ? 'This design is open' : 'Delete'}
                  onClick={() => {
                    if (confirm(`Delete "${m.name}"? This can't be undone.`)) {
                      deleteDesign(m.id);
                      refresh();
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
