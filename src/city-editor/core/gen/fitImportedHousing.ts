import type { CityDocument } from "../types";
import { buildBlockFabric, FabricCache } from "./blockInfill";

function houseCount(document: CityDocument): number {
  return buildBlockFabric(document, new FabricCache()).buildings.filter(lot => {
    const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
    return (
      (settlement === "core" || settlement === "outskirts") &&
      !lot.landmark &&
      (!lot.role || lot.role === "main") &&
      (!lot.uses || lot.uses.includes("residential"))
    );
  }).length;
}

/** Fit FMG households by replanning the plot and street-block dimensions.
 * Occupancy stays intact so housing forms complete street walls, with shared
 * courts behind them, instead of random holes throughout the city. */
export function fitImportedHousing(document: CityDocument, dwellings: number): void {
  if (!document.fabric || !(dwellings > 0) || !Number.isFinite(dwellings)) return;
  if (document.buildingPattern === "medieval" || document.fabric.version === 5) return;
  if (document.layout === "bram" || document.layout === "circulade") return;
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
  if (!districts.length) return;
  const areas = districts.map(district => district.parameters.lotArea);
  // Discrete plots need modest headroom; aim halfway into the 0–5% allowance.
  const maximum = Math.ceil(dwellings * 1.05);
  const target = (dwellings + maximum) / 2;
  const originalCount = houseCount(document);
  if (originalCount <= maximum) return;
  const maxFactor = Math.max(...areas.map(area => 3000 / area));
  const apply = (factor: number) => {
    for (const [index, district] of districts.entries())
      district.parameters.lotArea = Math.min(3000, areas[index] * factor);
  };
  let bestFactor = 1;
  let bestError = Math.abs(originalCount - target);
  const sample = (factor: number): number => {
    apply(factor);
    const count = houseCount(document);
    const error = Math.abs(count - target);
    if (error < bestError) {
      bestError = error;
      bestFactor = factor;
    }
    return count;
  };
  const fits = (count: number) => count >= dwellings && count <= maximum;
  let low = 1;
  let high = Math.min(maxFactor, Math.max(2, originalCount / target));
  let count = sample(high);
  for (let step = 0; step < 5 && count > maximum && high < maxFactor; step++) {
    low = high;
    high = Math.min(maxFactor, high * 2);
    count = sample(high);
  }
  // Plot subdivision changes in whole rows. Keep the closest valid result
  // even when seeded splits make the count locally non-monotonic.
  for (let step = 0; step < 8 && !fits(count); step++) {
    const middle = (low + high) / 2;
    if (middle === low || middle === high) break;
    count = sample(middle);
    if (count > target) low = middle;
    else high = middle;
  }
  apply(bestFactor);
}
