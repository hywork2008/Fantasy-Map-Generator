export type Point = [number, number];
export type Strategy = "caravanserai" | "room-corridor";
export type Side = "north" | "east" | "south" | "west";
export type SpaceKind = "room" | "corridor" | "courtyard" | "yard";

export interface Vertex {
  id: string;
  point: Point;
}
export interface BoundaryRef {
  boundaryId: string;
  forward: boolean;
}
export interface Space {
  id: string;
  kind: SpaceKind;
  use: string;
  label: string;
  roof: "covered" | "open";
  boundaryRefs: BoundaryRef[];
  required: boolean;
  locked: boolean;
}
export interface Boundary {
  id: string;
  a: string;
  b: string;
  leftSpaceId: string | null;
  rightSpaceId: string | null;
  barrier: "wall" | "open";
  thicknessMeters: number;
  locked: boolean;
}
export interface Opening {
  id: string;
  boundaryId: string;
  /** Distance from boundary.a to the beginning of the opening. */
  offsetMeters: number;
  widthMeters: number;
  kind: "door" | "gate" | "arch";
  state: "open" | "closed" | "locked";
  visibility: "visible" | "secret";
  locked: boolean;
}
export interface Fixture {
  id: string;
  spaceId: string;
  kind: "well" | "table";
  footprint: Point[];
  /** v1 fixtures are decorative; blocking furniture needs floor routing. */
  blocking: false;
  locked: boolean;
}
export interface Entrance {
  id: string;
  openingId: string;
  role: "main" | "secondary";
}
export interface Level {
  id: string;
  elevationMeters: number;
  vertices: Record<string, Vertex>;
  spaces: Record<string, Space>;
  boundaries: Record<string, Boundary>;
  openings: Record<string, Opening>;
  fixtures: Record<string, Fixture>;
  entrances: Entrance[];
}

export interface GenerationSettings {
  strategy: Strategy;
  seed: string;
  widthMeters: number;
  depthMeters: number;
  courtyardWidthMeters: number;
  courtyardDepthMeters: number;
  roomBandDepthMeters: number;
  minRoomWidthMeters: number;
  corridorWidthMeters: number;
  entranceWidthMeters: number;
  entranceSide: Side;
  symmetric: boolean;
  outerWallMeters: number;
  partitionWallMeters: number;
  roomCount: number;
  loopCount: number;
  fixtures: boolean;
}
export interface DungeonDocument {
  format: "fmg-dungeon-editor";
  version: 1;
  id: string;
  title: string;
  units: "meters";
  frame: { widthMeters: number; depthMeters: number };
  levels: Level[];
  generation: {
    algorithmVersion: "dungeon-v1";
    seed: string;
    strategy: Strategy;
    settings: GenerationSettings;
    attempt: number;
  };
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  targetId?: string;
}
export type GenerationResult =
  | { ok: true; document: DungeonDocument; diagnostics: Diagnostic[]; attempts: number }
  | { ok: false; diagnostics: Diagnostic[]; attempts: number };

export const DEFAULT_SETTINGS: GenerationSettings = {
  strategy: "caravanserai",
  seed: "caravanserai-1",
  widthMeters: 60,
  depthMeters: 70,
  courtyardWidthMeters: 24,
  courtyardDepthMeters: 30,
  roomBandDepthMeters: 6,
  minRoomWidthMeters: 4,
  corridorWidthMeters: 2,
  entranceWidthMeters: 3,
  entranceSide: "south",
  symmetric: true,
  outerWallMeters: 1,
  partitionWallMeters: 0.5,
  roomCount: 18,
  loopCount: 2,
  fixtures: true
};
