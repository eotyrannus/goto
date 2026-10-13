# Pod Planner

A local, drag-and-drop floor-plan editor for office pods and rectangular rooms. Everything runs in the browser and designs are saved to `localStorage`. There's no backend.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Or build it once and serve the static files: `npm run build && npm run preview`.

## What it does

- **Room:** set the width, depth, ceiling height and wall thickness in cm, or drag the blue handles on the right and bottom walls.
- **Heights:** every furniture item has a height (defaults come from the catalog). Doors and windows have a height, and windows also have a sill height. Older saved designs get default heights when opened.
- **Doors and windows:** door, double door, sliding door, window and plain opening. Drag them along a wall or onto another wall. Set the width, hinge side and swing in the side panel, or double-click a door to cycle through hinge/swing options.
- **Furniture:** 25 plan symbols across six groups (work, meeting, lounge, storage, fixtures, decor). Drag one from the catalog or click to drop it in the middle of the room.
  - Moving snaps to walls, other items' edges and centres, and the grid. Hold Alt to place freely.
  - Resize and rotate with the handles (rotation snaps to 45°), or type exact values. Each item type has its own size limits.
- **Planning aids:** distances from the selected item to each wall, and red highlights for items that overlap, stick out of the room, block a door swing or are taller than the ceiling.
- **Editing:** multi-select (Shift-click or drag a box), duplicate, copy/paste, lock, front/back ordering, and undo/redo for every change.
- **Saving:** autosaves as you work. *Designs* lists saved plans with thumbnails and offers starter templates (Focus pod, Duo pod, Meeting pod, Lounge).
- **Export:** PNG or JPEG with a title block and scale bar, plus `.pod.json` design files for backup or sharing (Export → Import design file).

### Shortcuts

| Key | Action |
|---|---|
| Del / Backspace | Delete selection |
| R / Shift+R | Rotate 90° / −90° |
| Ctrl+D | Duplicate |
| Ctrl+C / Ctrl+V | Copy / paste |
| Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) | Undo / redo |
| Arrows (Shift) | Nudge 1 cm (10 cm) |
| Space+drag, middle-drag | Pan |
| Wheel | Zoom |
| Ctrl+0 | Fit room to view |

## Code map

```
src/model/      types, furniture catalog, geometry (snapping, wall frames, door swings, SAT overlap),
                clash detection, templates, unit formatting. Pure TS, unit-tested.
src/store/      zustand store with undo/redo history; localStorage persistence
src/canvas/     Konva stage: walls, openings, dimensions, grid, item symbols, transformer, gestures
src/panels/     toolbar, catalog, properties panel, designs dialog
src/export/     off-screen PNG/JPEG render with title block; JSON export
e2e/            Playwright tests that drive the real UI with the mouse
```

All geometry is in millimetres with the origin at the room's inner top-left corner. The UI shows cm and m.

To add a furniture type, add an entry to `CATALOG` in `src/model/catalog.ts` and a symbol in `src/canvas/symbols/Symbols.tsx`. Symbols are drawn centred on the origin with their back along −y, i.e. against a top wall at rotation 0.

## Tests

```bash
npm test             # unit tests (vitest)
npm run test:e2e     # browser tests (playwright, starts its own dev server)
npm run typecheck
```
