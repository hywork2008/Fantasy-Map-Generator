/**
 * Herds at world birth (docs/plan/livestock-world-birth-herds.md, B1). A generated world has been
 * farmed for centuries, so its pasture, herders and herds start settled together, like its towns and
 * people. Pasture follows the herders the land plan can staff and herders follow the herd, so placing
 * herds once at the first plan's small capacity left cattle and horses decades behind (§7.72, B0).
 * The birth state is found by iterating the runtime plan: place every managed herd at its supported
 * size, re-plan land and occupations for those herds, and repeat until pasture stops moving.
 * Herds placed here are part of the initial world, not animals created during the simulation.
 */
import { getOrCreateFaunaStockTable } from "../context/cellTables";
import { getEconomySlice, getSimulationContext, getWorldContext } from "../context/economyApi";
import { getGoods } from "../context/trade";
import { getDomesticatedCarryingCapacity, getRuralEcosystemDetail, isManagedHerdGood } from "./faunaPopulation";
import type { FaunaCohorts } from "./faunaPopulationTypes";
import { isGoodEnabled } from "./goods-generator";
import { stockWorldBirthHay } from "./livestockFeed";

/** Saved in the economy slice once a world's birth herds are settled. */
const WORLD_BIRTH_HERDS_KEY = "livestockWorldBirthHerds";
const WORLD_BIRTH_HERDS_VERSION = 1;
/** Each land plan closes half the gap to the staffed pasture (PASTURE_ANNUAL_EXPANSION). */
export const WORLD_BIRTH_MAX_ROUNDS = 12;
/** Stop once total pasture moves less than this share between rounds. */
export const WORLD_BIRTH_PASTURE_TOLERANCE = 0.01;

/** Young/breeding/old shares of herds settled at their supported size, measured right after the
 * January renewal (World 1312, B0). Species without a settled sample use the default. */
const SETTLED_COHORT_SPLIT: Readonly<Record<string, FaunaCohorts>> = {
  Cattle: { young: 0.39, breeding: 0.56, old: 0.05 },
  Horses: { young: 0.4, breeding: 0.56, old: 0.04 },
  Sheep: { young: 0.36, breeding: 0.6, old: 0.04 },
  Goats: { young: 0.39, breeding: 0.57, old: 0.04 }
};
const DEFAULT_SETTLED_COHORT_SPLIT: FaunaCohorts = { young: 0.38, breeding: 0.56, old: 0.06 };

function totalPastureHectares(): number {
  let total = 0;
  for (const budget of Object.values(getWorldContext().pack.landUse?.cells ?? {}))
    for (const patch of budget.patches)
      if (patch.kind === "pasture" || patch.kind === "wood_pasture") total += patch.areaHa;
  return total;
}

function placeSettledHerds(): void {
  const table = getOrCreateFaunaStockTable();
  const cells = getWorldContext().pack.cells;
  if (!table || !cells?.i?.length) return;
  const goods = getGoods().filter(good => isManagedHerdGood(good.name) && isGoodEnabled(good));
  for (const cellId of cells.i) {
    if ((cells.h[cellId] ?? 0) < 20 || !(cells.pop[cellId] > 0)) continue;
    for (const good of goods) {
      const key = `${cellId}:${good.name}`;
      const heads = getDomesticatedCarryingCapacity(cellId, good, 0);
      if (!(heads > 0)) {
        delete table[key];
        continue;
      }
      const split = SETTLED_COHORT_SPLIT[good.name] ?? DEFAULT_SETTLED_COHORT_SPLIT;
      table[key] = { young: heads * split.young, breeding: heads * split.breeding, old: heads * split.old };
    }
  }
}

/** True for a world that has not been advanced since generation. */
export function isUnadvancedWorld(): boolean {
  return (getSimulationContext()?.tickCount ?? 0) === 0;
}

/**
 * Settles birth herds, land and occupations together. `replan` re-runs the land-use plan and the
 * occupation allocation (DevelopmentPotential.replanWorldBirth). Runs once per world; returns the rounds used,
 * or 0 when skipped.
 */
export function settleWorldBirthHerds(replan: () => void): number {
  const slice = getEconomySlice();
  if (!slice || slice[WORLD_BIRTH_HERDS_KEY] === WORLD_BIRTH_HERDS_VERSION) return 0;
  slice[WORLD_BIRTH_HERDS_KEY] = WORLD_BIRTH_HERDS_VERSION;
  if (getRuralEcosystemDetail() !== "detailed") return 0;
  let pasture = totalPastureHectares();
  let rounds = 0;
  while (rounds < WORLD_BIRTH_MAX_ROUNDS) {
    rounds++;
    placeSettledHerds();
    replan();
    const next = totalPastureHectares();
    const settled = Math.abs(next - pasture) <= WORLD_BIRTH_PASTURE_TOLERANCE * Math.max(next, pasture);
    pasture = next;
    if (settled) break;
  }
  placeSettledHerds();
  stockWorldBirthHay();
  return rounds;
}

/** Marks an already advanced world as settled, so a later load never re-seeds its herds. */
export function markWorldBirthHerdsSettled(): void {
  const slice = getEconomySlice();
  if (slice) slice[WORLD_BIRTH_HERDS_KEY] = WORLD_BIRTH_HERDS_VERSION;
}
