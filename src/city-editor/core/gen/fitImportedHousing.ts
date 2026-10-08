import { DEFAULT_LOT_OCCUPANCY, isLotOccupancy } from "../../../utils/cultureLotOccupancy";
import { measureProcessing, type ProcessingProfiler } from "../../../utils/processingProfiler";
import type { CityDocument } from "../types";
import { buildBlockFabric, FabricCache } from "./blockInfill";

type Zone = "core" | "outskirts";
type ZoneCounts = Record<Zone, number>;

function houseCount(document: CityDocument, profiler?: ProcessingProfiler): ZoneCounts {
  const buildings = measureProcessing(profiler, "block-fabric", () =>
    buildBlockFabric(document, new FabricCache(), profiler)
  ).buildings;
  return measureProcessing(profiler, "residential-count", () => {
    const counts: ZoneCounts = { core: 0, outskirts: 0 };
    for (const lot of buildings) {
      const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
      if (settlement !== "core" && settlement !== "outskirts") continue;
      if (lot.landmark || (lot.role && lot.role !== "main") || (lot.uses && !lot.uses.includes("residential")))
        continue;
      counts[settlement]++;
    }
    return counts;
  });
}

/** How the occupancy fit went; used by the housing batch survey. */
export interface HousingFitStats {
  dwellings: number;
  /** Culture Lot occupancy guide the fit starts from (0–1). */
  targetOccupancy: number;
  /** Why the fit did not run; absent when it ran. */
  skipped?: string;
  /** Districts whose occupancy the fit may scale. */
  districts: number;
  /** Houses drawn at the guide occupancy. */
  initialHouses: number | null;
  finalHouses: number | null;
  /** Multiplier applied to the core districts' default occupancy; the guide is the first. */
  factor: number;
  /** Multiplier applied to the outskirts districts' default occupancy. */
  outskirtsFactor: number;
  /** True when the outskirts were opened for suburb blocks. */
  suburbs: boolean;
  /** Rebuilds after the initial count, each `[core factor, outskirts factor, houses]`. */
  samples: Array<[number, number, number]>;
}

/** Fit FMG households by scaling occupancy, preserving metre-scale houses
 * and streets. FMG sizes the town for the culture's Lot occupancy guide, so
 * the guide is counted first and usually fits. Otherwise each zone's count is
 * close to proportional to its occupancy: the core fills first, up to every
 * lot, and the outskirts take the remainder. Outskirts stay roadside ribbon
 * unless the full core is short; only then are they opened as suburb blocks.
 * A sparsely populated town must not enlarge its houses. */
export function fitImportedHousing(
  document: CityDocument,
  dwellings: number,
  targetOccupancy = DEFAULT_LOT_OCCUPANCY,
  profiler?: ProcessingProfiler
): HousingFitStats {
  const guide = isLotOccupancy(targetOccupancy) ? targetOccupancy : DEFAULT_LOT_OCCUPANCY;
  const stats: HousingFitStats = {
    dwellings,
    targetOccupancy: guide,
    districts: 0,
    initialHouses: null,
    finalHouses: null,
    factor: 1,
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
  const zoneOf = districts.map<Zone>(district =>
    district.faceIds.some(id => document.mesh.faces[id]?.properties.settlement === "core") ? "core" : "outskirts"
  );
  // A district cannot retain more than every eligible lot.
  const ceiling: ZoneCounts = { core: Infinity, outskirts: Infinity };
  for (const [index, zone] of zoneOf.entries())
    ceiling[zone] = Math.min(ceiling[zone], 1 / Math.max(occupancies[index], 1e-6));
  // Discrete plots need modest headroom; aim halfway into the 0–5% allowance.
  const maximum = Math.ceil(dwellings * 1.05);
  const target = (dwellings + maximum) / 2;
  const fits = (count: number) => count >= dwellings && count <= maximum;
  let suburbs = false;
  let bestSuburbs = false;
  const apply = (factors: ZoneCounts, withSuburbs: boolean) => {
    for (const [index, district] of districts.entries()) {
      district.parameters.occupancy = occupancies[index] * factors[zoneOf[index]];
      if (zoneOf[index] === "outskirts" && withSuburbs) district.parameters.suburb = true;
      else delete district.parameters.suburb;
    }
  };
  const total = (counts: ZoneCounts) => counts.core + counts.outskirts;
  let factors: ZoneCounts = {
    core: Math.min(guide, ceiling.core),
    outskirts: Math.min(guide, ceiling.outskirts)
  };
  let best = factors;
  apply(factors, suburbs);
  let counts = measureProcessing(profiler, "initial-house-count", () => houseCount(document, profiler));
  stats.initialHouses = stats.finalHouses = total(counts);
  let bestError = Math.abs(total(counts) - target);
  // Houses per unit factor in each zone, from the latest count that drew any.
  const rate: ZoneCounts = { core: 0, outskirts: 0 };
  for (let step = 0; step < 6 && !fits(total(counts)); step++) {
    for (const zone of ["core", "outskirts"] as const)
      if (counts[zone] > 0 && factors[zone] > 0) rate[zone] = counts[zone] / factors[zone];
    // Core first: fill it to every lot before the suburbs take any houses.
    const coreFull = rate.core * ceiling.core;
    const hasOutskirts = zoneOf.includes("outskirts");
    let nextSuburbs: boolean = suburbs;
    let next: ZoneCounts;
    if (coreFull >= target || !hasOutskirts)
      next = {
        core: rate.core > 0 ? Math.min(ceiling.core, target / rate.core) : ceiling.core,
        outskirts: hasOutskirts && !suburbs ? factors.outskirts : 0
      };
    else if (!suburbs) {
      // Open the outskirts as suburb blocks; their rate is measured next.
      nextSuburbs = true;
      rate.outskirts = 0;
      next = { core: ceiling.core, outskirts: Math.min(guide, ceiling.outskirts) };
    } else
      next = {
        core: ceiling.core,
        outskirts: rate.outskirts > 0 ? Math.min(ceiling.outskirts, (target - coreFull) / rate.outskirts) : 0
      };
    // A short town keeps every lot it has; nothing changes, so stop.
    if (next.core === factors.core && next.outskirts === factors.outskirts && nextSuburbs === suburbs) break;
    factors = next;
    suburbs = nextSuburbs;
    apply(factors, suburbs);
    counts = measureProcessing(profiler, "sample-house-count", () => houseCount(document, profiler));
    stats.samples.push([factors.core, factors.outskirts, total(counts)]);
    const error = Math.abs(total(counts) - target);
    if (error < bestError) {
      bestError = error;
      best = factors;
      bestSuburbs = suburbs;
      stats.finalHouses = total(counts);
    }
  }
  apply(best, bestSuburbs);
  stats.factor = best.core;
  stats.outskirtsFactor = best.outskirts;
  stats.suburbs = bestSuburbs;
  return stats;
}
