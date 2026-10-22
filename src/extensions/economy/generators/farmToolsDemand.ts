import { getCultivatedArea, getMarketCellColumn, getMarkets } from "../economyContext";
import type { Good } from "./goodsGeneratorTypes";

/** "calibration TBD" — annual Tools spend per cultivated hectare that counts as full (1.0) coverage. */
export const TARGET_TOOLS_PER_HECTARE = 0.02;
/** Share of a market's liquid treasury balance that may fund Tools purchases in one year. */
export const AGTECH_BUDGET_SHARE_OF_TREASURY = 0.15;
/** EWMA smoothing: ~7 simulated years of sustained full coverage to approach agTechStock = 1. */
export const AGTECH_ADOPTION_RATE = 0.15;

/** Smaller than TARGET_TOOLS_PER_HECTARE — public infrastructure, not per-farmer tool ownership. */
export const STATE_TARGET_TOOLS_PER_HECTARE = 0.008;
/** Share of a State's treasury (not a Market's) that may fund this investment in one year. */
export const STATE_BUDGET_SHARE_OF_TREASURY = 0.1;
/** Slower institutional adoption than the market-level EWMA. */
export const STATE_ADOPTION_RATE = 0.1;

/**
 * Tools each market's farms will buy at the next annual settlement: the wear on their cultivated
 * land (`TARGET_TOOLS_PER_HECTARE`), within the treasury share the market may spend on it. This is
 * the demand trade carries Tools to (docs/plan/farm-labour-calibration.md §19); without it Tools
 * stayed in the market whose smiths made them.
 */
export function getFarmToolsDemandByMarket(toolsGood: Pick<Good, "i" | "value">): Map<number, number> {
  const cultivatedAreaByCell = getCultivatedArea();
  const marketCellColumn = getMarketCellColumn();
  const hectaresByMarket = new Map<number, number>();
  for (let cellId = 0; cellId < cultivatedAreaByCell.length; cellId++) {
    const marketId = marketCellColumn[cellId];
    const hectares = cultivatedAreaByCell[cellId] || 0;
    if (!marketId || hectares <= 0) continue;
    hectaresByMarket.set(marketId, (hectaresByMarket.get(marketId) ?? 0) + hectares);
  }

  const demandByMarket = new Map<number, number>();
  for (const market of getMarkets()) {
    const hectares = hectaresByMarket.get(market.i) ?? 0;
    if (hectares <= 0) continue;
    const price = market.goods[toolsGood.i]?.price || toolsGood.value;
    const budget = Math.max(0, market.marketTreasury?.balance ?? 0) * AGTECH_BUDGET_SHARE_OF_TREASURY;
    const demand = Math.min(hectares * TARGET_TOOLS_PER_HECTARE, price > 0 ? budget / price : 0);
    if (demand > 0) demandByMarket.set(market.i, demand);
  }
  return demandByMarket;
}
