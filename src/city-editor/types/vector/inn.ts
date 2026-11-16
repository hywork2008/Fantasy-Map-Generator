import type { SiteLodging } from "../contracts/burgSiteEconomy";
import type { Id, Point } from "../document";

export interface GateInn {
  id: Id;
  kind: SiteLodging["kind"];
  name: string;
  stableSpaces: number;
  count: number;
  year: number;
  footprint: Point[];
  court: Point[];
  entrance: [Point, Point];
  /** Outer opening of a through-yard. A turning court keeps the single road-side door. */
  exit?: [Point, Point];
  stalls: Array<[Point, Point]>;
}
