import type { WorldContext } from "../context/worldContext";
import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { getRaceById } from "../data/races";
import { getHighestRiverSourceCell, getWatershedCellsForSource } from "./giantWaterSourceSovereignty";
import { createInitialPopulationCohorts } from "./initialPopulationCohorts";

export interface GiantHighlandOikoumene {
  cultureId: number;
  sourceCell: number;
}

/**
 * Seed the Giant homeland after ordinary human settlement has been placed.
 * Giants do not depend on crops or temperature, so their highest-source watershed remains
 * inhabited even when rankCells gave the cold highland zero human suitability. Their carrying
 * capacity is capped at one tenth of the equivalent human capacity.
 */
export function seedGiantHighlandOikoumene(
  world: WorldContext,
  culturesSet: string | undefined,
  initialPopulationSaturation: number
): GiantHighlandOikoumene | null {
  if (!isFantasyCulturesSet(culturesSet)) return null;
  const { pack } = world;
  const giantCultures = pack.cultures.filter(
    culture => culture?.i && getRaceById(pack.races, culture.race)?.key === "giant"
  );
  if (!giantCultures.length) return null;

  const sourceCell = getHighestRiverSourceCell(pack.cells, pack.rivers);
  if (sourceCell === undefined || pack.cells.h[sourceCell] < 20) return null;
  const giantCulture = [...giantCultures].sort((a, b) => a.i - b.i)[0]!;
  const giantSurvival = getRaceById(pack.races, giantCulture.race)?.environmentalSurvival;
  const populationCapacityMultiplier = giantSurvival?.populationCapacityMultiplier ?? 0.1;
  const watershed = getWatershedCellsForSource(sourceCell, pack.cells, pack.rivers);
  if (!watershed.length) return null;

  // The watershed becomes the Giant homeland before Burg/State generation. This guarantees a
  // native settlement candidate at the protected source rather than a distant lowland capital.
  giantCulture.center = sourceCell;
  giantCulture.type = "Highland";
  for (const cell of watershed) pack.cells.culture[cell] = giantCulture.i;

  const humanCells = Array.from(pack.cells.i).filter(cell => {
    const culture = pack.cultures[pack.cells.culture[cell]];
    return (pack.cells.capacity[cell] ?? 0) > 0 && getRaceById(pack.races, culture?.race)?.key !== "giant";
  });
  const humanArea = humanCells.reduce((sum, cell) => sum + Math.max(pack.cells.area[cell] ?? 0, 1), 0);
  const humanCapacity = humanCells.reduce((sum, cell) => sum + Math.max(pack.cells.capacity[cell] ?? 0, 0), 0);
  const referenceHumanDensity = humanArea > 0 ? humanCapacity / humanArea : 0.1;
  const meanArea =
    Array.from(pack.cells.i).reduce((sum, cell) => sum + Math.max(pack.cells.area[cell] ?? 0, 1), 0) /
    Math.max(pack.cells.i.length, 1);
  const highestHumanSuitability = Math.max(1, ...Array.from(pack.cells.s).filter(value => value > 0));
  const saturation = Math.min(0.6, Math.max(0.05, initialPopulationSaturation));

  for (const cell of pack.cells.i) {
    if (pack.cells.culture[cell] !== giantCulture.i || pack.cells.h[cell] < 20) continue;
    const area = Math.max(pack.cells.area[cell] ?? 0, 1);
    const equivalentHumanCapacity = Math.max(pack.cells.capacity[cell] ?? 0, referenceHumanDensity * area);
    const giantCapacity = equivalentHumanCapacity * populationCapacityMultiplier;
    const suitability = Math.max(1, Math.round((giantCapacity * meanArea) / area));
    const cohorts = createInitialPopulationCohorts(giantCapacity, saturation);

    pack.cells.capacity[cell] = giantCapacity;
    if (pack.cells.subsistenceCapacity) pack.cells.subsistenceCapacity[cell] = giantCapacity;
    if (pack.cells.subsistenceNonAgriculturalCapacity)
      pack.cells.subsistenceNonAgriculturalCapacity[cell] = giantCapacity;
    pack.cells.s[cell] = suitability;
    pack.cells.pop[cell] = cohorts.population;
    pack.cells.children[cell] = cohorts.children;
    pack.cells.maleAdults[cell] = cohorts.maleAdults;
    pack.cells.femaleAdults[cell] = cohorts.femaleAdults;
    pack.cells.elders[cell] = cohorts.elders;
  }

  // Suitability is normally both a population and capital-placement score. The source needs to
  // beat human lowland capitals on that second role, without raising its actual Giant capacity.
  pack.cells.s[sourceCell] = Math.max(pack.cells.s[sourceCell], Math.ceil(highestHumanSuitability * 4));
  return { cultureId: giantCulture.i, sourceCell };
}
