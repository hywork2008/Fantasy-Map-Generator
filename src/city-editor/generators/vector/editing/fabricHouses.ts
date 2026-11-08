import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import { nearestOnPolyline, polygonCentroid } from "../../geom";
import { fabricCellHash } from "../fabric/hash";
import { FABRIC_ENTRANCE_TOLERANCE_METERS, fabricHouseInfo, parseFabricHouseId } from "../fabric/houses";
import { fabricLine, fabricLinesNear, nearestFabricLine } from "../fabric/lines";
import { PERIMETER_HOUSE_MODEL } from "../generation/perimeter";
import { allocateVectorResidents, vectorPlacementDwellings } from "../generation/urbanCapacity";
import { matchesVectorUrbanFingerprint, vectorUrbanFingerprint } from "../generation/urbanState";
import { evaluateAnchor } from "../geometry/curves";
import { nearestRoadAnchor } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { samplePath } from "../geometry/sampling";
import { assertVectorDocument } from "../validation/document";
import { fabricLineSurface } from "./fabricLineSurface";

/** Placement id of a house detached from street block `cellId`. */
export const detachedHouseId = (cellId: string, index: number) => `fabric:${cellId}:${index}`;
/** Houses detached from fabric records stay occupancy for the CE plan; they never cut its blocks. */
export const isDetachedFabricHouse = (p: VectorPlacement) =>
  p.id.startsWith("fabric:") && p.modelId === PERIMETER_HOUSE_MODEL;

const inwards = (p: Point, center: Point): Point => [
  p[0] + (center[0] - p[0]) * 0.001,
  p[1] + (center[1] - p[1]) * 0.001
];

/** Replaces generated house `houseId` by an equal manual placement, without regenerating anything. The street
 * block lists the index in `detached`; the adopted ledger, stage capacities and residents follow. */
export function detachFabricHouse(
  source: VectorCityDocument,
  houseId: string
): { document: VectorCityDocument; placementId: string } {
  assertVectorDocument(source);
  const u = source.urban;
  if (!u || u.inputRevision !== source.revision || !matchesVectorUrbanFingerprint(source, u.adoptedFingerprint))
    throw new Error("dependency-stale");
  const info = fabricHouseInfo(source.fabric, houseId),
    ref = parseFabricHouseId(houseId);
  if (!info || !ref) throw new Error("dependency-placement-required");
  const doc = structuredClone(source),
    cell = doc.fabric!.cells[ref.cellId],
    id = detachedHouseId(cell.id, ref.index);
  if (Object.hasOwn(doc.placements, id)) throw new Error("dependency-placement-required");
  const site = { outer: info.ring, holes: [] },
    center = polygonCentroid(info.ring),
    point = inwards(info.entrance, center);
  // The entrance keeps the line the generator chose: a main road as an anchor, otherwise a fabric line.
  let access: VectorPlacement["accesses"][number] | undefined, end: Point | undefined, line: string | undefined;
  for (const path of Object.values(doc.paths).filter(p => p.role === "road")) {
    const hit = nearestOnPolyline(
      info.accessPoint,
      samplePath(path).map(s => s.point)
    );
    if (hit.dist > FABRIC_ENTRANCE_TOLERANCE_METERS) continue;
    access = nearestRoadAnchor(path, info.accessPoint);
    end = evaluateAnchor(path, access);
    break;
  }
  if (!access) {
    const hit = nearestFabricLine(doc.fabric, info.accessPoint, FABRIC_ENTRANCE_TOLERANCE_METERS);
    if (hit) {
      line = hit.id;
      end = hit.point;
    }
  }
  const distance = end ? Math.hypot(end[0] - point[0], end[1] - point[1]) : 0;
  if (!end || distance < 0.001) throw new Error("dependency-placement-access");
  doc.placements[id] = {
    id,
    modelId: PERIMETER_HOUSE_MODEL,
    position: center,
    facingDegrees: 0,
    origin: "manual",
    editPolicy: "editable",
    site,
    accesses: access ? [access] : [],
    building: {
      kind: "housing",
      label: "CE perimeter house",
      districtId: cell.districtId,
      provenance: "provisional",
      dimensionSource: "CE organicBlocks / perimeterHousing, detached from fabric records",
      footprint: [site],
      reserved: [site],
      entrances: [
        {
          id: "main",
          point,
          outward: [(end[0] - point[0]) / distance, (end[1] - point[1]) / distance],
          widthMeters: 1.1,
          connector: [point, end],
          ...(access ? { accessIndex: 0 } : { fabricLine: line })
        }
      ],
      dwellings: info.dwellings,
      floorFootprintMeters2: regionArea(site),
      storeys: info.storeys,
      residentialShare: 0.85,
      heightMeters: info.storeys * 3.2
    }
  };
  cell.detached = [...cell.detached, ref.index].sort((a, b) => a - b);
  const { hash: _hash, ...record } = cell;
  cell.hash = fabricCellHash(record);
  doc.revision++;
  refreshUrbanLedger(doc, [id]);
  assertVectorDocument(doc);
  return { document: doc, placementId: id };
}

