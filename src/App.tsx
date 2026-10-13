import { lazy, Suspense, useEffect, useState } from 'react';
import { canvasApi, PlanCanvas } from './canvas/PlanCanvas';
import { thumbnail } from './export/exportImage';
import { CatalogPanel } from './panels/CatalogPanel';
import { DesignsDialog } from './panels/DesignsDialog';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { Toolbar, type ViewMode } from './panels/Toolbar';

import { useDesign } from './store/designStore';
import { lastDesignId, loadDesign, saveDesign } from './store/persistence';

// three.js is large; load it only when the 3D view is first opened.
const Scene3D = lazy(() => import('./view3d/Scene3D'));

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, .modal')) return;
      if (document.body.dataset.walking) return; // walk mode owns the keyboard
      const s = useDesign.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      let handled = true;
      if (mod && key === 'z') (e.shiftKey ? s.redo : s.undo)();
      else if (mod && key === 'y') s.redo();
      else if (mod && key === 'd') s.duplicateSelection();
      else if (mod && key === 'c') s.copySelection();
      else if (mod && key === 'v') s.paste();
      else if (mod && key === 'a') s.selectAll();
      else if (key === 'delete' || key === 'backspace') s.deleteSelection();
      else if (key === 'escape') s.setSelection(null);
      else if (key === 'r' && !mod) s.rotateSelection(e.shiftKey ? -90 : 90);
      else if (key.startsWith('arrow')) {
        const step = e.shiftKey ? 100 : 10;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        s.nudgeSelection(dx, dy);
      } else if (key === '0' && mod) canvasApi.fit();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Restore the last design on start-up, then save on every change. */
function useAutosave() {
  const [state, setState] = useState('');
  useEffect(() => {
    const id = lastDesignId();
    const saved = id ? loadDesign(id) : null;
    if (saved) useDesign.getState().loadDesign(saved);
    else saveDesign(useDesign.getState().design);

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let thumbTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useDesign.subscribe((s, prev) => {
      if (s.design === prev.design || s.gestureStart) return;
      setState('Saving…');
      clearTimeout(saveTimer);
      clearTimeout(thumbTimer);
      saveTimer = setTimeout(() => {
        const ok = saveDesign(useDesign.getState().design);
        setState(ok ? 'Saved' : 'Not saved — browser storage is full or blocked');
      }, 300);
      thumbTimer = setTimeout(() => {
        const d = useDesign.getState().design;
        if (canvasApi.stage) saveDesign(d, thumbnail(canvasApi.stage, d));
      }, 1500);
    });
    return () => {
      unsub();
      clearTimeout(saveTimer);
      clearTimeout(thumbTimer);
    };
  }, []);
  return state;
}

export default function App() {
  const [showDesigns, setShowDesigns] = useState(false);
  const [view, setView] = useState<ViewMode>('2d');
  const saveState = useAutosave();
  useKeyboardShortcuts();
  return (
    <div className="app">
      <Toolbar onOpenDesigns={() => setShowDesigns(true)} saveState={saveState} view={view} onView={setView} />
      <div className="workspace">
        <CatalogPanel />
        <div className="view-stack">
          {/* The plan stays mounted under the 3D view so thumbnails and image export keep working. */}
          <PlanCanvas />
          {view === '3d' && (
            <Suspense fallback={<div className="scene3d loading">Loading 3D…</div>}>
              <Scene3D />
            </Suspense>
          )}
        </div>
        <PropertiesPanel />
      </div>
      {showDesigns && <DesignsDialog onClose={() => setShowDesigns(false)} />}
    </div>
  );
}
