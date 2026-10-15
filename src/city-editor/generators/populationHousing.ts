import { residentialStoreys } from "../../utils/urbanMorphology";
import type { ResidentialCluster } from "../types/contracts/population";
import type { CityDocument, Point } from "../types/document";
import type { DistrictFabric } from "./blockInfill";
import type { BuildingLot } from "./buildingLots";
import { circuitRing, outerTownCircuit } from "./fortifications";
import { polygonArea } from "./geom";
import { clipHalfPlane, longestFrame } from "./lotGeometry";
import { facePoints } from "./mesh";
import { makeRng } from "./prng";
import {
  dwellingCapacity,
  isResidentialBuilding,
  measureHousingCapacity,
  residentialCapacity
} from "./residentialCapacity";

/** Generate the same coarse parcels for every display mode; never build detailed houses first. */
export function populationFabricSource(document: CityDocument): CityDocument {
  const source = {
    ...document,
    populationPlan: undefined,
    populationReport: undefined,
    residentialClusters: undefined,
    buildingPattern: "legacy" as const
  };
  // Detailed housing is the ordinary CE fabric: same lot sizes, shapes and occupancy as a
  // default generation, so a larger population only adds blocks and houses.
  if (document.fabric && document.populationPlan?.displayDwellings !== 1)
    source.fabric = {
      ...document.fabric,
      version: 4,
      districts: document.fabric.districts.map(d => ({
        ...d,
        parameters: {
          ...d.parameters,
          lotArea: d.faceIds.some(id => document.mesh.faces[id]?.properties.locked)
            ? d.parameters.lotArea
            : (document.populationPlan?.housingFit?.parcelAreaM2 ?? 640),
          housingCluster: !d.faceIds.some(id => document.mesh.faces[id]?.properties.locked),
          occupancy: 1
        }
      }))
    };
  return source;
}

