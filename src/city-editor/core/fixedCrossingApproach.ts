import {
  type ApproachCorridorSettings,
  type CorridorGuideNode,
  findApproachCorridor
} from "../../generators/approachCorridorSearch";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../../services/physicalWaterIndex";
import type { RiverPoint } from "../../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../../services/riverPhysicalGeometry";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { requiredSiteExtent } from "../../utils/requiredSiteBounds";
import type { CityDocument, Id } from "./types";

/** Read-only bounded CE mesh→fixed E adapter. Guides are not new street junctions;
 * finalized line/arc pieces must be adopted separately without snapping/smoothing. */
export function findFixedCrossingApproach(
  document: CityDocument,
  input: {
    facilityId: number;
    side: "A" | "B";
    startVertexId: Id;
    startTangent?: RiverPoint;
    settings: ApproachCorridorSettings;
    maxTerminalConnectors: number;
    maxConnectorMeters: number;
    maxWaterVertices: number;
    /** Complete additional lakes/sea/other obstacles, in CE local metres. */
    otherWater: readonly PhysicalWaterPolygon[];
    supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
    allowsMeshEdge: (edgeId: Id) => boolean;
  }
) {
  const failure = (reason: string) => ({ reason });
  const fixed = document.importedFixedCrossings;
  if (
    !fixed ||
    !validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS) ||
    !Number.isFinite(document.frame.extentMeters) ||
    document.frame.extentMeters <= 0 ||
    requiredSiteExtent(fixed.requiredBounds) > document.frame.extentMeters
  )
    return failure("invalid-fixed-crossings");
  if (
    !Number.isSafeInteger(input.settings.maxNodes) ||
    input.settings.maxNodes < 2 ||
    !Number.isSafeInteger(input.settings.maxEdges) ||
    input.settings.maxEdges < 1 ||
    !Number.isSafeInteger(input.maxTerminalConnectors) ||
    input.maxTerminalConnectors < 1 ||
    !Number.isSafeInteger(input.maxWaterVertices) ||
    input.maxWaterVertices < 1 ||
    !Number.isFinite(input.maxConnectorMeters) ||
    input.maxConnectorMeters <= 0 ||
    input.settings.roadWidthMeters !== fixed.roadWidthMeters ||
    !["A", "B"].includes(input.side)
  )
    return failure("invalid-input");
  const crossing = fixed.crossings.find(c => c.id === input.facilityId);
  if (!crossing) return failure("unknown-facility");
  const ids = Object.keys(document.mesh.vertices);
  if (ids.length + 1 > input.settings.maxNodes || Object.keys(document.mesh.edges).length * 2 > input.settings.maxEdges)
    return failure("graph-budget");
  const fixedKey = JSON.stringify(fixed);
  const meshKey = JSON.stringify([document.mesh.vertices, document.mesh.edges]);
  const start = ids.indexOf(input.startVertexId);
  if (start < 0) return failure("unknown-start");
  const waters = [...fixed.rivers, ...input.otherWater];
  if (waters.reduce((sum, w) => sum + w.rings.reduce((n, r) => n + r.length, 0), 0) > input.maxWaterVertices)
    return failure("water-budget");
  const water = PhysicalWaterIndex.build(waters, new PhysicalWaterValidationCache());
  if (!water) return failure("invalid-water");
  const index = new Map(ids.map((id, i) => [id, i]));
  const nodes: (Omit<CorridorGuideNode, "neighbors"> & { neighbors: number[] })[] = ids.map((id, i) => ({
    id: i,
    point: [...document.mesh.vertices[id].point],
    neighbors: []
  }));
  for (const edge of Object.values(document.mesh.edges)) {
    const a = index.get(edge.a),
      b = index.get(edge.b);
    if (a === undefined || b === undefined) return failure("invalid-mesh");
    if (!input.allowsMeshEdge(edge.id)) continue;
    nodes[a].neighbors.push(b);
    nodes[b].neighbors.push(a);
  }
  const endpoint: RiverPoint = [...(input.side === "A" ? crossing.approachA : crossing.approachB)];
  const tangent: RiverPoint = input.side === "A" ? [...crossing.normal] : [-crossing.normal[0], -crossing.normal[1]];
  const portal = nodes.length;
  const candidates = nodes.filter(node => {
    const dx = endpoint[0] - node.point[0],
      dy = endpoint[1] - node.point[1],
      length = Math.hypot(dx, dy);
    return (
      length > 1e-9 &&
      length <= input.maxConnectorMeters &&
      length >= input.settings.minimumFinalStraightMeters &&
      dx * tangent[0] + dy * tangent[1] > 0 &&
      Math.abs(dx * tangent[1] - dy * tangent[0]) <= 1e-9 * length
    );
  });
  if (candidates.length > input.maxTerminalConnectors) return failure("terminal-budget");
  if (!candidates.length) return failure("no-terminal-connector");
  const edgeCount = nodes.reduce((n, node) => n + node.neighbors.length, 0) + candidates.length;
  if (edgeCount > input.settings.maxEdges) return failure("graph-budget");
  for (const node of candidates) node.neighbors.push(portal);
  nodes.push({ id: portal, point: [...endpoint], neighbors: [] });
  const result = findApproachCorridor({
    nodes,
    startNodeId: start,
    goalNodeId: portal,
    startTangent: input.startTangent,
    goalTangent: tangent,
    settings: input.settings,
    water,
    supportsDryFootprint: input.supportsDryFootprint
  });
  if (
    JSON.stringify(document.importedFixedCrossings) !== fixedKey ||
    JSON.stringify([document.mesh.vertices, document.mesh.edges]) !== meshKey
  )
    return failure("changed-source");
  return "corridor" in result
    ? {
        ...result,
        facilityId: crossing.id,
        side: input.side,
        endpoint: [...endpoint] as RiverPoint,
        geometryVersion: crossing.geometryVersion,
        guides: nodes.map(node => ({ ...node, point: [...node.point] as RiverPoint, neighbors: [...node.neighbors] })),
        settings: { ...input.settings },
        guideVertexIds: [...ids, null]
      }
    : result;
}
