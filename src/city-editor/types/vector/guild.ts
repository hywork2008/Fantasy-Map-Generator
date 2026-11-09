import type { Id, Point } from "../document";

export interface GuildHall {
  id: Id;
  domain: string;
  name: string;
  practitioners: number;
  year: number;
  footprint: Point[];
  ridge: [Point, Point];
  tower?: Point[];
}

export type GuildYardKind = "bleachingField" | "timberYard" | "stoneYard" | "limeKiln" | "smithyYard" | "sandYard";

export interface GuildYard {
  id: Id;
  domain: string;
  kind: GuildYardKind;
  name: string;
  practitioners: number;
  year: number;
  polygon: Point[];
  frames?: Array<[Point, Point]>;
}

/** Guild halls in the town and their yards outside it (P6d). */
export interface VectorGuildWorks {
  halls: GuildHall[];
  yards: GuildYard[];
}
