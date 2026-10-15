// All lengths are millimetres. Rotation is degrees, clockwise (Konva convention).

export type Wall = 'top' | 'right' | 'bottom' | 'left';

export type OpeningKind = 'door' | 'double-door' | 'sliding-door' | 'window' | 'opening';

export type DoorMaterial = 'wood' | 'glass' | 'wood-glass' | 'aluminium-glass';

export interface Opening {
  id: string;
  kind: OpeningKind;
  wall: Wall;
  /** Distance from the left (top/bottom walls) or top (left/right walls) interior corner to the opening's near edge. */
  offset: number;
  width: number;
  /** Height of the opening itself. */
  height: number;
  /** Height of the bottom edge above the floor: 0 for doors, the sill for windows. */
  sill: number;
  /** Door leaf / window frame colour. */
  color: string;
  /** Doors only. */
  material?: DoorMaterial;
  hinge: 'start' | 'end';
  swing: 'in' | 'out';
}

export interface FurnitureItem {
  id: string;
  type: string;
  label?: string;
  /** Centre of the item in room coordinates. */
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  /** Height of the item's underside above the floor: 0 for free-standing, more for wall-mounted. */
  elevation: number;
  /** Main colour (fabric, top, body…); details keep their own colours. */
  color: string;
  /** Sofa beds: depth from the back when unfolded, and whether it's unfolded. */
  expandedLength?: number;
  expanded?: boolean;
  rotation: number;
  locked?: boolean;
}

export interface Room {
  width: number;
  depth: number;
  /** Floor-to-ceiling height. */
  height: number;
  wallThickness: number;
  wallColor: string;
  floorColor: string;
}

export interface Design {
  id: string;
  name: string;
  updatedAt: number;
  room: Room;
  openings: Opening[];
  items: FurnitureItem[];
}

export interface Settings {
  gridSize: number;
  showGrid: boolean;
  snap: boolean;
  showNames: boolean;
  showClearances: boolean;
  showClashes: boolean;
  /** Tint plan symbols and the floor with their colours. */
  colorPlan: boolean;
}

export type Selection = { kind: 'items'; ids: string[] } | { kind: 'opening'; id: string } | null;
