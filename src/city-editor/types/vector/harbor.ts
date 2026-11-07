import type { CargoBerthAssignment, CargoQuay } from "../contracts/harborCargo";
import type { HarborCargoPile, HarborCrane } from "../contracts/harborFabric";
import type { Point } from "../primitives";
import type { ShipDisplayState, ShipType } from "../ships";
import type { CurveAnchor } from "./document";
import type { VectorPolygon } from "./generation";

export interface VectorHarborShip {
  id: string;
  type: ShipType;
  point: Point;
  rotation: number;
  length: number;
  state: ShipDisplayState;
  landId: string;
  waterId: string;
  cargo?: CargoBerthAssignment;
}
/** Fixed operating harbor. Polygons and logical owners replace all source cells. */
export interface VectorHarborPlan {
  id: string;
  editPolicy: "fixed";
  navigation: {
    extentMeters: number;
    initialWater: boolean;
    openBoundary: boolean;
    land: VectorPolygon[];
    water: VectorPolygon[];
    depths: { id: string; polygon: VectorPolygon; depthMeters: number; levelMeters: number }[];
  };
  lands: { id: string; polygon: VectorPolygon }[];
  spaces: { id: string; landId: string; kind: "quay" | "loading-yard"; polygon: VectorPolygon }[];
  frontages: { a: Point; b: Point; widthMeters: number; cargo?: boolean }[];
  accesses: { id: string; points: Point[]; widthMeters: number; road: CurveAnchor }[];
  piers: { id: string; landId: string; waterId: string; polygon: VectorPolygon; depthMeters: number }[];
  cranes: HarborCrane[];
  quays: (Omit<CargoQuay, "landFaceId" | "waterFaceId"> & { landId: string; waterId: string })[];
  cargoPiles: HarborCargoPile[];
  ships: VectorHarborShip[];
}
