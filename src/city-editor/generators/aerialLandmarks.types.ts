import type { Id, Point } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";
import type { DomesticWaterPoint } from "./domesticWater";
import type { GateInn } from "./gateInnPlacement";
import type { GuildHall, GuildYard } from "./guildFacilityPlacement";
import type { Monastery } from "./monasteryLayout";
import type { QuayWarehouse } from "./quayWarehousePlacement";
import type { StorageYard } from "./storageYardPlacement";

export interface Windmill {
  id: Id;
  kind: "post" | "tower";
  name: string;
  center: Point;
  /** Mound (post mill) or tower (tower mill) radius. */
  baseRadius: number;
  /** Direction the sails face (radians, CCW from +X / east); one prevailing wind for the whole town. */
  facing: number;
  /** Angle of the first sail in the sail plane. */
  sailAngle: number;
  sailLength: number;
}

export interface Barbican {
  id: Id;
  gateId: Id;
  form: "round" | "square";
  name: string;
  /** Outer curtain of the barbican, split at the front passage. */
  curtain: [Point[], Point[]];
  court: Point[];
  frontTowers: Point[][];
  turrets: Point[];
  /** Causeway or bridge across the moat between gate and barbican. */
  causeway?: Point[];
  wallWidth: number;
}

export interface TanneryPit {
  polygon: Point[];
  tone: number;
}

export interface Tannery {
  id: Id;
  name: string;
  riverId: Id;
  yard: Point[];
  washStrip: Point[];
  pits: TanneryPit[];
  sheds: Array<{ polygon: Point[]; ridge: [Point, Point] }>;
  racks: Array<[Point, Point]>;
}

export interface Gallows {
  id: Id;
  name: string;
  center: Point;
  moundRadius: number;
  pillars: Point[];
  path: Point[];
}

export interface AerialLandmarkPlan {
  domesticWater: DomesticWaterPoint[];
  monasteries: Monastery[];
  windmills: Windmill[];
  barbicans: Barbican[];
  tanneries: Tannery[];
  gallows: Gallows[];
  /** Formal guild halls, including chapters whose craftsman count is zero. */
  guildHalls: GuildHall[];
  /** Yards and kilns that belong to a guild even when it has no craftsmen. */
  guildYards: GuildYard[];
  /** Inventory yards. A cellar has no plot. */
  storageYards: StorageYard[];
  /** Port warehouses behind the quay. Absent on a plan cached before they existed. */
  quayWarehouses?: QuayWarehouse[];
  /** Wayside inns and caravanserais outside the busiest gate. */
  gateInns: GateInn[];
}

export interface AerialLandmarkInput {
  buildings: BuildingLot[];
  lanes: Array<{ points: Point[]; widthMeters: number }>;
  farms: Point[][];
  /** Mills, harbour spaces and other already-reserved footprints. */
  reserved: Point[][];
  /** Water-dependent works: tanneries must be separated and downstream on the same river. */
  waterUsers?: Array<{ riverId?: Id; polygon: Point[] }>;
}
