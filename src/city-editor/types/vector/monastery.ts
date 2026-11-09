import type { ReligiousHouse } from "../../../data/civilizationTraditions";
import type { Id, Point } from "../document";

export type MonasteryKind = ReligiousHouse;

export interface PrecinctBuilding {
  polygon: Point[];
  /** Roof ridge; absent for flat or round roofs. */
  ridge?: [Point, Point];
  role: "church" | "apse" | "crossing-tower" | "range" | "gatehouse" | "bell-tower" | "dome";
}

export interface PrecinctCourt {
  polygon: Point[];
  kind: "garth" | "yard" | "garden";
}

export interface Monastery {
  id: Id;
  kind: MonasteryKind;
  name: string;
  /** Voronoi block the precinct sits in. */
  faceId: Id;
  /** Closed ring of the precinct; houses, alleys and fields are cleared from it. */
  precinct: Point[];
  /** Open wall line; the gap between its ends is the gate. */
  wall: Point[];
  gate: Point;
  buildings: PrecinctBuilding[];
  courts: PrecinctCourt[];
  /** Roofed cloister walk as a ring (outer) around the garth. */
  walk?: { outer: Point[]; garth: Point[] };
  beds: Point[][];
  trees: Array<{ at: Point; radius: number }>;
  well?: Point;
}
