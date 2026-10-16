import type { ApproachCorridorSettings } from "../../generators/approachCorridorSearch";
import type { RiverPoint } from "../../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../../services/riverPhysicalGeometry";
import type { Id } from "./primitives";

export interface FixedApproachInput {
  facilityId: number;
  side: "A" | "B";
  startVertexId: Id;
  startTangent?: RiverPoint;
  settings: ApproachCorridorSettings;
  maxTerminalConnectors: number;
  maxConnectorMeters: number;
  /** Optional normal-aligned external lead. It is a guide, not a public junction. */
  terminalLeadMeters?: number;
  maxWaterVertices: number;
  /** Complete additional lakes/sea/other obstacles, in CE local metres. */
  otherWater: readonly PhysicalWaterPolygon[];
  /** Must include whole-footprint support AND passage/structure reservations for virtual connectors. */
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
  allowsMeshEdge: (edgeId: Id) => boolean;
}
