/**
 * Underground food web — Phase 3 of docs/plan/underground-realm-and-supernatural-areas.md §4.
 *
 * Replaces dwarf.md §6's flat `capacityMultiplier` constant with a computed capacity from three
 * primary-production channels (§4.2):
 *   - **Geothermal chemosynthesis** — volcanic geology (`biomeHasTag(..., "volcanic")`) gives a
 *     domain a food source independent of the surface entirely.
 *   - **Organic seepage** — a fraction of the cell directly overhead's own surface productivity
 *     (`subsistenceNonAgriculturalCapacity`, always present once `generateSubsistenceCapacity`
 *     has run) drains down. This is the deliberate link back to biome (§5.2's answer to
 *     feature-gaps §4-3): a cavern under a rich forest is fed; one under tundra/desert starves.
 *   - **Fungiculture** — a fixed dwarven-technique multiplier on the above two, representing labor
 *     turning raw organic/mineral input into cultivated cavern capacity.
 * A fourth channel, Deep Worm offtake (§4.3a), is passed in as `wormOfftakePerCell` rather than
 * computed here — it depends on live danger/monster state that Phase 4 owns and that does not
 * exist at generation time; see `threatCullEffects`-adjacent wiring in `deepWormEcology.ts`.
 *
 * Kept Economy-independent (§4.5): this is a core module with no Goods/labor-allocator
 * dependency, so it produces the same numbers whether Economy is enabled or not. The race's
 * `populationCapacityMultiplier` (dwarf.md §6's original 0.3) is retained as a calibration
 * safety ceiling on this formula's output (§7.1), not as the formula itself.
 *
 * All multipliers below are placeholder constants (calibration TBD), same stance as
 * `faunaPopulation.ts`'s own module doc-comment.
 */
import { biomeHasTag } from "../data/biomeCatalog";
import type { BiomesData } from "../types/WorldState";

/** Volcanic cell's chemosynthesis yield, relative to an equivalent human-density surface cell. */
const GEOTHERMAL_DENSITY_FRACTION = 0.5;
/** Share of the overhead cell's own non-agricultural capacity that seeps down as organic input. */
const SEEPAGE_FRACTION = 0.15;
/** Dwarven fungiculture technique's multiplier on (geothermal + seepage) raw input. */
const FUNGICULTURE_MULTIPLIER = 1.4;
/** Hive brood contribution ceiling, relative to an equivalent human-density surface cell. */
const HIVE_BROOD_FRACTION = 0.2;
/** Physical ceiling: void fraction × area × reference density defines the cavity's hard capacity limit. */
const VOID_CAPACITY_DENSITY_FRACTION = 1.0;

export interface UndergroundFoodWebCells {
  readonly area: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
  readonly subterraneanVoid?: ArrayLike<number>;
  readonly subsistenceNonAgriculturalCapacity?: ArrayLike<number>;
}

export interface UndergroundClimate {
  readonly temperature?: ArrayLike<number>;
  readonly precipitation?: ArrayLike<number>;
  /** Maps a pack cell id to its grid climate index. Defaults to identity when omitted. */
  readonly gridIndexByCell?: ArrayLike<number>;
}

/**
 * Hive suitability 0..1: chasm hive foragers need above-freezing, non-desert surface conditions
 * directly overhead (§4.3b — the hive's foragers work the surface, not the cavern).
 */
function hiveSuitability(temperature: number, precipitation: number): number {
  if (temperature < -5 || temperature > 32 || precipitation < 15) return 0;
  const temperatureScore = temperature < 5 ? (temperature + 5) / 10 : temperature > 26 ? (32 - temperature) / 6 : 1;
  const precipitationScore = precipitation < 30 ? (precipitation - 15) / 15 : 1;
  return Math.max(0, Math.min(1, temperatureScore)) * Math.max(0, Math.min(1, precipitationScore));
}

/**
 * Per-cell underground capacity. `referenceDensity` is capacity-per-unit-area for an "equivalent
 * human" surface cell on this map (same normalization giant highland oikoumene uses), so the
 * formula auto-scales across map sizes instead of hard-coding absolute magic numbers.
 */
export function computeUndergroundCellCapacity(
  cellId: number,
  cells: UndergroundFoodWebCells,
  climate: UndergroundClimate,
  biomesData: Pick<BiomesData, "tags"> | undefined,
  referenceDensity: number,
  populationCapacityMultiplier: number,
  wormOfftake = 0
): number {
  const area = Math.max(cells.area[cellId] ?? 0, 1);
  const voidFraction = cells.subterraneanVoid?.[cellId] ?? 0;
  if (voidFraction <= 0) return 0;

  const biomeCode = cells.biomeCode?.[cellId];
  const isVolcanic =
    biomeCode !== undefined && !!biomesData?.tags && biomeHasTag(biomesData as BiomesData, biomeCode, "volcanic");
  const geothermal = isVolcanic ? referenceDensity * area * GEOTHERMAL_DENSITY_FRACTION : 0;
  const overheadCapacity = cells.subsistenceNonAgriculturalCapacity?.[cellId] ?? 0;
  const seepage = overheadCapacity * SEEPAGE_FRACTION;
  const fungicultureYield = (geothermal + seepage) * FUNGICULTURE_MULTIPLIER;

  const gridIndex = climate.gridIndexByCell?.[cellId] ?? cellId;
  const temperature = climate.temperature?.[gridIndex] ?? 12;
  const precipitation = climate.precipitation?.[gridIndex] ?? 45;
  const hiveBrood = hiveSuitability(temperature, precipitation) * referenceDensity * area * HIVE_BROOD_FRACTION;

  const primaryProduction = fungicultureYield + hiveBrood + Math.max(0, wormOfftake);
  const physicalCeiling = voidFraction * area * referenceDensity * VOID_CAPACITY_DENSITY_FRACTION;
  const safetyCeiling = referenceDensity * area * Math.max(0, populationCapacityMultiplier);

  return Math.max(0, Math.min(primaryProduction, physicalCeiling, safetyCeiling));
}

/** Computes capacity for every cell of a domain, keyed by cell id (sparse — only domain cells set). */
export function computeUndergroundDomainCapacity(
  domainCells: readonly number[],
  cells: UndergroundFoodWebCells,
  climate: UndergroundClimate,
  biomesData: Pick<BiomesData, "tags"> | undefined,
  referenceDensity: number,
  populationCapacityMultiplier: number,
  wormOfftakeByCell?: Readonly<Record<number, number>>
): Map<number, number> {
  const capacityByCell = new Map<number, number>();
  for (const cellId of domainCells) {
    capacityByCell.set(
      cellId,
      computeUndergroundCellCapacity(
        cellId,
        cells,
        climate,
        biomesData,
        referenceDensity,
        populationCapacityMultiplier,
        wormOfftakeByCell?.[cellId] ?? 0
      )
    );
  }
  return capacityByCell;
}
