import { getCropResidueState } from "../context/cropResidues";
import { isWinterSlaughterExperimentEnabled } from "../context/winterSlaughter";
import { getWorldContext } from "../economyContext";
import { creditCropResidueHarvest, residueCell } from "./cropResidues";
import { WAIN_KG } from "./goodMeasureCatalog";
import type { Good } from "./goodsGeneratorTypes";
import { readAgriculturalClimate } from "./seasonalCropClimate";
import { isWinterPreparationSeason } from "./winterSlaughter";
import { WINTER_SLAUGHTER_POLICY } from "./winterSlaughterPolicy";

/** Wain mass conversion is restricted to explicitly supported cool-season cereals. */
export function recordCropResidueHarvest(
  cellId: number,
  period: number,
  crops: readonly { good: Good; units: number }[]
): void {
  if (!isWinterSlaughterExperimentEnabled()) return;
  const year = Math.floor(period / 12);
  if (year < WINTER_SLAUGHTER_POLICY.firstYear || year > WINTER_SLAUGHTER_POLICY.lastYear) return;
  const temperatures = Array.from(readAgriculturalClimate(getWorldContext(), cellId).monthlyMeanTemperatureC);
  if (!temperatures.some((_, month) => isWinterPreparationSeason(temperatures, month))) return;
  const byGood = new Map<number, { good: Good; units: number }>();
  for (const entry of crops) {
    if (!(entry.units > 0) || !Number.isFinite(entry.units)) continue;
    if (
      !["Wheat", "Rye", "Barley", "Oats"].includes(entry.good.name) ||
      entry.good.crop?.kind !== "cereal" ||
      entry.good.unit !== "wain"
    )
      continue;
    const previous = byGood.get(entry.good.i);
    byGood.set(entry.good.i, { good: entry.good, units: (previous?.units ?? 0) + entry.units });
  }
  if (!byGood.size) return;
  const state = getCropResidueState(true);
  if (!state) return;
  for (const { good, units } of byGood.values())
    creditCropResidueHarvest(residueCell(state, cellId), period, good.i, units * WAIN_KG);
}
