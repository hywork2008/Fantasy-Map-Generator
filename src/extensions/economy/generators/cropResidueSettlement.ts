import { getCropResidueState } from "../context/cropResidues";
import { getOrCreateLivestockFeedTable, getWorldContext } from "../economyContext";
import { prepareCropResidues } from "./cropResidues";
import { calculateHusbandryDemand } from "./husbandry";
import { getHusbandryLaborBudget } from "./husbandryLabor";
import { getLivestockMonthlyFeedNeedKg } from "./livestockFeed";
import { HAY_WORK_DAYS_PER_TONNE_DM } from "./livestockFeedPolicy";
import { livestockFeedPeriod } from "./livestockFeedState";

/** After haymaking, before slaughter. Spend only the remainder of the same reservation. */
export function settleCropResiduePreparation(): void {
  const state = getCropResidueState();
  if (!state) return;
  const world = getWorldContext();
  const period = livestockFeedPeriod();
  const month = ((period % 12) + 12) % 12;
  const feed = getOrCreateLivestockFeedTable();
  for (const [key, cell] of Object.entries(state.cells)) {
    const id = Number(key);
    if (world.pack.cells.h[id] < 20 || (cell.lastPeriod ?? -Infinity) >= period) continue;
    const labor = getHusbandryLaborBudget(id, month, calculateHusbandryDemand(world, id));
    const hay = feed?.[id];
    const hayDays = hay?.harvestPeriod === period ? (hay.harvestedKg * HAY_WORK_DAYS_PER_TONNE_DM) / 1000 : 0;
    prepareCropResidues(
      cell,
      period,
      getLivestockMonthlyFeedNeedKg(id),
      Math.max(0, labor.reservedDays - labor.careDays - hayDays)
    );
  }
}
