import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext } from "../economyContext";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import { getEconomyStartProfile } from "./economyStartMode";

/**
 * Settles ordinary upkeep for warehouses, stalls, docks, and route administration.
 * Underfunding lowers the Market's next-cycle purchasing reach instead of merely
 * deleting cash, so financial neglect has a visible production and trade consequence.
 *
 * The upkeep is wages — warehousemen, weighers, sweepers, dock hands — paid to the households of
 * the market's towns by population; it used to leave the economy (docs/plan/money-supply-mint.md §4.2).
 */
export function settleMarketMaintenance(): void {
  const world = getWorldContext();
  const profile = getEconomyStartProfile(world.options);
  if (!(profile.marketMaintenancePerPopulation > 0)) return;

  for (const market of getMarkets()) {
    if (!market) continue;
    const towns = world.pack.burgs.filter(burg => burg.i && !burg.removed && burg.market === market.i);
    const population = towns.reduce((sum, burg) => sum + (burg.population ?? 0), 0);
    const due = rn(population * profile.marketMaintenancePerPopulation, 2);
    if (!(due > 0)) continue;

    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    const paid = Math.min(Math.max(0, treasury.balance), due);
    treasury.balance = rn(Math.max(0, treasury.balance - paid), 2);
    market.marketTreasury = treasury;
    if (paid > 0) {
      for (const burg of towns) creditHouseholdWealth(burg.i, rn((paid * (burg.population ?? 0)) / population, 2));
    }

    const paymentRatio = paid / due;
    const priorCondition = market.maintenanceCondition ?? 1;
    market.maintenanceCondition = rn(Math.max(0, Math.min(1, priorCondition * 0.8 + paymentRatio * 0.2)), 3);
  }
}
