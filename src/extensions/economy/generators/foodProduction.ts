import { getSeasonalAmplitude, minmax, rn } from "../../hostUtils";
import {
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFoodPotential,
  getMarketCellColumn,
  getMarkets,
  getWorldContext
} from "../economyContext";
import { GROSS_FOOD_NEED, RURAL_MARKETABLE_SHARE } from "./foodConstants";
import { resolveFoodImportNetwork } from "./foodImportNetwork";

export { GROSS_FOOD_NEED, RURAL_MARKETABLE_SHARE } from "./foodConstants";

/** Uniform fallback for legacy maps or incomplete World Configurator settings. */
export const DEFAULT_QUARTERLY_WEIGHTS = [0.25, 0.25, 0.25, 0.25] as const;

export type QuarterlyFoodWeights = readonly [number, number, number, number];

type FoodSeasonalitySettings = {
  mapCoordinates?: { latN?: number; latS?: number };
  climate?: {
    temperatureEquator: number;
    temperatureNorthPole: number;
    temperatureSouthPole: number;
  };
};

/**
 * A deliberately mild northern-hemisphere reference harvest profile. It preserves the annual
 * total while putting a little more supply into July–September, without claiming to model a
 * specific crop calendar. Southern maps rotate this profile by half a year.
 */
const NORTHERN_HARVEST_PROFILE: QuarterlyFoodWeights = [0.2, 0.23, 0.34, 0.23];

/** Caps this global foundation below the strength of a future market- or crop-level calendar. */
const MAX_GLOBAL_SEASONAL_BLEND = 0.1;
const REFERENCE_SEASONAL_AMPLITUDE_C = 20;

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function getMapReferenceLatitude(mapCoordinates: FoodSeasonalitySettings["mapCoordinates"]): number | null {
  if (!mapCoordinates) return null;
  const { latN, latS } = mapCoordinates;
  if (isFiniteNumber(latN) && isFiniteNumber(latS)) return (latN + latS) / 2;
  if (isFiniteNumber(latN)) return latN;
  if (isFiniteNumber(latS)) return latS;
  return null;
}

function rotateHalfYear(weights: QuarterlyFoodWeights): QuarterlyFoodWeights {
  return [weights[2], weights[3], weights[0], weights[1]];
}

/**
 * Calculates one harvest-timing profile for the whole map. It intentionally uses the map's
 * reference latitude rather than individual cell locations: this is a subtle common baseline
 * for the food ledger, not a replacement for later producer-level crop calendars.
 */
export function getGlobalQuarterlyFoodWeights({
  mapCoordinates,
  climate
}: FoodSeasonalitySettings): QuarterlyFoodWeights {
  const latitude = getMapReferenceLatitude(mapCoordinates);
  if (
    latitude === null ||
    !climate ||
    !isFiniteNumber(climate.temperatureEquator) ||
    !isFiniteNumber(climate.temperatureNorthPole) ||
    !isFiniteNumber(climate.temperatureSouthPole)
  ) {
    return DEFAULT_QUARTERLY_WEIGHTS;
  }

  const amplitude = getSeasonalAmplitude(latitude, climate);
  const climateStrength = minmax(amplitude / REFERENCE_SEASONAL_AMPLITUDE_C, 0, 1);
  const blend = climateStrength * MAX_GLOBAL_SEASONAL_BLEND;
  if (blend === 0) return DEFAULT_QUARTERLY_WEIGHTS;

  const harvestProfile = latitude < 0 ? rotateHalfYear(NORTHERN_HARVEST_PROFILE) : NORTHERN_HARVEST_PROFILE;
  return [
    DEFAULT_QUARTERLY_WEIGHTS[0] + (harvestProfile[0] - DEFAULT_QUARTERLY_WEIGHTS[0]) * blend,
    DEFAULT_QUARTERLY_WEIGHTS[1] + (harvestProfile[1] - DEFAULT_QUARTERLY_WEIGHTS[1]) * blend,
    DEFAULT_QUARTERLY_WEIGHTS[2] + (harvestProfile[2] - DEFAULT_QUARTERLY_WEIGHTS[2]) * blend,
    DEFAULT_QUARTERLY_WEIGHTS[3] + (harvestProfile[3] - DEFAULT_QUARTERLY_WEIGHTS[3]) * blend
  ];
}

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
    const cultivableArea = getCultivableArea();
    const cultivatedArea = getCultivatedArea();
    const farmLaborRequired = getFarmLaborRequired();
    const foodPotential = getFoodPotential();
    const hasAgriculturalLandUse =
      cultivableArea.length === pack.cells.i.length &&
      cultivatedArea.length === pack.cells.i.length &&
      farmLaborRequired.length === pack.cells.i.length &&
      foodPotential.length === pack.cells.i.length;

    const safeQuarterIndex = Math.max(0, Math.min(3, Math.floor(quarterIndex % 4)));
    const quarterlyWeights = getGlobalQuarterlyFoodWeights({
      mapCoordinates: this.worldContext.mapCoordinates,
      climate: this.worldContext.options
    });
    const quarterWeight = quarterlyWeights[safeQuarterIndex];

    for (const market of markets) {
      let ruralPopulation = 0;
      let annualFoodProduced = 0;

      for (const cellId of pack.cells.i) {
        if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;

        const rural = pack.cells.pop[cellId] * populationRate;
        ruralPopulation += rural;
        if (hasAgriculturalLandUse) {
          const availableAdults =
            Math.max(0, pack.cells.maleAdults?.[cellId] ?? 0) + Math.max(0, pack.cells.femaleAdults?.[cellId] ?? 0);
          const requiredAdults = Math.max(0, farmLaborRequired[cellId] ?? 0);
          const labourCoverage = requiredAdults > 0 ? minmax(availableAdults / requiredAdults, 0, 1) : 0;
          const landCoverage =
            cultivableArea[cellId] > 0 ? minmax(cultivatedArea[cellId] / cultivableArea[cellId], 0, 1) : 0;
          annualFoodProduced += foodPotential[cellId] * landCoverage * labourCoverage;
        } else {
          // Compatibility path for tests and maps created before the agricultural
          // columns exist. New economy generation always takes the land-use path.
          const capacity = pack.cells.capacity[cellId] * populationRate;
          const saturation = capacity > 0 ? rural / capacity : 0;
          const cultivation = minmax(0.25 + 0.75 * saturation, 0.25, 1);
          annualFoodProduced += capacity * GROSS_FOOD_NEED * cultivation;
        }
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
        targetStock,
        satisfiedImport: 0,
        importCapacityBonus: 0
      };
    }

    resolveFoodImportNetwork(this.worldContext);
  }
}

export const FoodProduction = new FoodProductionModule();
