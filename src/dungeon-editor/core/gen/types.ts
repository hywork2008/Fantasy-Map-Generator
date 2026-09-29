import type { Point, SpaceKind } from "../types";

export interface PlannedSpace {
  id: string;
  kind: SpaceKind;
  use: string;
  label: string;
  rect: [number, number, number, number];
}
export interface PlannedConnection {
  a: string;
  b: string;
  kind: "door" | "arch" | "open";
  width: number;
}
export interface LayoutPlan {
  spaces: PlannedSpace[];
  connections: PlannedConnection[];
  entranceSpaceId: string;
  entranceSide: "north" | "east" | "south" | "west";
  entranceWidth: number;
  fixture?: { spaceId: string; footprint: Point[] };
}
