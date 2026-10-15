import { DEFAULT_LOT_OCCUPANCY, isLotOccupancy } from "../../utils/cultureLotOccupancy";
import { measureProcessing, type ProcessingProfiler } from "../../utils/processingProfiler";
import { residentialStoreys } from "../../utils/urbanMorphology";
import type { HousingFitStats, Zone, ZoneCounts } from "../types/contracts/fitImportedHousing";
import type { CityDocument } from "../types/document";
import { buildBlockFabric, type DistrictFabric } from "./blockInfill";
import type { BuildingLot } from "./buildingLots";
import { nearestOnPolyline, polygonCentroid } from "./geom";
import { FabricCache } from "./localInfill";
import { facePoints } from "./mesh";
import { applyResidentialStoreys, measureHousingCapacity } from "./residentialCapacity";

/** Accepted |houses − dwellings| / dwellings for the fast default fit. */
export const HOUSING_FIT_TOLERANCE = 0.1;

/** Fill order: every lot of a zone before the next takes any house. */
const FILL_ORDER: readonly Zone[] = ["core", "between", "outskirts"];
const WALLED: readonly Zone[] = ["core", "between"];

function faceZone(document: CityDocument, faceId: string): Zone | null {
  const properties = document.mesh.faces[faceId]?.properties;
  if (properties?.settlement === "outskirts") return "outskirts";
  if (properties?.settlement !== "core") return null;
  return properties.wallRing !== undefined && properties.wallRing > 0 ? "between" : "core";
}

function houseCount(
  document: CityDocument,
  profiler?: ProcessingProfiler,
  onFabric?: (fabric: DistrictFabric) => void
): ZoneCounts {
  const fabric = measureProcessing(profiler, "block-fabric", () =>
    buildBlockFabric(document, new FabricCache(), profiler)
  );
  onFabric?.(fabric);
  const buildings = fabric.buildings;
  return measureProcessing(profiler, "residential-count", () => {
    const counts: ZoneCounts = { core: 0, between: 0, outskirts: 0 };
    for (const lot of buildings) {
      const zone = faceZone(document, lot.faceId);
      if (!zone) continue;
      if (lot.landmark || (lot.role && lot.role !== "main") || (lot.uses && !lot.uses.includes("residential")))
        continue;
      counts[zone]++;
    }
    return counts;
  });
}

/** Fit FMG households by scaling occupancy, preserving metre-scale houses
 * and streets. FMG sizes the town for the culture's Lot occupancy guide, so
 * the guide is counted first and usually fits. Otherwise each zone's count is
 * close to proportional to its occupancy: the core fills first, up to every
 * lot, then (double walls) the town between the curtains, and the outskirts
 * take the remainder. Outskirts stay roadside ribbon unless every walled lot
 * is short; only then are they opened as suburb blocks.
 * A sparsely populated town must not enlarge its houses. */
