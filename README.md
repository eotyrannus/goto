# Pod Planner

A local, drag-and-drop floor-plan editor for office pods and rectangular rooms. Everything runs in the browser and designs are saved to `localStorage`. There's no backend.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Or build it once and serve the static files: `npm run build && npm run preview`.

Designs are saved in the browser *for this exact address*, so always open http://localhost:5173. Another port or `127.0.0.1` starts with an empty design list. The dev server refuses to start if 5173 is busy (usually an old copy still running in another terminal); stop that copy with Ctrl+C rather than using a different port. To move designs between browsers or computers, use Export → Design file (.json) and Import.

## What it does

- **Room:** set the width, depth, ceiling height and wall thickness in cm, or drag the blue handles on the right and bottom walls.
- **Heights:** every furniture item has a height and a "mounted at" height (e.g. a TV hangs at 100 cm). Defaults come from the catalog. Doors and windows have a height, and windows also have a sill height. Older saved designs get default heights when opened.
- **Doors and windows:** door, double door, sliding door, window and plain opening. Drag them along a wall or onto another wall. Set the width, hinge side and swing in the side panel, or double-click a door to cycle through hinge/swing options.
- **Furniture:** 25 plan symbols across six groups (work, meeting, lounge, storage, fixtures, decor). Drag one from the catalog or click to drop it in the middle of the room.
  - Moving snaps to walls, other items' edges and centres, and the grid. Hold Alt to place freely.
  - Resize and rotate with the handles (rotation snaps to 45°), or type exact values. Each item type has its own size limits.
- **Exterior:** Room panel → Exterior → *Melwood Mod 10* wraps the room in that building, modelled from the Melwood 2026 catalogue: skillion roof (high at the front), highlight windows across the top of the front, board-and-batten cladding, Colorbond® roof in the four stock colours, gutter and downpipe, raised pier floor and a full-width 1.3 m deck.
  - It follows your room's size. *Match Mod 10 size* sets the room to the catalogue footprint (3.6 × 2.6 m outside) with the upgraded ceiling, which this app assumes for a habitable room. The catalogue drawings show the standard ceiling (2.8 m overall), so this model is taller.
  - Inside there's a raked ceiling following the roof: the room's ceiling height at the back, rising 40 cm to the front. The walls rise to meet it, and the highlight windows are cut through the front wall, so you see them from inside in walk mode.
  - Choose which wall is the front (the deck side); it defaults to the wall with your door. Your doors and windows cut through the cladding with white trims.
  - In 3D, *Outside view* shows the whole building; *Inside view* lifts the roof and cuts the near walls. The plan shows the deck and the roof overhang.
- **Colours:** every item, door and window has a colour, and the room has wall and floor colours. Use the picker or swatches in the side panel, or *Reset to default colour*. Selecting several items recolours them together. Colours show fully in 3D and as soft tints on the plan (View → Colours on plan).
- **Planning aids:** distances from the selected item to each wall, and red highlights for items that overlap, stick out of the room, block a door swing or are taller than the ceiling.
- **Editing:** multi-select (Shift-click or drag a box), duplicate, copy/paste, lock, front/back ordering, and undo/redo for every change.
- **Saving:** autosaves as you work. *Designs* lists saved plans with thumbnails and offers starter templates (Focus pod, Duo pod, Meeting pod, Lounge).
- **3D view:** switch between *Plan* and *3D* in the toolbar. The 3D view updates live as you edit and only loads the first time you open it.
  - Orbit, pan and zoom. Walls between you and the room drop to low stubs so you can see in. *Fit* and *Top* reset the camera.
  - Click to select, then edit in the side panel. Drag catalog items onto the 3D floor to add them.
  - Click a door to open or close it (sliding doors slide). This works in walk mode too. Door state is a viewing aid and isn't saved with the design.
  - Doors have a material: wood, glass, wood with a glass centre, or aluminium with a glass centre (side panel → Material). Glass doors show a blue leaf on the plan.
  - Sofa beds unfold to their *Expanded length*: use the button in the side panel, double-click on the plan or in 3D, or click while walking. The unfolded state is saved, and clash warnings and wall distances use the open bed's footprint.
  - *Walk* puts you inside at eye height: drag to look, W A S D or the arrow keys to move, Shift to go faster, Esc to stop. Walk out through any open doorway and around the outside (up to 5 m from the building). Walls, window sills, shut doors and furniture block you, and you step down onto the deck and lawn when there's an exterior.
- **Export:** PNG or JPEG of the plan with a title block and scale bar. From the 3D view: a PNG of the current view, or a `.glb` 3D model for other 3D apps. Also `.pod.json` design files for backup or sharing (Export → Import design file).

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
                clash detection, templates, 3D wall/furniture geometry. Pure TS, unit-tested.
src/store/      zustand store with undo/redo history; localStorage persistence
src/canvas/     Konva stage: walls, openings, dimensions, grid, item symbols, transformer, gestures
src/panels/     toolbar, catalog, properties panel, designs dialog
src/export/     off-screen PNG/JPEG render with title block; JSON export
src/view3d/     3D view (react-three-fiber): room, openings, furniture, orbit/walk cameras, export
e2e/            Playwright tests that drive the real UI with the mouse
```

All geometry is in millimetres with the origin at the room's inner top-left corner. The UI shows cm and m.

To add a furniture type, add an entry to `CATALOG` in `src/model/catalog.ts`, a plan symbol in `src/canvas/symbols/Symbols.tsx` and a 3D builder in `src/model/furniture3d.ts`. Symbols are drawn centred on the origin with their back along −y, i.e. against a top wall at rotation 0.

## Tests

```bash
npm test             # unit tests (vitest)
npm run test:e2e     # browser tests (playwright, starts its own dev server)
npm run typecheck
```
