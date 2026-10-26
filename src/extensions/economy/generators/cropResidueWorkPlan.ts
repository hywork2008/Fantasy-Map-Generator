/** A labor request against the crop calendar, never a credit of future feed. */
import type { WorldContext } from "../../hostCore";
import {
  getCultivableArea,
  getCultivatedArea,
  getFoodPotential,
  getGoods,
  getIrrigatedArea,
  getIrrigationDeliveredWater
} from "../economyContext";
import { getCropOutputMix } from "./agriculturalLandUse";
import { CROP_RESIDUE_POLICY as p } from "./cropResidues";
import { WAIN_KG } from "./goodMeasureCatalog";
import { getSeasonalCropPlan, readAgriculturalClimate } from "./seasonalCropClimate";
import { isWinterPreparationSeason } from "./winterSlaughter";
import { WINTER_SLAUGHTER_POLICY } from "./winterSlaughterPolicy";

export function getCropResidueWorkPlan(world: Readonly<WorldContext>, cell: number, annualFeedNeedKg: number) {
  const none = { annualDays: 0, monthlyWeights: Array<number>(12).fill(0) };
  if (
    world.options.winterLivestockSlaughter !== "experimental-temperate" ||
    world.options.ruralEcosystemDetail === "simplified" ||
    !(annualFeedNeedKg > 0)
  )
    return none;
  const climate = readAgriculturalClimate(world, cell);
  if (climate.year < WINTER_SLAUGHTER_POLICY.firstYear || climate.year > WINTER_SLAUGHTER_POLICY.lastYear) return none;
  const temperatures = Array.from(climate.monthlyMeanTemperatureC);
  if (!temperatures.some((_, month) => isWinterPreparationSeason(temperatures, month))) return none;
  const area = getCultivableArea()[cell] ?? 0;
  const annualUnits =
    (getFoodPotential()[cell] ?? 0) * Math.min(1, Math.max(0, getCultivatedArea()[cell] ?? 0) / Math.max(1e-6, area));
  if (!(annualUnits > 0)) return none;
  const entries = getCropOutputMix(
    world,
    cell,
    getGoods().filter(good => good.crop),
    {
      climateByCell: id => readAgriculturalClimate(world, id),
      irrigationAtCell: id => {
        const ha = getIrrigatedArea()[id] ?? 0;
        return {
          irrigated: ha > 0,
          supplement: ha > 0 ? (getIrrigationDeliveredWater()[id] ?? 0) / ha : 0,
          fraction: Math.min(1, ha / Math.max(getCultivableArea()[id] ?? 0, 1e-6))
        };
      }
    }
  );
  const generatedByMonth = Array<number>(12).fill(0);
  for (const entry of entries) {
    if (
      !["Wheat", "Rye", "Barley", "Oats"].includes(entry.good.name) ||
      entry.good.crop?.kind !== "cereal" ||
      entry.good.unit !== "wain"
    )
      continue;
    const weights = getSeasonalCropPlan(entry.good.crop.calendar, climate, entry.irrigated ?? false).calendar
      .harvestWeights;
    const dm = annualUnits * entry.share * WAIN_KG * p.grainDryMatterShare * p.residueDmPerGrainDm;
    for (let month = 0; month < 12; month++) generatedByMonth[month] += dm * weights[month];
  }
  const generated = generatedByMonth.reduce((sum, kg) => sum + kg, 0);
  if (!(generated > 0)) return none;
  const seasonalFeedKg = (annualFeedNeedKg * p.maximumRationShare * p.reservePeriods) / 12;
  const collectKg = Math.min(generated * p.strawShare, seasonalFeedKg / p.strawFeedEquivalent);
  const accessKg = Math.min(generated * p.stubbleShare, seasonalFeedKg / p.stubbleFeedEquivalent);
  const collectDays = (collectKg * p.collectionDaysPerTonne) / 1000;
  const accessDays = (accessKg * p.accessDaysPerTonne) / 1000;
  const annualDays = collectDays + accessDays;
  const daysByMonth = Array<number>(12).fill(0);
  for (let month = 0; month < 12; month++) {
    const share = generatedByMonth[month] / generated;
    daysByMonth[month] += collectDays * share;
    for (let ahead = 0; ahead < p.reservePeriods; ahead++)
      daysByMonth[(month + ahead) % 12] += (accessDays * share) / p.reservePeriods;
  }
  return { annualDays, monthlyWeights: daysByMonth.map(days => (annualDays > 0 ? days / annualDays : 0)) };
}