export function fitImportedHousing(
  document: CityDocument,
  dwellings: number,
  targetOccupancy = DEFAULT_LOT_OCCUPANCY,
  profiler?: ProcessingProfiler,
  cache?: FabricCache,
  /** Called with each fabric the fit builds (not with counts derived from one). */
  onFabric?: (fabric: DistrictFabric) => void
): HousingFitStats {
  if (document.urbanMorphology && document.urbanGrowth)
    return fitMorphologyHousing(document, dwellings, profiler, cache, onFabric);
  const guide = isLotOccupancy(targetOccupancy) ? targetOccupancy : DEFAULT_LOT_OCCUPANCY;
  const stats: HousingFitStats = {
    dwellings,
    targetOccupancy: guide,
    districts: 0,
    initialHouses: null,
    finalHouses: null,
    factor: 1,
    betweenFactor: 1,
    outskirtsFactor: 1,
    suburbs: false,
    samples: []
  };
  if (!document.fabric || !(dwellings > 0) || !Number.isFinite(dwellings)) return { ...stats, skipped: "no-fabric" };
  if (document.buildingPattern === "medieval" || document.fabric.version === 5)
    return { ...stats, skipped: "medieval" };
  if (document.layout === "bram" || document.layout === "circulade") return { ...stats, skipped: document.layout };
  const districts = document.fabric.districts.filter(
    district =>
      !district.faceIds.some(id => document.mesh.faces[id]?.properties.locked) &&
      district.faceIds.some(id => {
        const face = document.mesh.faces[id];
        return (
          face?.properties.buildable &&
          (face.properties.settlement === "core" || face.properties.settlement === "outskirts") &&
          !["castle", "farm", "park", "cemetery", "empty"].includes(face.properties.ward ?? "empty")
        );
      })
  );
  stats.districts = districts.length;
  if (!districts.length) return { ...stats, skipped: "no-districts" };
  const occupancies = districts.map(district => district.parameters.occupancy);
  const zoneOf = districts.map<Zone>(district => {
    const zones = district.faceIds.map(id => faceZone(document, id));
    return zones.includes("core") ? "core" : zones.includes("between") ? "between" : "outskirts";
  });
  const present = (zone: Zone) => zoneOf.includes(zone);
  // A district cannot retain more than every eligible lot.
  const ceiling: ZoneCounts = { core: Infinity, between: Infinity, outskirts: Infinity };
  for (const [index, zone] of zoneOf.entries())
    ceiling[zone] = Math.min(ceiling[zone], 1 / Math.max(occupancies[index], 1e-6));
  // Aim just above the dwellings, but accept the fast default's ±10%: a
  // seeded plot stream moves small towns by 5–10% between close occupancies,
  // so a tighter window only bounces. A high-precision mode may refine this.
  const target = dwellings * 1.025;
  const fits = (count: number) => Math.abs(count - dwellings) <= dwellings * HOUSING_FIT_TOLERANCE;
  let suburbs = false;
  let bestSuburbs = false;
  const apply = (factors: ZoneCounts, withSuburbs: boolean) => {
    for (const [index, district] of districts.entries()) {
      district.parameters.occupancy = occupancies[index] * factors[zoneOf[index]];
      if (zoneOf[index] === "outskirts" && withSuburbs) district.parameters.suburb = true;
      else delete district.parameters.suburb;
    }
  };
  const total = (counts: ZoneCounts) => counts.core + counts.between + counts.outskirts;
  const start = (zone: Zone) => Math.min(guide, ceiling[zone]);
  let factors: ZoneCounts = { core: start("core"), between: start("between"), outskirts: start("outskirts") };
  let best = factors;
  apply(factors, suburbs);
  let counts = measureProcessing(profiler, "initial-house-count", () => houseCount(document, profiler, onFabric));
  stats.initialHouses = stats.finalHouses = total(counts);
  stats.finalZones = counts;
  let bestError = Math.abs(total(counts) - target);
  // Houses per unit factor in each zone, from the latest count that drew any.
  const rate: ZoneCounts = { core: 0, between: 0, outskirts: 0 };
  for (let step = 0; step < 6 && !fits(total(counts)); step++) {
    for (const zone of FILL_ORDER) if (counts[zone] > 0 && factors[zone] > 0) rate[zone] = counts[zone] / factors[zone];
    const full = (zone: Zone) => (present(zone) ? rate[zone] * ceiling[zone] : 0);
    const hasOutskirts = present("outskirts");
    let nextSuburbs: boolean = suburbs;
    const next: ZoneCounts = { ...factors };
    // Walled zones in order: every earlier zone full, this one sized to the rest.
    let before = 0;
    let settled = false;
    for (const zone of WALLED) {
      if (!present(zone)) continue;
      const last = zone === "between" || !present("between");
      if (before + full(zone) >= target || (last && !hasOutskirts)) {
        next[zone] = rate[zone] > 0 ? Math.min(ceiling[zone], (target - before) / rate[zone]) : ceiling[zone];
        for (const later of WALLED.slice(WALLED.indexOf(zone) + 1)) if (present(later)) next[later] = 0;
        next.outskirts = hasOutskirts && !suburbs ? factors.outskirts : 0;
        settled = true;
        break;
      }
      next[zone] = ceiling[zone];
      before += full(zone);
    }
    if (!settled) {
      if (!suburbs) {
        // Open the outskirts as suburb blocks; their rate is measured next.
        nextSuburbs = true;
        rate.outskirts = 0;
        next.outskirts = Math.min(guide, ceiling.outskirts);
      } else next.outskirts = rate.outskirts > 0 ? Math.min(ceiling.outskirts, (target - before) / rate.outskirts) : 0;
    }
    // A short town keeps every lot it has; nothing changes, so stop.
    if (FILL_ORDER.every(zone => next[zone] === factors[zone]) && nextSuburbs === suburbs) break;
    factors = next;
    suburbs = nextSuburbs;
    apply(factors, suburbs);
    counts = measureProcessing(profiler, "sample-house-count", () => houseCount(document, profiler, onFabric));
    stats.samples.push([factors.core, factors.outskirts, total(counts)]);
    const error = Math.abs(total(counts) - target);
    if (error < bestError) {
      bestError = error;
      best = factors;
      bestSuburbs = suburbs;
      stats.finalHouses = total(counts);
      stats.finalZones = counts;
    }
  }
  apply(best, bestSuburbs);
  stats.factor = best.core;
  stats.betweenFactor = present("between") ? best.between : best.core;
  stats.outskirtsFactor = best.outskirts;
  stats.suburbs = bestSuburbs;
  return stats;
}

