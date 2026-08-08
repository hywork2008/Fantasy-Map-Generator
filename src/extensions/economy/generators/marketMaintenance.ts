import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext } from "../economyContext";
import { getEconomyStartProfile } from "./economyStartMode";

/**
 * Settles ordinary upkeep for warehouses, stalls, docks, and route administration.
 * Underfunding lowers the Market's next-cycle purchasing reach instead of merely
 * deleting cash, so financial neglect has a visible production and trade consequence.
 */
export function settleMarketMaintenance(): void {
  const world = getWorldContext();
  const profile = getEconomyStartProfile(world.options);
  if (!(profile.marketMaintenancePerPopulation > 0)) return;

  for (const market of getMarkets()) {
    if (!market) continue;
    const population = world.pack.burgs.reduce(
      (sum, burg) => (burg.i && !burg.removed && burg.market === market.i ? sum + (burg.population ?? 0) : sum),
      0
    );
    const due = rn(population * profile.marketMaintenancePerPopulation, 2);
    if (!(due > 0)) continue;

    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    const paid = Math.min(Math.max(0, treasury.balance), due);
    treasury.balance = rn(Math.max(0, treasury.balance - paid), 2);
    market.marketTreasury = treasury;

    const paymentRatio = paid / due;
    const priorCondition = market.maintenanceCondition ?? 1;
    market.maintenanceCondition = rn(Math.max(0, Math.min(1, priorCondition * 0.8 + paymentRatio * 0.2)), 3);
  }
}
