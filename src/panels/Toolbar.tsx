import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canvasApi } from '../canvas/PlanCanvas';
import { download, exportImage, exportJson, slug } from '../export/exportImage';
import type { Settings } from '../model/types';
import { uid } from '../model/units';
import { useDesign } from '../store/designStore';
import { isDesign } from '../store/persistence';
import { scene3dApi } from '../view3d/api';

export type ViewMode = '2d' | '3d';

function Menu({ label, children, testId }: { label: ReactNode; children: (close: () => void) => ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button data-testid={testId} className={open ? 'active' : ''} onClick={() => setOpen(!open)}>
        {label} ▾
      </button>
      {open && <div className="menu-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: 'showGrid', label: 'Grid' },
  { key: 'snap', label: 'Snap' },
  { key: 'showNames', label: 'Names' },
  { key: 'showClearances', label: 'Clearances' },
  { key: 'showClashes', label: 'Clash warnings' },
  { key: 'colorPlan', label: 'Colours on plan' },
];

export function Toolbar({
  onOpenDesigns,
  saveState,
  view,
  onView,
}: {
  onOpenDesigns: () => void;
  saveState: string;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  const s = useDesign();
  const [name, setName] = useState(s.design.name);
  useEffect(() => setName(s.design.name), [s.design.name]);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async (format: 'png' | 'jpeg') => {
    // Selection handles live on the UI layer, which the exporter leaves out.
    if (canvasApi.stage) await exportImage(canvasApi.stage, s.design, format);
  };

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!isDesign(data)) throw new Error('not a design');
      // Fresh id so an import never silently overwrites an existing saved design.
      s.loadDesign({ ...data, id: uid(), updatedAt: Date.now() });
    } catch {
      alert('That file is not a Pod Planner design (.pod.json).');
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M2 14h5M12 2v6M16 22v-5a5 5 0 0 1 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Pod Planner
      </div>
      <button onClick={onOpenDesigns} data-testid="designs-button">Designs</button>
      <input
        className="name"
        aria-label="Design name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== s.design.name ? s.rename(name.trim()) : setName(s.design.name)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="save-state">{saveState}</span>
      <div className="spacer" />
      <div className="segmented" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === '2d'} className={view === '2d' ? 'on' : ''} onClick={() => onView('2d')} data-testid="view-2d">
          Plan
        </button>
        <button role="tab" aria-selected={view === '3d'} className={view === '3d' ? 'on' : ''} onClick={() => onView('3d')} data-testid="view-3d">
          3D
        </button>
      </div>
      <div className="spacer" />
      <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
      <Menu label="View">
        {() =>
          TOGGLES.map((t) => (
            <label key={t.key} className="check">
              <input type="checkbox" checked={!!s.settings[t.key]} onChange={(e) => s.setSettings({ [t.key]: e.target.checked })} /> {t.label}
            </label>
          )).concat(
            <label key="grid" className="field inline">
              <span>Grid</span>
              <select value={s.settings.gridSize} onChange={(e) => s.setSettings({ gridSize: Number(e.target.value) })}>
                {[50, 100, 250, 500].map((g) => (
                  <option key={g} value={g}>{g / 10} cm</option>
                ))}
              </select>
            </label>,
          )
        }
      </Menu>
      <Menu label="Export" testId="export-menu">
        {(close) => (
          <>
            <button data-testid="export-png" onClick={() => { close(); doExport('png'); }}>PNG image</button>
            <button data-testid="export-jpeg" onClick={() => { close(); doExport('jpeg'); }}>JPEG image</button>
            <button
              data-testid="export-3d-png"
              disabled={view !== '3d'}
              title={view !== '3d' ? 'Switch to the 3D view first' : undefined}
              onClick={() => {
                close();
                const url = scene3dApi.png();
                if (url) download(url, `${slug(s.design.name)}-3d.png`);
              }}
            >
              3D view image (PNG)
            </button>
            <button
              data-testid="export-glb"
              disabled={view !== '3d'}
              title={view !== '3d' ? 'Switch to the 3D view first' : undefined}
              onClick={async () => {
                close();
                const buf = await scene3dApi.glb();
                if (!buf) return;
                const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
                download(url, `${slug(s.design.name)}.glb`);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              3D model (.glb)
            </button>
            <hr />
            <button onClick={() => { close(); exportJson(s.design); }}>Design file (.json)</button>
            <hr />
            <button onClick={() => { close(); fileRef.current?.click(); }}>Import design file…</button>
          </>
        )}
      </Menu>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = '';
        }}
      />
    </header>
  );
}
