import type { SimulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { useOptionsState } from "../store/optionsState";
import type { Culture, Race } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { isGunpowderEraMilitaryUnit } from "../utils/gunpowderEra";

/**
 * Interface for fire spirits cell status.
 */
export interface CellFireSpiritStatus {
  /** Whether fire spirits are present at the cell. */
  present: boolean;
  /** Reason for presence (e.g. "estuary", "lava", "population", or "none"). */
  reason: "estuary" | "lava" | "population" | "none";
  /** Whether fire spirits are controlled/pacified by elves. */
  controlledByElves: boolean;
  /** Whether gunpowder explosive risk is currently active (present && !controlled). */
  hazardActive: boolean;
}

/**
 * Incident result when fire spirits ignite stored gunpowder / ammunition.
 */
export interface FireSpiritExplosionIncident {
  cellId: number;
  stateId: number;
  burgId: number;
  year: number;
  gunpowderLost: number;
  bulletsLost: number;
  firearmsDamaged: number;
  civilianCasualties: number;
  militaryCasualties: number;
  description: string;
}

/**
 * Checks whether a culture practices a fireless daily life (e.g. raw meat diet).
 * Future expansion stub: returns false until raw-food cultures are formally modeled.
 */
export function isFirelessCulture(_culture: Culture | undefined | null): boolean {
  // Currently unmodeled in host cultures; stubbed for future expansion.
  return false;
}

/**
 * Checks whether a race key belongs to an elven lineage capable of controlling fire spirits.
 */
export function isElvenRaceKey(raceKey: string | undefined | null): boolean {
  if (!raceKey) return false;
  return raceKey === "elf" || raceKey === "dark_elf" || raceKey === "half_elf";
}

/**
 * Collects all cells in lava basins (lava flows, active craters, lava lakes, and lava fields).
 */
export function collectLavaBasinCells(pack: PackedGraph): Set<number> {
  const lavaCells = new Set<number>();
  if (!pack?.cells?.i) return lavaCells;

  // 1. Lava flows
  for (const flow of pack.lavaFlows ?? []) {
    for (const cellId of flow.cells) {
      lavaCells.add(cellId);
    }
  }

  // 2. Lava features (crater lakes / molten lava bodies)
  const features = pack.features ?? [];
  for (let c = 0; c < pack.cells.i.length; c++) {
    const f = pack.cells.f?.[c];
    if (f && (features[f]?.group === "lava" || (features[f] as { type?: string })?.type === "lava")) {
      lavaCells.add(c);
    }
  }

  // 3. Cooled lava field biomes
  const biomes = (pack as { biomesData?: { name?: string[] } }).biomesData ?? worldContext.biomesData;
  for (let c = 0; c < pack.cells.i.length; c++) {
    const biomeCode = pack.cells.biomeCode?.[c];
    if (biomeCode != null && biomes?.name?.[biomeCode] === "Lava field") {
      lavaCells.add(c);
    }
  }

  return lavaCells;
}

/**
 * Collects all estuary cells and their adjacent cells.
 * Estuaries are river mouths or river cells opening directly into marine havens.
 */
export function collectEstuaryAndNeighborCells(pack: PackedGraph): Set<number> {
  const estuaryCells = new Set<number>();
  if (!pack?.cells?.i) return estuaryCells;

  const { r, haven, c: neighbors } = pack.cells;
  const rivers = pack.rivers ?? [];

  // River mouths directly recorded on river models
  for (const river of rivers) {
    if (river.mouth != null && river.mouth >= 0) {
      estuaryCells.add(river.mouth);
      for (const neib of neighbors[river.mouth] ?? []) {
        estuaryCells.add(neib);
      }
    }
  }

  // Cells that have river flow and connect to ocean haven
  for (let cellId = 0; cellId < pack.cells.i.length; cellId++) {
    if (r?.[cellId] && haven?.[cellId]) {
      estuaryCells.add(cellId);
      for (const neib of neighbors[cellId] ?? []) {
        estuaryCells.add(neib);
      }
    }
  }

  return estuaryCells;
}

/**
 * Checks whether a given cell is controlled/pacified by elves.
 * A cell is considered controlled if its dominant culture is elven,
 * or if elven military forces or nobles garrison/reside there.
 */
export function isCellControlledByElves(pack: PackedGraph, cellId: number): boolean {
  const cultureId = pack.cells.culture?.[cellId];
  const cultures = pack.cultures ?? [];
  const races = (pack.races ?? []) as Race[];

  if (cultureId && cultures[cultureId]) {
    const culture = cultures[cultureId];
    const raceId = culture?.race;
    const raceKey = raceId != null ? races[raceId]?.key : undefined;
    if (isElvenRaceKey(raceKey)) {
      return true;
    }
  }

  // Check garrisoned regiments at this cell
  const stateId = pack.cells.state?.[cellId];
  if (stateId && pack.states?.[stateId]?.military) {
    for (const regiment of pack.states[stateId].military) {
      if (regiment.cell === cellId) {
        // If the regiment's state has an elven culture, it exercises elven control
        const stateCultureId = pack.states[stateId].culture;
        const stateCulture = cultures[stateCultureId];
        const stateRaceId = stateCulture?.race;
        const stateRaceKey = stateRaceId != null ? races[stateRaceId]?.key : undefined;
        if (isElvenRaceKey(stateRaceKey)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Evaluates the fire spirit status of a single cell.
 */
export function evaluateCellFireSpiritStatus(
  pack: PackedGraph,
  cellId: number,
  options?: { culturesSet?: string; fireSpiritsEnabled?: boolean },
  cachedLavaCells?: Set<number>,
  cachedEstuaryCells?: Set<number>
): CellFireSpiritStatus {
  const globalOptions = useOptionsState.getState();
  const culturesSet = options?.culturesSet ?? globalOptions.culturesSet;
  const fireSpiritsEnabled = options?.fireSpiritsEnabled ?? globalOptions.fireSpiritsEnabled;

  if (!isFantasyCulturesSet(culturesSet) || fireSpiritsEnabled === false) {
    return { present: false, reason: "none", controlledByElves: false, hazardActive: false };
  }

  const lava = cachedLavaCells ?? collectLavaBasinCells(pack);
  const estuary = cachedEstuaryCells ?? collectEstuaryAndNeighborCells(pack);

  let present = false;
  let reason: CellFireSpiritStatus["reason"] = "none";

  if (lava.has(cellId)) {
    present = true;
    reason = "lava";
  } else if (estuary.has(cellId)) {
    present = true;
    reason = "estuary";
  } else {
    // Check ordinary population (excluding military garrisons)
    const ruralPop = pack.cells.pop?.[cellId] ?? 0;
    const burgId = pack.cells.burg?.[cellId] ?? 0;
    const burgPop = (burgId > 0 && pack.burgs?.[burgId] ? pack.burgs[burgId].population : 0) ?? 0;
    const totalCivPopulation = ruralPop + burgPop;

    if (totalCivPopulation >= 1) {
      const cultureId = pack.cells.culture?.[cellId];
      const culture = cultureId ? pack.cultures?.[cultureId] : undefined;
      if (!isFirelessCulture(culture)) {
        present = true;
        reason = "population";
      }
    }
  }

  const controlledByElves = present ? isCellControlledByElves(pack, cellId) : false;
  const hazardActive = present && !controlledByElves;

  return {
    present,
    reason,
    controlledByElves,
    hazardActive
  };
}

/**
 * Simulates fire spirit interactions for a month/year advance.
 * If fire spirits are present without elven control in a cell containing gunpowder,
 * spontaneous combustion can trigger chain explosions, destroying powder/firearms and causing casualties.
 */
export function advanceFireSpirits(
  world: WorldContext,
  simulation: SimulationContext,
  rng: () => number = Math.random
): { incidents: FireSpiritExplosionIncident[]; changed: boolean } {
  const { pack, options } = world;
  const globalOptions = useOptionsState.getState();
  const culturesSet = options?.culturesSet ?? globalOptions.culturesSet;
  const fireSpiritsEnabled = options?.fireSpiritsEnabled ?? globalOptions.fireSpiritsEnabled;

  if (!isFantasyCulturesSet(culturesSet) || fireSpiritsEnabled === false) {
    return { incidents: [], changed: false };
  }

  const incidents: FireSpiritExplosionIncident[] = [];
  const lava = collectLavaBasinCells(pack);
  const estuary = collectEstuaryAndNeighborCells(pack);

  // Annual risk factor per cell with active fire spirit hazard and gunpowder presence (~5% per year)
  const EXPLOSION_CHANCE = 0.05;

  const states = pack.states ?? [];
  const burgs = pack.burgs ?? [];

  for (let s = 1; s < states.length; s++) {
    const state = states[s];
    if (!state || state.removed) continue;

    // Check regiments in this state
    for (const regiment of state.military ?? []) {
      const cellId = regiment.cell;
      if (cellId == null || cellId < 0) continue;

      const status = evaluateCellFireSpiritStatus(pack, cellId, options, lava, estuary);
      if (!status.hazardActive) continue;

      // Check if regiment has firearms / gunpowder units
      let firearmTroops = 0;
      for (const [unitName, count] of Object.entries(regiment.u ?? {})) {
        if (isGunpowderEraMilitaryUnit({ name: unitName, type: regiment.type }) && count > 0) {
          firearmTroops += count;
        }
      }

      if (firearmTroops > 0 && rng() < EXPLOSION_CHANCE) {
        // Fire spirit causes gunpowder to explode!
        const militaryCasualties = Math.max(1, Math.floor(firearmTroops * (0.2 + rng() * 0.4)));
        const civPop = pack.cells.pop?.[cellId] ?? 0;
        const civilianCasualties =
          civPop > 0 ? Math.min(civPop, Math.round(civPop * (0.05 + rng() * 0.15) * 10) / 10) : 0;

        // Apply military losses
        let remainingLoss = militaryCasualties;
        for (const [unitName, count] of Object.entries(regiment.u ?? {})) {
          if (isGunpowderEraMilitaryUnit({ name: unitName, type: regiment.type }) && count > 0) {
            const loss = Math.min(count, remainingLoss);
            regiment.u[unitName] -= loss;
            remainingLoss -= loss;
            if (remainingLoss <= 0) break;
          }
        }
        regiment.a = Object.values(regiment.u).reduce((sum, v) => sum + v, 0);

        // Apply civilian losses if any
        if (civilianCasualties > 0 && pack.cells.pop) {
          pack.cells.pop[cellId] = Math.max(0, pack.cells.pop[cellId] - civilianCasualties);
        }

        const burgId = pack.cells.burg?.[cellId] ?? 0;
        const burgName = burgId > 0 && burgs[burgId] ? burgs[burgId].name : undefined;

        incidents.push({
          cellId,
          stateId: s,
          burgId,
          year: simulation.currentYear,
          gunpowderLost: firearmTroops * 2,
          bulletsLost: firearmTroops * 10,
          firearmsDamaged: militaryCasualties,
          civilianCasualties,
          militaryCasualties,
          description: `Fire spirits triggered a catastrophic gunpowder explosion in ${burgName ? `burg ${burgName}` : `cell ${cellId}`}! Ammo detonated in sequence, causing severe injuries and losses.`
        });
      }
    }
  }

  return {
    incidents,
    changed: incidents.length > 0
  };
}