/** Recomputes the adopted ledger after a change that keeps every record and placement in place: stage
 * capacities, residents, report and fingerprint. `added` manual placements join every stage, as the generator
 * shows manual placements. */
function refreshUrbanLedger(doc: VectorCityDocument, added: string[]) {
  const u = doc.urban!,
    r = u.report,
    walls = Object.values(doc.connections.circuits)
      .filter(c => !c.parentCircuitId)
      .map(c => ({ outer: sampledClosedRing(doc, c.pathId), holes: [] })),
    inside = (p: Point) => !walls.length || containsRegion(walls, p);
  u.inputRevision = doc.revision;
  doc.generation!.inputRevision = doc.revision;
  for (const c of u.checkpoints) {
    c.placementIds = [...added, ...c.placementIds.filter(id => !added.includes(id))];
    if (c.id === "housing")
      c.placementIds.sort(
        (a, b) => Number(inside(doc.placements[b].position)) - Number(inside(doc.placements[a].position))
      );
    const a = allocateVectorResidents(doc, c.placementIds, r.requiredDwellings, r.targetPopulation, c.id === "housing");
    c.capacityDwellings = a.capacity;
    c.assignedDwellings = a.assignedDwellings;
    c.assignedPopulation = a.assignedPopulation;
    c.unplacedPopulation = a.unplacedPopulation;
    if (c.id !== "housing") continue;
    u.assignments = a.assignments;
    r.capacityDwellings = a.capacity;
    r.assignedDwellings = a.assignedDwellings;
    r.unplacedDwellings = a.unplacedDwellings;
    r.assignedPopulation = a.assignedPopulation;
    r.unplacedPopulation = a.unplacedPopulation;
  }
  const cells = Object.values(doc.fabric?.cells ?? {}),
    fabricIn = cells
      .filter(c => c.inside)
      .reduce((n, c) => n + c.houses.dwellings.reduce((m, d, i) => m + (c.detached.includes(i) ? 0 : d), 0), 0),
    housing = u.checkpoints.find(c => c.id === "housing")!.placementIds,
    placedIn = housing
      .filter(id => inside(doc.placements[id].position))
      .reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0);
  r.capacityInside = placedIn + fabricIn;
  r.capacityOutside = r.capacityDwellings - r.capacityInside;
  r.housingBuildings =
    u.ownedPlacements.filter(id => doc.placements[id]?.building?.kind === "housing").length +
    cells.reduce((n, c) => n + c.houses.offsets.length - c.detached.length, 0);
  u.adoptedFingerprint = vectorUrbanFingerprint(doc);
}

/** After the CE plan rewrote the fabric records: every detached house's entrance moves to the nearest fabric
 * line within reach, and no street or lane may cross a detached house. Throws when either fails. */
export function reattachFabricEntrances(doc: VectorCityDocument): void {
  for (const p of Object.values(doc.placements)) {
    if (!isDetachedFabricHouse(p) || !p.building) continue;
    const reserved = p.building.reserved,
      box = {
        minX: Math.min(...reserved.flatMap(r => r.outer.map(q => q[0]))),
        minY: Math.min(...reserved.flatMap(r => r.outer.map(q => q[1]))),
        maxX: Math.max(...reserved.flatMap(r => r.outer.map(q => q[0]))),
        maxY: Math.max(...reserved.flatMap(r => r.outer.map(q => q[1])))
      };
    const crossing =
      doc.fabric &&
      fabricLinesNear(doc.fabric, box, 8).find(line =>
        regionBoolean(reserved, [fabricLineSurface(line)], "intersection").some(r => regionArea(r) > 1e-5)
      );
    if (crossing) throw new Error(`dependency-protected-placement:${p.id}:${crossing.id}`);
    for (const e of p.building.entrances) {
      if (e.fabricLine === undefined) continue;
      const last = e.connector.at(-1)!,
        current = fabricLine(doc.fabric, e.fabricLine);
      if (current && nearestOnPolyline(last, current.points).dist <= FABRIC_ENTRANCE_TOLERANCE_METERS) continue;
      const reach = Math.hypot(last[0] - e.point[0], last[1] - e.point[1]) + 2,
        hit = nearestFabricLine(doc.fabric, e.point, reach),
        d = hit ? Math.hypot(hit.point[0] - e.point[0], hit.point[1] - e.point[1]) : 0;
      if (!hit || d < 0.001) throw new Error(`dependency-protected-access:${p.id}`);
      e.fabricLine = hit.id;
      e.connector = [e.point, hit.point];
      e.outward = [(hit.point[0] - e.point[0]) / d, (hit.point[1] - e.point[1]) / d];
    }
  }
}
