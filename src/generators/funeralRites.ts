/**
 * Funeral processing: deaths consume burial materials and accumulate raisable remains.
 *
 * Remains live on simulationContext.funeral so they round-trip through .fmg archives.
 * Economy listens for `fmg:funeral-demand-batch` and debits Wood/Stone/Linen from markets.
 */
import {
  createEmptyFuneralSimulationState,
  type FuneralMaterialDemand,
  type FuneralSimulationState,
  simulationContext
} from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import {
  addFuneralMaterials,
  emptyFuneralMaterials,
  FUNERAL_FOREST_COVERAGE_PER_WOOD,
  FUNERAL_RITE_DEFINITIONS,
  type FuneralMaterialNeed,
  funeralMaterialsFor,
  hasFuneralMaterials,
  scaleFuneralMaterials
} from "../data/funeralRites";
import { isLichCulture, isUndeadRaceKey, raceKeyForId } from "../extensions/characters/lichPolicy";
import { getCultureFuneralRite } from "../utils/cultureFuneralRite";
import { harvestForestStock } from "./forestStock";

/** Assumed years of graves already in the ground at map generation. */
export const HISTORICAL_FUNERAL_YEARS = 80;
/** Crude annual death rate used only to seed historical remains (not live demography). */
export const HISTORICAL_ANNUAL_DEATH_RATE = 0.025;
/** Cap seeded remains in a cell at this multiple of the living headcount. */
const MAX_SEEDED_REMAINS_FACTOR = 5;

export const FUNERAL_DEMAND_EVENT = "fmg:funeral-demand-batch";

function getFuneralState(): FuneralSimulationState {
  const existing = simulationContext.funeral;
  if (existing && typeof existing === "object" && existing.remainsByCell) {
    if (!existing.pendingMaterialsByCell) existing.pendingMaterialsByCell = {};
    if (!existing.raisedByCell) existing.raisedByCell = {};
    if (typeof existing.seeded !== "boolean") existing.seeded = false;
    return existing;
  }
  const created = createEmptyFuneralSimulationState();
  simulationContext.funeral = created;
  return created;
}

export function resetFuneralState(): void {
  simulationContext.funeral = createEmptyFuneralSimulationState();
}

export function getFuneralRemainsAtCell(cellId: number): number {
  if (!Number.isInteger(cellId) || cellId < 0) return 0;
  return Math.max(0, getFuneralState().remainsByCell[cellId] ?? 0);
}

function addRemains(cellId: number, people: number): void {
  if (!(people > 0) || !Number.isFinite(people)) return;
  const state = getFuneralState();
  state.remainsByCell[cellId] = (state.remainsByCell[cellId] ?? 0) + people;
}

export function takeFuneralRemains(cellId: number, people: number): number {
  if (!(people > 0) || !Number.isFinite(people)) return 0;
  const state = getFuneralState();
  const current = Math.max(0, state.remainsByCell[cellId] ?? 0);
  const taken = Math.min(current, people);
  if (taken <= 0) return 0;
  const next = current - taken;
  if (next <= 1e-6) delete state.remainsByCell[cellId];
  else state.remainsByCell[cellId] = next;
  return taken;
}

function addPendingMaterials(cellId: number, need: FuneralMaterialNeed): void {
  if (!hasFuneralMaterials(need)) return;
  const state = getFuneralState();
  const current = state.pendingMaterialsByCell[cellId] ?? emptyFuneralMaterials();
  state.pendingMaterialsByCell[cellId] = addFuneralMaterials(current, need);
}

export function takePendingFuneralMaterials(): Record<number, FuneralMaterialDemand> {
  const state = getFuneralState();
  const pending = state.pendingMaterialsByCell;
  state.pendingMaterialsByCell = {};
  return pending;
}

function harvestFuneralWood(cellId: number, woodUnits: number): void {
  if (!(woodUnits > 0)) return;
  const cells = worldContext.pack?.cells;
  if (!cells) return;
  harvestForestStock(cells, cellId, woodUnits * FUNERAL_FOREST_COVERAGE_PER_WOOD);
}