/** Capacity fit for every fabric style. Eligibility is always enforced by the final region mask. */
function fitMorphologyHousing(
  document: CityDocument,
  dwellings: number,
  profiler?: ProcessingProfiler,
  sharedCache?: FabricCache,
  onFabric?: (fabric: DistrictFabric) => void
): HousingFitStats {
  const plan = document.urbanGrowth!;
  if (document.fabric)
    for (const district of document.fabric.districts) {
      const faces = district.faceIds.map(id => document.mesh.faces[id]).filter(Boolean);
      if (faces.some(f => f.properties.locked)) continue;
      if (
        faces.some(
          f =>
            f.properties.settlement === "outskirts" &&
            plan.regions.some(
              r => nearestOnPolyline(polygonCentroid(facePoints(document.mesh, f)), r.points).dist < r.halfWidth
            )
        )
      ) {
        district.parameters.suburb = true;
      } else delete district.parameters.suburb;
    }
  // The fit only changes district occupancy and storeys after this point. Each lot keeps the
  // random draw its occupancy test used (`BuildingLot.occupancyDraw`), so a lower occupancy
  // drops exactly the lots whose draw it no longer exceeds, and storeys are only stamped on
  // the residential lots: both are counted from one built fabric instead of a rebuild each.
  // Only a higher occupancy than the built one needs another build.
  const cache = sharedCache ?? new FabricCache(512);
  const districts = document.fabric?.districts ?? [];
  let built: { lots: BuildingLot[]; occupancy: number[] } | null = null;
  const lotsAtCurrentParameters = (): BuildingLot[] => {
    if (built && districts.every((d, i) => d.parameters.occupancy <= built!.occupancy[i])) {
      const lowered = new Map<string, number>();
      districts.forEach((d, i) => {
        if (d.parameters.occupancy < built!.occupancy[i])
          for (const id of d.faceIds) lowered.set(id, d.parameters.occupancy);
      });
      const kept = lowered.size
        ? built.lots.filter(lot => {
            const occupancy = lowered.get(lot.faceId);
            return occupancy === undefined || lot.occupancyDraw === undefined || lot.occupancyDraw < occupancy;
          })
        : built.lots;
      return applyResidentialStoreys(document, kept);
    }
    const fabric = buildBlockFabric(document, cache, profiler);
    onFabric?.(fabric);
    built = { lots: fabric.buildings, occupancy: districts.map(d => d.parameters.occupancy) };
    return fabric.buildings;
  };
  const count = () =>
    measureProcessing(profiler, "count", () => measureHousingCapacity(document, lotsAtCurrentParameters(), dwellings));
  let report = count();
  const stats: HousingFitStats = {
    dwellings,
    capacityBased: true,
    targetOccupancy: 0.8,
    districts: document.fabric?.districts.length ?? 0,
    initialHouses: report.capacityInside + report.capacityOutside,
    finalHouses: 0,
    factor: 1,
    betweenFactor: 1,
    outskirtsFactor: 1,
    suburbs: plan.regions.length > 0,
    samples: []
  };
  const targetInside = Math.max(0, dwellings - Math.min(report.capacityOutside, plan.outsideBudget));
  const original = document.fabric?.districts.map(d => d.parameters.occupancy) ?? [];
  let multiplier = report.capacityInside > 0 ? Math.min(1, (targetInside / report.capacityInside) * 1.025) : 1;
  const adjustable =
    document.fabric?.districts
      .map((d, i) => ({ d, i }))
      .filter(
        ({ d }) =>
          !d.faceIds.some(id => document.mesh.faces[id]?.properties.locked) &&
          d.faceIds.some(id => document.mesh.faces[id]?.properties.settlement === "core")
      ) ?? [];
  const apply = () =>
    adjustable.forEach(({ d, i }) => {
      d.parameters.occupancy = Math.min(1, original[i] * multiplier);
    });
  apply();
  report = count();
  const maxStoreys = residentialStoreys(document.urbanMorphology!.period).maximum;
  // A bounded fit: use wall capacity first, then legal storeys; never enlarge the ribbon mask.
  for (let attempt = 0; attempt < 3 && report.unplacedDwellings > 0; attempt++) {
    if (adjustable.some(({ d }) => d.parameters.occupancy < 0.999)) {
      adjustable.forEach(({ d, i }) => {
        d.parameters.occupancy = 1;
        original[i] = 1;
      });
      multiplier = 1;
    } else if (plan.insideStoreys < maxStoreys) plan.insideStoreys++;
    else break;
    report = count();
    const target = dwellings - Math.min(report.capacityOutside, plan.outsideBudget);
    if (report.capacityInside > target * 1.05 && adjustable.length) {
      adjustable.forEach(({ d, i }) => {
        original[i] = d.parameters.occupancy;
      });
      multiplier = Math.min(1, (target / report.capacityInside) * 1.04);
      apply();
      report = count();
    }
    stats.samples.push([multiplier, 1, report.capacityInside + report.capacityOutside]);
  }
  document.housingCapacity = report;
  stats.factor = stats.betweenFactor = multiplier;
  stats.finalHouses = report.capacityInside + report.capacityOutside;
  stats.finalZones = { core: report.capacityInside, between: 0, outskirts: report.capacityOutside };
  return stats;
}
