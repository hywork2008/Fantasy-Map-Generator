import { minmax, rn } from "../../hostUtils";
import { getMarketCellColumn, getMarkets, getWorldContext } from "../economyContext";

export const GROSS_FOOD_NEED = 0.43;
export const RURAL_MARKETABLE_SHARE = 0.7;

// デフォルトの四半期ごとの生産の重み（春夏秋冬など）。合計1.0
// ここで重みを変更することで、収穫期の過剰や農閑期の逼迫を演出できる
export const DEFAULT_QUARTERLY_WEIGHTS = [0.25, 0.25, 0.25, 0.25];

export class FoodProductionModule {
  private get worldContext() {
    return getWorldContext();
  }

  generateQuarterlyLedger(quarterIndex: number) {
    const pack = this.worldContext.pack;
    const markets = getMarkets();
    const marketCellColumn = getMarketCellColumn();

    if (!markets.length || !pack.cells || !pack.burgs) return;

    const populationRate = this.worldContext.populationRate ?? 1000;
    const urbanization = this.worldContext.urbanization ?? 1;

    const safeQuarterIndex = Math.max(0, Math.min(3, Math.floor(quarterIndex % 4)));
    const quarterWeight = DEFAULT_QUARTERLY_WEIGHTS[safeQuarterIndex] ?? 0.25;

    for (const market of markets) {
      let ruralPopulation = 0;
      let annualFoodProduced = 0;

      for (const cellId of pack.cells.i) {
        if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;

        const rural = pack.cells.pop[cellId] * populationRate;
        const capacity = pack.cells.capacity[cellId] * populationRate;
        const saturation = capacity > 0 ? rural / capacity : 0;
        const cultivation = minmax(0.25 + 0.75 * saturation, 0.25, 1);

        ruralPopulation += rural;
        annualFoodProduced += capacity * GROSS_FOOD_NEED * cultivation;
      }

      const urbanPopulation = pack.burgs
        .filter(b => b.i && !b.removed && b.market === market.i)
        .reduce((sum, b) => sum + (b.population ?? 0) * populationRate * urbanization, 0);

      const annualRuralNeed = ruralPopulation * GROSS_FOOD_NEED;
      const annualUrbanNeed = urbanPopulation * GROSS_FOOD_NEED;
      const annualTargetStock = (ruralPopulation * 0.17 + urbanPopulation * 0.33) * GROSS_FOOD_NEED;

      // 生産量は四半期の重みに応じるが、需要は一定とする
      const foodProduced = rn(annualFoodProduced * quarterWeight, 2);
      const ruralNeed = rn(annualRuralNeed * 0.25, 2);
      const urbanNeed = rn(annualUrbanNeed * 0.25, 2);

      const ruralSurplus = foodProduced - ruralNeed;
      const foodBalance = ruralSurplus - urbanNeed;

      const exportable = rn(Math.max(0, foodBalance) * RURAL_MARKETABLE_SHARE, 2);
      const importNeed = rn(Math.max(0, -foodBalance), 2);
      const targetStock = rn(annualTargetStock, 2);

      market.foodLedger = {
        foodProduced,
        ruralNeed,
        urbanNeed,
        exportable,
        importNeed,
        targetStock
      };
    }
  }
}

export const FoodProduction = new FoodProductionModule();