function riteForCell(cellId: number) {
  const pack = worldContext.pack;
  if (!pack?.cells || !pack.cultures) return undefined;
  const cultureId = pack.cells.culture?.[cellId];
  if (!cultureId) return undefined;
  const culture = pack.cultures[cultureId];
  const rite = getCultureFuneralRite(culture);
  if (!rite) return undefined;
  return { rite, culture };
}

/**
 * Apply a funeral for `people` dead in `cellId`. No-op for non-positive amounts,
 * water/wild cells, and undead cultures (they do not bury the living).
 * Dispatches `fmg:funeral-demand-batch` when materials were queued.
 */
export function processFuneralDeaths(cellId: number, people: number): void {
  if (!Number.isInteger(cellId) || cellId < 0 || !(people > 0) || !Number.isFinite(people)) return;
  const pack = worldContext.pack;
  if (!pack?.cells || !(pack.cells.h?.[cellId] >= 20)) return;

  const resolved = riteForCell(cellId);
  if (!resolved) return;
  if (isLichCulture(pack.races, resolved.culture)) return;
  const raceKey = raceKeyForId(pack.races, resolved.culture.race);
  if (isUndeadRaceKey(raceKey)) return;

  const definition = FUNERAL_RITE_DEFINITIONS[resolved.rite];
  const remains = people * definition.remainFraction;
  if (remains > 0) addRemains(cellId, remains);

  const materials = scaleFuneralMaterials(funeralMaterialsFor(resolved.rite, resolved.culture.type), people);
  addPendingMaterials(cellId, materials);
  harvestFuneralWood(cellId, materials.wood);
}

function livingPeopleAtCell(cellId: number): number {
  const pack = worldContext.pack;
  const populationRate = worldContext.populationRate || 1;
  const urbanization = worldContext.urbanization || 1;
  if (!pack?.cells) return 0;
  const rural = (pack.cells.pop[cellId] ?? 0) * populationRate;
  const burgId = pack.cells.burg?.[cellId];
  const burg = burgId ? pack.burgs?.[burgId] : undefined;
  const urban = burg && !burg.removed ? (burg.population ?? 0) * populationRate * urbanization : 0;
  return Math.max(0, rural + urban);
}

/** Fill graveyards from implied pre-simulation deaths. Does not consume funeral goods. */
export function seedHistoricalFuneralRemains(): void {
  const pack = worldContext.pack;
  if (!pack?.cells || !pack.cultures) return;
  const state = getFuneralState();
  const cells = pack.cells;

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (cells.h[cellId] < 20) continue;
    const resolved = riteForCell(cellId);
    if (!resolved) continue;
    if (isLichCulture(pack.races, resolved.culture)) continue;
    const raceKey = raceKeyForId(pack.races, resolved.culture.race);
    if (isUndeadRaceKey(raceKey)) continue;

    const living = livingPeopleAtCell(cellId);
    if (!(living > 0)) continue;
    const deaths = living * HISTORICAL_ANNUAL_DEATH_RATE * HISTORICAL_FUNERAL_YEARS;
    const remains = Math.min(
      deaths * FUNERAL_RITE_DEFINITIONS[resolved.rite].remainFraction,
      living * MAX_SEEDED_REMAINS_FACTOR
    );
    if (remains > 0) addRemains(cellId, remains);
  }
  state.seeded = true;
}

export function ensureFuneralRemainsSeeded(): void {
  const state = getFuneralState();
  if (state.seeded) return;
  seedHistoricalFuneralRemains();
}

/** Notify Economy once after a batch of funerals queued material demand. */
export function flushFuneralDemand(): void {
  const pending = getFuneralState().pendingMaterialsByCell;
  if (!pending || !Object.keys(pending).length) return;
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(FUNERAL_DEMAND_EVENT));
}

export { getFuneralState };
