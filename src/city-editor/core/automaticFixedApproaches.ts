import { corridorUnit } from "../../services/approachCorridorGeometry";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../../services/physicalWaterIndex";
import type { RiverPoint } from "../../services/riverGeometry";
import { type PhysicalWaterPolygon, validWaterPolygon } from "../../services/riverPhysicalGeometry";
import { polygonConvexPieces } from "../../services/worldCellGeometry";
import { buildPolygonLandFootprintPolicy } from "../../services/worldLandFootprintPolicy";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { riverRibbons } from "./bridgeDeck";
import {
  adoptFixedCrossingApproaches,
  type FixedApproachProvider,
  type FixedApproachRequest
} from "./fixedApproachAdoption";
import { orientedRectCorners, templeRectForElement } from "./gen/civicPlacement";
import { corridor } from "./gen/parcelGeometry";
import { facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import type { CityDocument, Point } from "./types";

const terrainBudget = { maxCells: 10000, maxVertices: 100000, maxClipOperations: 100000, maxRemainingPieces: 2000 };
/** Standalone CE contract: only the complete current mesh proves dry support.
 * No extrapolated land outside the mesh, and no captured FMG/previous-document state.
 */
export const cityFixedApproachProvider: FixedApproachProvider = (_request, document) => {
  try {
    const faces = Object.values(document.mesh.faces);
    if (!faces.length || faces.length > terrainBudget.maxCells) return null;
    const cells: { polygon: RiverPoint[]; allowed: boolean; supported: boolean }[] = [];
    const otherWater: PhysicalWaterPolygon[] = [];
    let vertices = 0;
    const reserve = (polygon: readonly Point[]) => {
      vertices += polygon.length;
      const water = { id: -otherWater.length - 1, rings: [polygon.map(p => [...p] as Point)] };
      if (vertices > terrainBudget.maxVertices || !validWaterPolygon(water))
        throw new RangeError("Invalid reservation");
      otherWater.push(water);
    };
    for (const face of faces) {
      const polygon = facePoints(document.mesh, face);
      vertices += polygon.length;
      if (vertices > terrainBudget.maxVertices || !Number.isFinite(face.properties.elevation)) return null;
      const pieces = polygonConvexPieces(polygon, 1, terrainBudget.maxClipOperations);
      if (!("pieces" in pieces)) return null;
      const dry = face.properties.water === "land" && face.properties.elevation > 0;
      for (const piece of pieces.pieces) cells.push({ polygon: piece, allowed: true, supported: dry });
      if (!dry) reserve(polygon);
    }
    for (const area of document.waterAreas ?? []) reserve(area.polygon);
    for (const group of document.featureGroups) {
      if (group.kind !== "river") continue;
      if (
        !Number.isFinite(group.style.widthMeters) ||
        group.style.widthMeters <= 0 ||
        group.vertices.some(id => !document.mesh.vertices[id])
      )
        return null;
    }
    // Editable river strokes are obstacles too; the fixed source does not replace them.
    for (const ribbon of riverRibbons(document)) {
      if (ribbon.points.some(p => !p.every(Number.isFinite))) return null;
      for (let i = 1; i < ribbon.points.length; i++)
        reserve(corridor(ribbon.points[i - 1], ribbon.points[i], ribbon.width, ribbon.width / 2));
    }
    for (const part of new MoatReservation(document).parts) reserve(part.polygon);
    for (const castle of document.castles ?? []) for (const part of castle.parts) reserve(part.footprint);
    for (const cemetery of document.cemeteries ?? []) for (const part of cemetery.parts) reserve(part.footprint);
    for (const landmark of document.landmarks ?? []) for (const site of landmark.site) reserve(site.outer);
    for (const element of document.elements) {
      if (element.kind === "temple" && element.point)
        reserve(
          orientedRectCorners(
            templeRectForElement(
              element.point,
              element.sizeMeters,
              element.rotation,
              document.frame.settlementExtentMeters ?? document.frame.extentMeters
            )
          )
        );
    }
    // Virtual connectors must not cut a curtain. Existing gate-road vertices on
    // the outside can serve as starts; the automatic adapter never invents a gate.
    for (const group of document.featureGroups) {
      if (group.kind !== "wall") continue;
      if (!Number.isFinite(group.style.widthMeters) || group.style.widthMeters <= 0) return null;
      for (const ref of group.segments) {
        const edge = document.mesh.edges[ref.edgeId];
        if (!edge) return null;
        reserve(
          corridor(
            document.mesh.vertices[edge.a].point,
            document.mesh.vertices[edge.b].point,
            group.style.widthMeters,
            group.style.widthMeters / 2
          )
        );
      }
    }
    const half = document.frame.extentMeters / 2;
    const policy = buildPolygonLandFootprintPolicy(
      cells,
      { minX: -half, minY: -half, maxX: half, maxY: half },
      terrainBudget
    );
    const obstacles = PhysicalWaterIndex.build(otherWater, new PhysicalWaterValidationCache());
    if (!obstacles) return null;
    const supportsDryFootprint = (p: readonly RiverPoint[]) =>
      policy.assess(p, "dry-support").status === "allowed" && !obstacles.touchesWater(p);
    return {
      otherWater,
      supportsDryFootprint,
      allowsMeshEdge: id => {
        const edge = document.mesh.edges[id];
        if (!edge) return false;
        const a = document.mesh.vertices[edge.a]?.point,
          b = document.mesh.vertices[edge.b]?.point;
        return !!a && !!b && a.every(Number.isFinite) && b.every(Number.isFinite);
      }
    };
  } catch {
    return null;
  }
};

export interface AutomaticFixedApproachResult {
  document: CityDocument;
  diagnostics: readonly { facilityId: number; side: "A" | "B"; status: "adopted" | "unresolved"; reason?: string }[];
}
/** Bounded normal-generation adapter. Search from actual street vertices, with
 * their incoming tangent. Keep each accepted exact curve; report every missing
 * side, never replace it with a straight line across water.
 */
export function connectAutomaticFixedApproaches(
  source: CityDocument,
  provider: FixedApproachProvider = cityFixedApproachProvider
): AutomaticFixedApproachResult {
  const fixed = source.importedFixedCrossings;
  if (!fixed || !validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS) || !fixed.crossings.length)
    return { document: source, diagnostics: [] };
  let document = structuredClone(source);
  delete document.fixedCrossingApproaches;
  const accepted: { id: string; request: FixedApproachRequest }[] = [];
  const diagnostics: AutomaticFixedApproachResult["diagnostics"][number][] = [];
  const starts: { id: string; tangent: RiverPoint }[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      if (!edge) continue;
      const a = document.mesh.vertices[edge.a]?.point,
        b = document.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const tangent = corridorUnit([b[0] - a[0], b[1] - a[1]]);
      if (!tangent) continue;
      starts.push({ id: edge.b, tangent }, { id: edge.a, tangent: [-tangent[0], -tangent[1]] });
    }
  }
  const unique = [...new Map(starts.map(s => [JSON.stringify(s), s])).values()];
  let attempts = 0;
  for (const crossing of fixed.crossings)
    for (const side of ["A", "B"] as const) {
      const endpoint = side === "A" ? crossing.approachA : crossing.approachB;
      const tangent: Point = side === "A" ? [...crossing.normal] : [-crossing.normal[0], -crossing.normal[1]];
      const candidates = unique
        .filter(s => {
          const p = document.mesh.vertices[s.id].point;
          return (endpoint[0] - p[0]) * tangent[0] + (endpoint[1] - p[1]) * tangent[1] > 0;
        })
        .sort((a, b) => {
          const distance = (id: string) =>
            Math.hypot(
              document.mesh.vertices[id].point[0] - endpoint[0],
              document.mesh.vertices[id].point[1] - endpoint[1]
            );
          return distance(a.id) - distance(b.id) || JSON.stringify(a).localeCompare(JSON.stringify(b));
        })
        .slice(0, 4);
      let reason = "no-street-start",
        adopted = false;
      for (const start of candidates) {
        if (attempts++ >= 64) {
          reason = "automatic-approach-budget";
          break;
        }
        const width = fixed.roadWidthMeters;
        const request: FixedApproachRequest = {
          facilityId: crossing.id,
          side,
          startVertexId: start.id,
          startTangent: start.tangent,
          maxTerminalConnectors: 256,
          maxConnectorMeters: Math.max(20, document.frame.blockSizeMeters * 3),
          terminalLeadMeters: Math.max(width * 4, 8),
          maxWaterVertices: terrainBudget.maxVertices,
          settings: {
            roadWidthMeters: width,
            minimumTurnRadiusMeters: Math.max(width, 2),
            minimumStraightMeters: width,
            minimumFinalStraightMeters: Math.max(width * 2, 4),
            turnPenaltyMetersPerRadian: width,
            maxEnvelopeErrorMeters: 0.05,
            maxArcSections: 256,
            maxNodes: 10000,
            maxEdges: 100000,
            maxLabels: 20000,
            maxExpansions: 20000
          }
        };
        const record = { id: `fixed-${crossing.id}-${side}`, request };
        const result = adoptFixedCrossingApproaches(source, [...accepted, record], provider);
        if (!("document" in result)) {
          reason = result.reason;
          continue;
        }
        accepted.push(record);
        document = result.document;
        adopted = true;
        break;
      }
      diagnostics.push({
        facilityId: crossing.id,
        side,
        status: adopted ? "adopted" : "unresolved",
        ...(adopted ? {} : { reason })
      });
    }
  return { document, diagnostics };
}
