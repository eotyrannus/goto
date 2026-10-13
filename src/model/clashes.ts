import { CATALOG_BY_TYPE } from './catalog';
import { boxesIntersect, convexOverlap, doorSwingPolygons, insideRoom, itemBounds, itemCorners } from './geometry';
import type { Design } from './types';

export type Issue = 'outside' | 'overlap' | 'door' | 'ceiling';

/** Problems per item id: outside the room, overlapping other furniture, in a door's swing, or taller than the ceiling. */
export function findIssues(design: Design): Map<string, Set<Issue>> {
  const issues = new Map<string, Set<Issue>>();
  const flag = (id: string, issue: Issue) => {
    if (!issues.has(id)) issues.set(id, new Set());
    issues.get(id)!.add(issue);
  };

  const layer = (type: string) => CATALOG_BY_TYPE[type]?.layer ?? 'furniture';
  const solid = design.items.filter((it) => layer(it.type) !== 'floor');
  const shapes = solid.map((it) => ({ it, corners: itemCorners(it), box: itemBounds(it) }));

  for (const s of shapes) {
    if (!insideRoom(s.it, design.room)) flag(s.it.id, 'outside');
    if (s.it.elevation + s.it.height > design.room.height) flag(s.it.id, 'ceiling');
  }

  const furniture = shapes.filter((s) => layer(s.it.type) === 'furniture');
  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i];
      const b = furniture[j];
      if (boxesIntersect(a.box, b.box) && convexOverlap(a.corners, b.corners)) {
        flag(a.it.id, 'overlap');
        flag(b.it.id, 'overlap');
      }
    }
  }

  const swings = design.openings.flatMap((o) => doorSwingPolygons(design.room, o));
  for (const s of shapes) {
    if (swings.some((poly) => convexOverlap(s.corners, poly))) flag(s.it.id, 'door');
  }
  return issues;
}

export const ISSUE_TEXT: Record<Issue, string> = {
  outside: 'Sticks out of the room',
  overlap: 'Overlaps other furniture',
  door: 'Blocks a door swing',
  ceiling: 'Reaches above the ceiling',
};
