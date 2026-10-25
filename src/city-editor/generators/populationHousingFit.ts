import { residentialStoreys } from "../../utils/urbanMorphology";
import type { CityDocument } from "../types/document";
import { buildBlockFabric, type DistrictFabric } from "./blockInfill";
import { hasBuildingHeightLimits } from "./buildingHeightLimits";
import { hasBuildingHeightVariation } from "./buildingHeightPolicy";
import type { GenerationObserver } from "./generationDiagnostics";
import type { FabricCache } from "./localInfill";
import { finishPopulationHousing } from "./populationHousing";
import { measureHousingCapacity } from "./residentialCapacity";

/** At most three storey passes; never move walls or relax an outside/bridge constraint. */
export function fitPopulationHousing(document: CityDocument, cache: FabricCache, observe?: GenerationObserver) {
  const plan = document.populationPlan!;
  const profile = residentialStoreys(plan.period);
  // The period's standard height first, so a bigger city is not drawn differently; only a shortfall raises it.
  const candidates = [
    { storeys: profile.standard, parcelAreaM2: 640, pass: 1 as const },
    { storeys: profile.maximum, parcelAreaM2: 640, pass: 2 as const },
    ...(!hasBuildingHeightVariation(document) && !hasBuildingHeightLimits(document)
      ? [{ storeys: profile.maximum, parcelAreaM2: 400, pass: 3 as const }]
      : [])
  ];
  let bestFabric: DistrictFabric | undefined;
  let best = candidates[0],
    unplaced = Infinity;
  for (const candidate of candidates) {
    document.populationPlan = { ...plan, housingFit: candidate };
    const start = performance.now();
    const fabric = buildBlockFabric(document, cache);
    const housing = measureHousingCapacity(document, fabric.buildings, plan.requiredDwellings);
    observe?.({
      phase: "fit-housing",
      attempt: 1,
      elapsedMs: performance.now() - start,
      counts: {
        populationPass: candidate.pass,
        unplacedDwellings: housing.unplacedDwellings
      }
    });
    if (housing.unplacedDwellings < unplaced) {
      best = candidate;
      bestFabric = fabric;
      unplaced = housing.unplacedDwellings;
    }
    if (!unplaced) break;
  }
  document.populationPlan = {
    ...plan,
    housingFit: { ...best, exhausted: !!unplaced }
  };
  // exhausted changes reporting only; geometry is the exact fabric of the best pass.
  finishPopulationHousing(document, bestFabric ?? buildBlockFabric(document, cache));
}
