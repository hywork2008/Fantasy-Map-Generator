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
  /** Why the fit did not run; absent when it ran. */
  skipped?: string;
  /** Districts whose occupancy the fit may scale. */
  districts: number;
  /** Houses drawn with the initial (unscaled) occupancy. */
  initialHouses: number | null;
  finalHouses: number | null;
  /** Multiplier applied to every district's initial occupancy. */
  factor: number;
  /** Rebuilds after the initial count, each `[factor, houses]`. */
  samples: Array<[number, number]>;
}

/** Fit FMG households by reducing occupancy, preserving metre-scale houses
 * and streets. A sparsely populated town must not enlarge its houses to fill
 * the same editing cells. */
export function fitImportedHousing(
  document: CityDocument,
  dwellings: number,
  profiler?: ProcessingProfiler
): HousingFitStats {
  const stats: HousingFitStats = {
    dwellings,
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
  // Discrete plots need modest headroom; aim halfway into the 0–5% allowance.
  const maximum = Math.ceil(dwellings * 1.05);
  const target = (dwellings + maximum) / 2;
  const originalCount = measureProcessing(profiler, "initial-house-count", () => houseCount(document, profiler));
  stats.initialHouses = stats.finalHouses = originalCount;
  if (originalCount <= maximum) return stats;
  const apply = (factor: number) => {
    for (const [index, district] of districts.entries()) district.parameters.occupancy = occupancies[index] * factor;
  };
  let bestFactor = 1;
  let bestError = Math.abs(originalCount - target);
  const sample = (factor: number): number => {
    apply(factor);
    const count = measureProcessing(profiler, "sample-house-count", () => houseCount(document, profiler));
    const error = Math.abs(count - target);
    stats.samples.push([factor, count]);
    if (error < bestError) {
      bestError = error;
      bestFactor = factor;
      stats.finalHouses = count;
    }
    return count;
  };
  const fits = (count: number) => count >= dwellings && count <= maximum;
  let low = 0;
  let high = 1;
  let count = sample(Math.min(1, target / originalCount));
  // Occupancy changes only the number of occupied plots; plot dimensions stay
  // fixed. Keep the closest seeded result if whole-house quantisation prevents
  // a count inside the allowance.
  for (let step = 0; step < 10 && !fits(count); step++) {
    const middle = (low + high) / 2;
    if (middle === low || middle === high) break;
    count = sample(middle);
    if (count > target) high = middle;
    else low = middle;
  }
  apply(bestFactor);
  stats.factor = bestFactor;
  return stats;
}
