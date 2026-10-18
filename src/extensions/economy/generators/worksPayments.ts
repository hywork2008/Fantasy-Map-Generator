/**
 * Where a state's public works money goes (docs/plan/farm-labour-calibration.md §13). It used to
 * leave the economy: the road was paved, and nobody was paid. Royal works paid their masons,
 * quarrymen and carters a day wage (the king's works in Wales, 1277–1330) and bought stone,
 * lime and timber; road labour was often owed rather than paid — the French royal corvée
 * (regularised 1738, abolished 1787–1790) called up each rural parish for 8–40 days a year.
 */

import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getMarketCellColumn, getWorldContext } from "../economyContext";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import { payStateHouseholds } from "./householdWealth";
import { Markets } from "./markets-generator";

/** Wages' share of a works project's cost; the rest is stone, lime, timber and carting bought at market. */
export const WORKS_LABOUR_SHARE = 0.6;
/**
 * Share of road labour owed as corvée rather than paid, by form. Kings and princes, and church
 * lords alike, called up their rural subjects; a commune or league hired its labour.
 */
export const ROAD_CORVEE_SHARE_BY_FORM: Readonly<Record<string, number>> = {
  Monarchy: 0.5,
  Theocracy: 0.5,
  Republic: 0,
  Union: 0,
  Anarchy: 0
};
/** Road corvée ends with the old regime's labour dues; from the steam era roads are contracted. */
const CORVEE_PERIODS = new Set([
  "classicalAntiquity",
  "lateAntiquity",
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra"
]);

export function getRoadCorveeShare(state: Pick<State, "form">, period: string | undefined): number {
  if (!CORVEE_PERIODS.has(period ?? "ageOfExploration")) return 0;
  return ROAD_CORVEE_SHARE_BY_FORM[state.form ?? ""] ?? ROAD_CORVEE_SHARE_BY_FORM.Monarchy;
}

/** Money a road costs the treasury once its corvée share of the labour is owed in kind. */
export function getRoadCashCost(state: Pick<State, "form">, cost: number): number {
  const corvee = getRoadCorveeShare(state, getWorldContext().options?.historicalPeriod);
  return rn(cost * (1 - WORKS_LABOUR_SHARE * corvee), 2);
}

function creditMarket(marketId: number | undefined, amount: number): boolean {
  const market = marketId ? Markets.get(marketId) : undefined;
  if (!market || !(amount > 0)) return false;
  const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
  treasury.balance = rn(treasury.balance + amount, 2);
  market.marketTreasury = treasury;
  return true;
}

/** A harbour or granary step: wages to the town's households, materials bought at its market. */
export function payBurgWorks(burg: Burg, cost: number): void {
  if (!(cost > 0)) return;
  const wages = rn(cost * WORKS_LABOUR_SHARE, 2);
  creditHouseholdWealth(burg.i, wages);
  if (!creditMarket(burg.market, rn(cost - wages, 2))) creditHouseholdWealth(burg.i, rn(cost - wages, 2));
}

/**
 * A paved road: the paid labour goes to the state's households (the road gangs were local), the
 * materials to the markets the road crosses, by length. `cashCost` already excludes corvée labour.
 */
export function payRoadWorks(state: State, cells: readonly number[], cost: number, cashCost: number): void {
  if (!(cashCost > 0)) return;
  let materials = rn(Math.min(cashCost, cost * (1 - WORKS_LABOUR_SHARE)), 2);
  const wages = rn(cashCost - materials, 2);
  // A state with no towns pays its road gangs through the markets the road crosses instead.
  if (wages > 0 && !(payStateHouseholds(state.i, wages) > 0)) materials = cashCost;

  const column = getMarketCellColumn();
  const cellsByMarket = new Map<number, number>();
  for (const cellId of cells) {
    const marketId = column[cellId] ?? 0;
    if (marketId) cellsByMarket.set(marketId, (cellsByMarket.get(marketId) ?? 0) + 1);
  }
  const total = [...cellsByMarket.values()].reduce((sum, count) => sum + count, 0);
  if (!total) {
    payStateHouseholds(state.i, materials);
    return;
  }
  for (const [marketId, count] of cellsByMarket) creditMarket(marketId, rn((materials * count) / total, 2));
}
