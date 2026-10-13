import { beforeEach, describe, expect, it } from 'vitest';
import { newDesign } from '../model/templates';
import { useDesign } from './designStore';

const s = () => useDesign.getState();

describe('design store', () => {
  beforeEach(() => s().loadDesign(newDesign('test', 3000, 2000)));

  it('adds, edits, undoes and redoes items', () => {
    s().addItem('desk', { x: 1000, y: 1000 });
    const id = s().design.items[0].id;
    expect(s().selection).toEqual({ kind: 'items', ids: [id] });
    s().updateItems({ [id]: { width: 1600 } });
    expect(s().design.items[0].width).toBe(1600);
    s().undo();
    expect(s().design.items[0].width).toBe(1400);
    s().undo();
    expect(s().design.items).toHaveLength(0);
    s().redo();
    s().redo();
    expect(s().design.items[0].width).toBe(1600);
  });

  it('clamps item sizes to the catalog limits', () => {
    s().addItem('office-chair');
    const id = s().design.items[0].id;
    s().updateItems({ [id]: { width: 50, depth: 5000 } });
    expect(s().design.items[0]).toMatchObject({ width: 400, depth: 900 });
  });

  it('keeps newly added items inside the room', () => {
    s().addItem('sofa', { x: 2950, y: 1950 });
    const it = s().design.items[0];
    expect(it.x + it.width / 2).toBeLessThanOrEqual(3000);
    expect(it.y + it.depth / 2).toBeLessThanOrEqual(2000);
  });

  it('records a live gesture as one undo step', () => {
    s().addOpening('door', { x: 1500, y: 0 });
    const id = s().design.openings[0].id;
    const before = s().past.length;
    s().beginGesture();
    for (const offset of [100, 200, 300]) s().updateOpening(id, { offset }, true);
    s().endGesture();
    expect(s().past.length).toBe(before + 1);
    expect(s().design.openings[0].offset).toBe(300);
    s().undo();
    expect(s().design.openings[0].offset).toBe(1050);
  });

  it('re-clamps openings when the room shrinks', () => {
    s().addOpening('window', { x: 2800, y: 0 });
    s().updateRoom({ width: 1500 });
    const o = s().design.openings[0];
    expect(o.offset + o.width).toBeLessThanOrEqual(1500);
  });

  it('duplicates, rotates and deletes the selection', () => {
    s().addItem('desk');
    s().duplicateSelection();
    expect(s().design.items).toHaveLength(2);
    s().rotateSelection(-90);
    const copy = s().design.items[1];
    expect(copy.rotation).toBe(270);
    s().deleteSelection();
    expect(s().design.items).toHaveLength(1);
  });

  it('gives new items and openings their catalog heights and clamps edits', () => {
    s().addItem('desk');
    const id = s().design.items[0].id;
    expect(s().design.items[0].height).toBe(740);
    s().updateItems({ [id]: { height: 5 } });
    expect(s().design.items[0].height).toBe(300); // 40% of the 74 cm default
    s().addOpening('window');
    expect(s().design.openings[0]).toMatchObject({ height: 1200, sill: 900 });
    s().addItem('tv');
    expect(s().design.items[1]).toMatchObject({ height: 800, elevation: 1000 });
  });

  it('keeps openings under the ceiling when the room gets lower', () => {
    s().addOpening('window'); // sill 900 + 1200 tall = top at 2100
    s().updateRoom({ height: 2000 });
    const o = s().design.openings[0];
    expect(s().design.room.height).toBe(2000);
    expect(o.sill + o.height).toBeLessThanOrEqual(2000);
  });

  it('never deletes locked items', () => {
    s().addItem('desk');
    const id = s().design.items[0].id;
    s().updateItems({ [id]: { locked: true } });
    s().setSelection({ kind: 'items', ids: [id] });
    s().deleteSelection();
    expect(s().design.items).toHaveLength(1);
  });
});
