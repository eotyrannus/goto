// All lengths are millimetres. Rotation is degrees, clockwise (Konva convention).

export type Wall = 'top' | 'right' | 'bottom' | 'left';

export type OpeningKind = 'door' | 'double-door' | 'sliding-door' | 'window' | 'opening';

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
  rotation: number;
  locked?: boolean;
}

export interface Room {
  width: number;
  depth: number;
  /** Floor-to-ceiling height. */
  height: number;
  wallThickness: number;
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
}

export type Selection = { kind: 'items'; ids: string[] } | { kind: 'opening'; id: string } | null;
