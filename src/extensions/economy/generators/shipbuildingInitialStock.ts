import type { Burg, ShipbuildingMaterialId, ShipbuildingStrategicProcurementDemand, State } from "../../hostTypes";
import { SHIPBUILDING_MATERIAL_IDS } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext } from "../economyContext";
import type { Market } from "./marketTypes";

/**
 * New-map initial stock warm-up for state-owned shipyards
 * (docs/plan/shipbuilding-industrial-policy.md §4.6, rationale in
 * docs/analytics/shipbuilding-goods-biome-distribution.md). Seeds market stock directly, once, at
 * generation time — never spends treasury or spawns Caravans/ProcurementOrders, unlike
 * StrategicProcurement's continuous reactive procurement (strategicProcurement.ts), which this
 * module never calls.
 */

// Raw goods whose biomeOutput approximates each shipbuilding material's local production chain
// (goods-generator.ts GOODS_DATA): Tar's only recipe is Wood; Ropes' only recipe is Hemp; Sails'
// recipe (Cloth) accepts Sheep or Hemp (Silk, Cloth's third option, has no biomeOutput to sample).
const MATERIAL_RAW_GOOD_NAMES: Record<ShipbuildingMaterialId, readonly string[]> = {
  Wood: ["Wood"],
  Tar: ["Wood"],
  Ropes: ["Hemp"],
  Sails: ["Sheep", "Hemp"]
};

// Tar/Ropes/Sails ramp up slowly (strategicLaborMarkets.ts caps cohort reallocation at 5% of a
// market's strategic labor force per production cycle), so a cold-started map leaves them
// stranded far longer than raw Wood, which any populated forest cell already produces from tick
// one via biomeOutput. Bias initial days toward the intermediate goods and away from the raw
// material accordingly.
const INTERMEDIATE_GOODS: ReadonlySet<ShipbuildingMaterialId> = new Set(["Tar", "Ropes", "Sails"]);
const INTERMEDIATE_MATERIAL_BIAS = 1.5;
const RAW_MATERIAL_BIAS = 0.6;

// Mirrors StrategicGoodsPolicy's defaults (strategicProcurementPolicy.ts DEFAULT_POLICY) so the
// warm-up stock and the steady-state reserve target it hands off to sit on the same day scale.
const MIN_RESERVE_DAYS = 90;
const MAX_RESERVE_DAYS = 365;

const NAVAL_SUITABILITY_BONUS = 0.25;

// accessScore is 0..1 (see getInitialStockResult). 0.75 marks a shipyard that clearly cleared
// candidate①(裕福な国かつ港が多い) or candidate②(自給的な海洋小国) rather than landing near the
// MIN_RESERVE_DAYS floor — a tentative cutoff, tunable alongside the other §4.6 coefficients once
// docs/analytics/shipbuilding-goods-biome-distribution.md §6's multi-seed calibration lands.
const ABUNDANT_ACCESS_SCORE_THRESHOLD = 0.75;

interface StateAccessInputs {
  readonly treasuryByState: ReadonlyMap<number, number>;
  readonly portCountByState: ReadonlyMap<number, number>;
  readonly medianTreasury: number;
  readonly medianPortCount: number;
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Relative standing within the current map's own state distribution, 0..1. A state at or above
 * twice the median reads as "clearly ahead" (1); an empty/zero distribution never divides by zero. */
function normalizeToMedian(value: number, medianValue: number): number {
  if (medianValue <= 0) return value > 0 ? 1 : 0;
  return minmax(value / (medianValue * 2), 0, 1);
}

function buildStateAccessInputs(states: readonly State[], burgs: readonly Burg[]): StateAccessInputs {
  const treasuryByState = new Map<number, number>();
  const portCountByState = new Map<number, number>();

  for (const state of states) {
    if (!state.i || state.removed) continue;
    treasuryByState.set(state.i, state.treasury ?? 0);
  }
  for (const burg of burgs) {
    if (!burg.i || burg.removed || !burg.state || !burg.port) continue;
    portCountByState.set(burg.state, (portCountByState.get(burg.state) ?? 0) + 1);
  }

  return {
    treasuryByState,
    portCountByState,
    medianTreasury: median(Array.from(treasuryByState.values())),
    medianPortCount: median(Array.from(portCountByState.values()))
  };
}

function getMaterialSuitabilityBiomes(material: ShipbuildingMaterialId): Set<number> {
  const goods = getGoods();
  const biomes = new Set<number>();
  for (const rawGoodName of MATERIAL_RAW_GOOD_NAMES[material]) {
    const rawGood = goods.find(candidate => candidate.name === rawGoodName);
    for (const biomeId of Object.keys(rawGood?.biomeOutput ?? {})) biomes.add(Number(biomeId));
  }
  return biomes;
}

/** Land-cell share of `stateId` sitting in `material`'s raw-good biomes — a self-sufficiency proxy
 * for §4.6 candidate②(a small state with no wealth/port advantage but a naturally suited biome). */
function getBiomeSelfSufficiency(material: ShipbuildingMaterialId, stateId: number): number {
  const { pack } = getWorldContext();
  const biomes = getMaterialSuitabilityBiomes(material);
  if (!biomes.size) return 0;

  let landCells = 0;
  let suitableCells = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.state[cellId] !== stateId || pack.cells.h[cellId] < 20) continue;
    landCells++;
    if (biomes.has(pack.cells.biome[cellId])) suitableCells++;
  }

  return landCells > 0 ? suitableCells / landCells : 0;
}

