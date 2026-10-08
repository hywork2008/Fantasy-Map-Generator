import { DEFAULT_LOT_OCCUPANCY, isLotOccupancy } from "../../../utils/cultureLotOccupancy";
import { measureProcessing, type ProcessingProfiler } from "../../../utils/processingProfiler";
import type { CityDocument } from "../types";
import { buildBlockFabric, FabricCache } from "./blockInfill";

function houseCount(document: CityDocument, profiler?: ProcessingProfiler): number {
  const buildings = measureProcessing(profiler, "block-fabric", () =>
    buildBlockFabric(document, new FabricCache(), profiler)
  ).buildings;
  return measureProcessing(
    profiler,
    "residential-count",
    () =>
      buildings.filter(lot => {
        const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
        return (
          (settlement === "core" || settlement === "outskirts") &&
          !lot.landmark &&
          (!lot.role || lot.role === "main") &&
          (!lot.uses || lot.uses.includes("residential"))
        );
      }).length
  );
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
  /** Multiplier applied to every district's default occupancy; the guide is the first. */
  factor: number;
  /** Rebuilds after the initial count, each `[factor, houses]`. */
  samples: Array<[number, number]>;
}

/** Fit FMG households by scaling occupancy, preserving metre-scale houses
 * and streets. FMG sizes the town for the culture's Lot occupancy guide, so
 * the guide is counted first and usually fits; otherwise the count is close
 * to proportional to occupancy and one linear correction normally lands. A
 * sparsely populated town must not enlarge its houses to fill the cells. */
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
  // A district cannot retain more than every eligible lot.
  const ceiling = 1 / Math.max(...occupancies, 1e-6);
  // Discrete plots need modest headroom; aim halfway into the 0–5% allowance.
  const maximum = Math.ceil(dwellings * 1.05);
  const target = (dwellings + maximum) / 2;
  const fits = (count: number) => count >= dwellings && count <= maximum;
  const apply = (factor: number) => {
    for (const [index, district] of districts.entries()) district.parameters.occupancy = occupancies[index] * factor;
  };
  let bestFactor = Math.min(guide, ceiling);
  apply(bestFactor);
  let count = measureProcessing(profiler, "initial-house-count", () => houseCount(document, profiler));
  stats.initialHouses = stats.finalHouses = count;
  let bestError = Math.abs(count - target);
  const sample = (factor: number): number => {
    apply(factor);
    const sampled = measureProcessing(profiler, "sample-house-count", () => houseCount(document, profiler));
    stats.samples.push([factor, sampled]);
    const error = Math.abs(sampled - target);
    if (error < bestError) {
      bestError = error;
      bestFactor = factor;
      stats.finalHouses = sampled;
    }
    return sampled;
  };
  // Bracket for the bisection fallback: count rises with the factor.
  let low = 0;
  let high = ceiling;
  let factor = bestFactor;
  for (let step = 0; step < 10 && !fits(count); step++) {
    if (count > target) high = factor;
    else low = factor;
    // Every eligible lot is already kept: a short town cannot grow further.
    if (low >= ceiling) break;
    // Linear estimate first; bisect when it leaves the bracket or stalls.
    let next = count > 0 ? factor * (target / count) : high;
    if (count < target && next >= ceiling) next = ceiling;
    else if (step >= 2 || !(next > low && next < high)) next = (low + high) / 2;
    if (next === factor) break;
    factor = next;
    count = sample(factor);
  }
  apply(bestFactor);
  stats.factor = bestFactor;
  return stats;
}