/** Cut off an area fraction with parallel lines; all child polygons stay within their parent. */
function slice(polygon: Point[], normal: Point, start: number, end: number): Point[] {
  const area = Math.abs(polygonArea(polygon));
  const values = polygon.map(p => p[0] * normal[0] + p[1] * normal[1]);
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const cut = (fraction: number) => {
    let a = lo,
      b = hi;
    for (let i = 0; i < 28; i++) {
      const m = (a + b) / 2;
      const part = clipHalfPlane(polygon, normal, m);
      if (Math.abs(polygonArea(part)) < area * fraction) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  const a = start <= 0 ? lo - 1 : cut(start),
    b = end >= 1 ? hi + 1 : cut(end);
  return clipHalfPlane(clipHalfPlane(polygon, normal, b), [-normal[0], -normal[1]], -a);
}

const axis = (lot: BuildingLot) => longestFrame(lot.polygon).axis;

/** Preserve building order while associating each parcel in one pass. */
function withHousingBuildings(fabric: DistrictFabric, buildings: BuildingLot[]): DistrictFabric {
  const byParcel = new Map<BuildingLot["parcelId"], BuildingLot[]>();
  if (fabric.parcels) {
    for (const building of buildings) {
      const group = byParcel.get(building.parcelId) ?? [];
      group.push(building);
      byParcel.set(building.parcelId, group);
    }
  }
  return {
    ...fabric,
    buildings,
    parcels: fabric.parcels?.map(parcel => ({ ...parcel, buildings: byParcel.get(parcel.id) ?? [] }))
  };
}

/** Keep every house of the ordinary fabric as it was drawn; population only sets storeys and occupancy. */
function detailedHousingFabric(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const plan = document.populationPlan!;
  const high = plan.housingFit?.storeys ?? residentialStoreys(plan.period).standard;
  const fixed = fabric.buildings.filter(lot => document.mesh.faces[lot.faceId]?.properties.locked);
  const fixedHousing = measureHousingCapacity(document, fixed, plan.requiredDwellings);
  let remaining = Math.max(0, plan.requiredDwellings - fixedHousing.assignedInside - fixedHousing.assignedOutside);
  let outsideRemaining = Math.max(
    0,
    Math.min(document.urbanGrowth?.outsideCap ?? 0, document.urbanGrowth?.outsideBudget ?? 0) -
      fixedHousing.assignedOutside
  );
  const rng = makeRng(`${document.generationSeed ?? document.fabric?.seed ?? "population"}:population-occupancy`);
  const info = fabric.buildings.map((lot, index) => {
    const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
    const eligible =
      isResidentialBuilding(lot) &&
      !document.mesh.faces[lot.faceId]?.properties.locked &&
      (settlement === "core" || settlement === "outskirts");
    const storeys = settlement === "outskirts" ? Math.min(2, high) : high;
    const capacity = eligible
      ? dwellingCapacity(Math.abs(polygonArea(lot.polygon)), storeys, lot.residentialFloorShare)
      : 0;
    return {
      lot,
      index,
      eligible,
      storeys,
      capacity,
      outside: settlement === "outskirts",
      rank: rng()
    };
  });
  const coreCapacity = info.reduce((n, i) => n + (i.eligible && !i.outside ? i.capacity : 0), 0);
  const coreShare = coreCapacity ? Math.min(1, remaining / coreCapacity) : 1;
  const assignedById = new Map<number, number>();
  let carry = 0;
  for (const i of info) {
    if (!i.eligible || i.outside) continue;
    carry += i.capacity * coreShare;
    const take = Math.min(i.capacity, Math.floor(carry + 1e-9), remaining);
    carry -= take;
    remaining -= take;
    assignedById.set(i.index, take);
  }
  for (const i of info.filter(i => i.eligible && i.outside).sort((a, b) => a.rank - b.rank)) {
    const take = Math.min(i.capacity, remaining, outsideRemaining);
    if (take <= 0) continue;
    remaining -= take;
    outsideRemaining -= take;
    assignedById.set(i.index, take);
  }
  const buildings: BuildingLot[] = [];
  for (const i of info) {
    if (!i.eligible) {
      buildings.push(i.lot);
      continue;
    }
    const assigned = assignedById.get(i.index);
    if (assigned === undefined) continue;
    const footprint = Math.abs(polygonArea(i.lot.polygon));
    const id = `population:${i.lot.id ?? `${i.lot.faceId}:${i.index}`}:0`;
    const cluster: ResidentialCluster = {
      id,
      regionId: i.lot.growthRegionId ?? (i.outside ? "outside" : "core"),
      faceIds: [i.lot.faceId],
      polygon: i.lot.polygon,
      templateCounts: { [`${i.storeys}f:${footprint.toFixed(6)}`]: 1 },
      residentialFootprintM2: footprint,
      capacityDwellings: i.capacity,
      assignedDwellings: assigned,
      assignedPopulation: 0
    };
    buildings.push({
      ...i.lot,
      id,
      storeys: i.storeys,
      residentialCluster: cluster
    });
  }
  return withHousingBuildings(fabric, buildings);
}

export function populationHousingFabric(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const plan = document.populationPlan!;
  if (plan.displayDwellings === 1) return detailedHousingFabric(document, fabric);
  const profile = residentialStoreys(plan.period);
  const buildings: BuildingLot[] = [];
  const fixed = fabric.buildings.filter(lot => document.mesh.faces[lot.faceId]?.properties.locked);
  const fixedHousing = measureHousingCapacity(document, fixed, plan.requiredDwellings);
  const fixedCapacity = fixedHousing.assignedInside + fixedHousing.assignedOutside;
  let remaining = Math.max(0, plan.requiredDwellings - fixedCapacity);
  const outsideCap = document.urbanGrowth?.outsideCap ?? 0;
  let outsideRemaining = Math.max(
    0,
    Math.min(outsideCap, document.urbanGrowth?.outsideBudget ?? 0) - fixedHousing.assignedOutside
  );
  // Fill eligible wall capacity first. Outskirts retain the existing growth mask and budget.
  const occupancyRng = makeRng(
    `${document.generationSeed ?? document.fabric?.seed ?? "population"}:population-occupancy`
  );
  const ordered = fabric.buildings
    .map((lot, index) => ({ lot, index, rank: occupancyRng() }))
    .sort(
      (a, b) =>
        Number(document.mesh.faces[a.lot.faceId]?.properties.settlement === "outskirts") -
          Number(document.mesh.faces[b.lot.faceId]?.properties.settlement === "outskirts") ||
        a.rank - b.rank ||
        a.index - b.index
    );
  // Like the FMG fabric, every eligible residential parcel is built out in full; surplus
  // capacity lowers per-house occupancy instead of leaving vacant plots.
  const eligible = (lot: BuildingLot) => {
    const face = document.mesh.faces[lot.faceId];
    return (
      isResidentialBuilding(lot) &&
      !face?.properties.locked &&
      ["core", "outskirts"].includes(face?.properties.settlement ?? "")
    );
  };
  const high = plan.housingFit?.storeys ?? profile.standard;
  const outsideStoreys = Math.min(2, high);
  const houseCount = (area: number) => Math.min(8, Math.max(1, Math.round(area / 80)));
  let coreCapacity = 0;
  for (const { lot } of ordered) {
    if (!eligible(lot) || document.mesh.faces[lot.faceId]?.properties.settlement === "outskirts") continue;
    const area = Math.abs(polygonArea(lot.polygon));
    if (area < 40) continue;
    coreCapacity += houseCount(area) * dwellingCapacity(area / houseCount(area), high, lot.residentialFloorShare);
  }
  const coreShare = coreCapacity ? Math.min(1, remaining / coreCapacity) : 1;
  for (const { lot, index } of ordered) {
    const face = document.mesh.faces[lot.faceId];
    if (!eligible(lot)) {
      buildings.push(lot);
      continue;
    }
    const outside = face.properties.settlement === "outskirts";
    // Outskirts keep the existing growth mask and budget; the core is always built out.
    if (outside && Math.min(remaining, outsideRemaining) <= 0) continue;
    const area = Math.abs(polygonArea(lot.polygon));
    if (area < 40) {
      buildings.push({ ...lot, role: "shed", uses: ["storage"] });
      continue;
    }
    const count = houseCount(area);
    const footprint = area / count;
    const storeys = outside ? outsideStoreys : high;
    const perHouse = dwellingCapacity(footprint, storeys, lot.residentialFloorShare);
    const share = outside ? 1 : coreShare;
    const group = Math.max(1, Math.floor(plan.displayDwellings / Math.max(1, perHouse)));
    let at = 0;
    while (at < count) {
      const end = Math.min(count, at + group);
      const capacity = perHouse * (end - at);
      const assigned = Math.max(
        0,
        Math.min(capacity, Math.ceil(capacity * share), remaining, outside ? outsideRemaining : remaining)
      );
      const polygon = at === 0 && end === count ? lot.polygon : slice(lot.polygon, axis(lot), at / count, end / count);
      const cluster: ResidentialCluster = {
        id: `population:${lot.id ?? `${lot.faceId}:${index}`}:${at}`,
        regionId: lot.growthRegionId ?? (outside ? "outside" : "core"),
        faceIds: [lot.faceId],
        polygon,
        templateCounts: { [`${storeys}f:${footprint.toFixed(6)}`]: end - at },
        residentialFootprintM2: footprint * (end - at),
        capacityDwellings: capacity,
        assignedDwellings: assigned,
        assignedPopulation: 0
      };
      buildings.push({
        ...lot,
        id: cluster.id,
        polygon,
        storeys,
        residentialCluster: cluster
      });
      remaining -= assigned;
      if (outside) outsideRemaining -= assigned;
      at = end;
    }
  }
  return withHousingBuildings(fabric, buildings);
}

export function finishPopulationHousing(document: CityDocument, fabric: DistrictFabric): void {
  const plan = document.populationPlan!;
  const report = measureHousingCapacity(document, fabric.buildings, plan.requiredDwellings);
  document.housingCapacity = report;
  const clusters = fabric.buildings.flatMap(b => (b.residentialCluster ? [structuredClone(b.residentialCluster)] : []));
  // Integer residents are apportioned over dwelling assignments, including the unplaced bucket.
  const clusterAssigned = clusters.reduce((n, c) => n + c.assignedDwellings, 0);
  const fixedAssigned = Math.max(0, report.assignedInside + report.assignedOutside - clusterAssigned);
  const buckets = [...clusters.map(c => c.assignedDwellings), fixedAssigned, report.unplacedDwellings];
  const sum = buckets.reduce((a, b) => a + b, 0);
  const exact = buckets.map(n => (sum ? (n * plan.settings.targetPopulation) / sum : 0));
  const people = exact.map(Math.floor);
  let remainder = plan.settings.targetPopulation - people.reduce((a, b) => a + b, 0);
  for (const i of exact.map((_, i) => i).sort((a, b) => exact[b] - people[b] - (exact[a] - people[a]) || a - b)) {
    if (remainder-- <= 0) break;
    people[i]++;
  }
  clusters.forEach((c, i) => {
    c.assignedPopulation = people[i];
  });
  const unplacedPopulation = people.at(-1) ?? plan.settings.targetPopulation;
  document.residentialClusters = clusters;
  const developedFaces = new Set(
    fabric.buildings
      .filter(b => b.residentialCluster?.assignedDwellings || document.mesh.faces[b.faceId]?.properties.locked)
      .map(b => b.faceId)
  );
  const areaOf = (settlement: string) =>
    Object.values(document.mesh.faces)
      .filter(
        f =>
          f.properties.water === "land" &&
          f.properties.settlement === settlement &&
          (settlement !== "outskirts" || developedFaces.has(f.id))
      )
      .reduce((a, f) => a + Math.abs(polygonArea(facePoints(document.mesh, f))), 0);
  const fixedBuildings = fabric.buildings.filter(b => !b.residentialCluster && residentialCapacity(b) > 0).length;
  document.populationReport = {
    targetPopulation: plan.settings.targetPopulation,
    assignedPopulation: plan.settings.targetPopulation - unplacedPopulation,
    unplacedPopulation,
    estimatedBuildings:
      fixedBuildings + clusters.reduce((n, c) => n + Object.values(c.templateCounts).reduce((a, b) => a + b, 0), 0),
    wallEnvelopeAreaM2: outerTownCircuit(document)
      ? Math.abs(polygonArea(circuitRing(document, outerTownCircuit(document)!)))
      : null,
    displayGroups: clusters.length + fixedBuildings,
    coreLandAreaM2: areaOf("core"),
    outsideDevelopedAreaM2: areaOf("outskirts"),
    residentialFootprintM2: clusters.reduce((n, c) => n + c.residentialFootprintM2, 0),
    frameAreaM2: document.frame.extentMeters ** 2,
    reasons: [
      ...report.reasons,
      ...(report.unplacedDwellings && plan.housingFit?.exhausted ? ["population-capacity-adjustment-exhausted"] : [])
    ]
  };
}

/** Recompute diagnostics after edits without mutating the editor document during rendering. */
export function populationHousingFacts(document: CityDocument, fabric: DistrictFabric) {
  const measured = { ...document };
  finishPopulationHousing(measured, fabric);
  return {
    populationReport: measured.populationReport!,
    residentialClusters: measured.residentialClusters!,
    housing: measured.housingCapacity!
  };
}