function getLocalMaterialSuitability(material: ShipbuildingMaterialId, market: Market, stateId: number): number {
  const { pack } = getWorldContext();
  const centerBurg = pack.burgs[market.centerBurgId];
  const navalBonus = centerBurg?.type === "Naval" ? NAVAL_SUITABILITY_BONUS : 0;
  return minmax(getBiomeSelfSufficiency(material, stateId) + navalBonus, 0, 1);
}

interface InitialStockResult {
  days: number;
  /** 0..1. Exposed alongside `days` so callers can flag an unusually generous warm-up
   * independently of the raw/intermediate material bias baked into `days`. */
  accessScore: number;
}

/** §4.6's accessScore = max(wealthPath, selfSufficiencyPath): candidate①(裕福な国かつ港が多い) and
 * candidate②(自給的な海洋小国) are independent paths to a healthy warm-up stock — either is enough. */
function getInitialStockResult(
  material: ShipbuildingMaterialId,
  market: Market,
  stateId: number,
  access: StateAccessInputs
): InitialStockResult {
  const wealthFactor = normalizeToMedian(access.treasuryByState.get(stateId) ?? 0, access.medianTreasury);
  const portFactor = normalizeToMedian(access.portCountByState.get(stateId) ?? 0, access.medianPortCount);
  const wealthPath = (wealthFactor + portFactor) / 2;
  const selfSufficiencyPath = getLocalMaterialSuitability(material, market, stateId);

  const accessScore = Math.max(wealthPath, selfSufficiencyPath);
  const materialBias = INTERMEDIATE_GOODS.has(material) ? INTERMEDIATE_MATERIAL_BIAS : RAW_MATERIAL_BIAS;
  const days = MIN_RESERVE_DAYS + (MAX_RESERVE_DAYS - MIN_RESERVE_DAYS) * accessScore * materialBias;
  return { days: minmax(days, 0, MAX_RESERVE_DAYS * 1.5), accessScore };
}

/**
 * Applies the initial-stock warm-up to every (state, market) pair in `demands`. Only raises
 * stock — never lowers what the first Production.produce() pass (run earlier in the same
 * fmg:generate-post-core sequence) already placed there. Right after a new map generates, logs
 * one console.warn per shipyard market that landed a clearly generous warm-up (accessScore at or
 * above ABUNDANT_ACCESS_SCORE_THRESHOLD) — a quick eyeball check for the §4.6 calibration work in
 * docs/analytics/shipbuilding-goods-biome-distribution.md §6, without needing to open Shipyards
 * Overview for every state.
 */
export function seedShipbuildingInitialStock(demands: readonly ShipbuildingStrategicProcurementDemand[]): void {
  if (!demands.length) return;
  const { pack } = getWorldContext();
  const access = buildStateAccessInputs(pack.states, pack.burgs);
  const markets = getMarkets();
  const goods = getGoods();

  for (const demand of demands) {
    const market = markets.find(candidate => candidate.i === demand.destinationMarketId);
    const state = pack.states[demand.stateId];
    if (!market || !state || state.removed) continue;

    const abundant: string[] = [];

    for (const material of SHIPBUILDING_MATERIAL_IDS) {
      const annualDemand = demand.annualMaterials[material];
      if (!(annualDemand > 0)) continue;
      const good = goods.find(candidate => candidate.name === material);
      if (!good) continue;

      const { days, accessScore } = getInitialStockResult(material, market, demand.stateId, access);
      const targetStock = annualDemand * (days / 365);
      const existing = market.goods[good.i];
      if (!existing || existing.stock < targetStock) {
        market.goods[good.i] = { stock: rn(targetStock, 2), price: existing?.price ?? good.value };
      }

      if (accessScore >= ABUNDANT_ACCESS_SCORE_THRESHOLD) {
        abundant.push(`${material}=${market.goods[good.i].stock} (${Math.round(days)}d, access ${rn(accessScore, 2)})`);
      }
    }

    if (abundant.length) {
      console.warn(
        `[shipbuilding] Abundant initial stock — state "${state.name}" (${demand.stateId}), market ${market.i}: ${abundant.join(", ")}`
      );
    }
  }
}
