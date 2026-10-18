/**
 * Mines, smelters, quarries and volcanic works used to hand their output to the market for
 * nothing: the market sold the ore and stone, while the miners who drew in migrants to the
 * town earned no wage and the ruler no royalty (docs/plan/farm-labour-calibration.md §13).
 *
 * The market now buys the output at a mine-head price, out of its own cash. That payment pays,
 * in order: the regalian royalty (Bergregal, the tenth), the workers' wages, and the operators'
 * profit. Who holds the royalty and the profit, and whether the workers are paid a wage or only
 * kept, follows the state's form and the historical period. No money is created.
 */

import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext, isEconomyContextReady } from "../economyContext";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import { DEFAULT_PEOPLE_PER_POPULATION_POINT } from "./craftScale";
import { Markets } from "./markets-generator";
import { getSubsistenceWage, WAGE_SUBSISTENCE_MULTIPLE } from "./subsistenceWage";

/** Share of the output's market price the market pays at the pithead (as the farm gate, the rest is carting and trade). */
export const MINE_HEAD_PRICE_SHARE = 0.8;
/** The ruler's tenth of mine output (Zehnt; the regalian tenth of the Carolingian and later mining codes). */
export const MINING_ROYALTY_SHARE = 0.1;
/**
 * Share of extractive labour that was unfree, by historical period: Laurion's leased concessions
 * were worked mostly by slaves; Roman imperial mines leased to conductores relied mainly on hired
 * labour (Vipasca, the Dacian contracts). From the high middle ages, miners' freedom (Bergfreiheit)
 * made mining wage work.
 */
export const UNFREE_EXTRACTIVE_LABOUR_SHARE_BY_PERIOD: Readonly<Record<string, number>> = {
  classicalAntiquity: 0.6,
  lateAntiquity: 0.3
};
/** An unfree worker is kept, not paid: his food, with nothing over (1 ÷ the wage's multiple of the food bill). */
export const UNFREE_UPKEEP_SHARE_OF_WAGE = 1 / WAGE_SUBSISTENCE_MULTIPLE;

export type ExtractionHolder = "state" | "town" | "none";

/**
 * Who holds the mining regalia. Kings, princes and bishops kept them; a free city or commune
 * could own them (Goslar bought the Rammelsberg rights in 1359), so a republic's royalty stays
 * in the town; without a functioning state nobody collects.
 */
export function getMiningRoyaltyHolder(state: Pick<State, "form"> | undefined): ExtractionHolder {
  if (!state) return "none";
  if (state.form === "Anarchy") return "none";
  if (state.form === "Republic" || state.form === "Union") return "town";
  return "state";
}

/**
 * Who keeps the operators' profit. Shareholding miners and burghers (Gewerken) worked most mines
 * under a lord's grant; an empire ran its mines directly (Roman procurators, the shogunate's Sado).
 */
export function getExtractionOperator(state: Pick<State, "form" | "formName"> | undefined): ExtractionHolder {
  return /empire|imperial/i.test(state?.formName ?? "") ? "state" : "town";
}

export function getUnfreeExtractiveLabourShare(period: string | undefined): number {
  return UNFREE_EXTRACTIVE_LABOUR_SHARE_BY_PERIOD[period ?? ""] ?? 0;
}

export interface ExtractionPayment {
  paid: number;
  royalty: number;
  wages: number;
  profit: number;
}

const NO_PAYMENT: ExtractionPayment = { paid: 0, royalty: 0, wages: 0, profit: 0 };

/** Market value of `units` of a good at a market's current price (its base value when unpriced). */
export function getMarketValue(marketId: number, goodId: number, units: number, baseValue: number): number {
  if (!(units > 0)) return 0;
  const price = Markets.get(marketId)?.goods?.[goodId]?.price;
  return units * (typeof price === "number" && price > 0 ? price : Math.max(0, baseValue));
}

/**
 * The market buys one site's month of output. `people` is the site's real headcount (the sites'
 * authored crews, not the population-point slots of the employment reconciliation, which run
 * about a hundred times larger); `outputValue` is the output's (for a smelter, the value added's)
 * market value.
 */
export function settleExtractionPayment(args: {
  marketId: number;
  burgId: number;
  people: number;
  outputValue: number;
}): ExtractionPayment {
  if (!isEconomyContextReady() || !(args.outputValue > 0)) return NO_PAYMENT;
  const market = Markets.get(args.marketId);
  const treasury = market?.marketTreasury;
  if (!market || !treasury || !(treasury.balance > 0)) return NO_PAYMENT;
  const world = getWorldContext();
  const burg = world.pack.burgs?.[args.burgId] as Burg | undefined;
  if (!burg?.i || burg.removed) return NO_PAYMENT;
  const state = burg.state ? world.pack.states?.[burg.state] : undefined;
  const liveState = state?.i && !state.removed ? state : undefined;

  const paid = rn(Math.min(treasury.balance, args.outputValue * MINE_HEAD_PRICE_SHARE), 2);
  if (!(paid > 0)) return NO_PAYMENT;
  treasury.balance = rn(treasury.balance - paid, 2);

  const royaltyHolder = getMiningRoyaltyHolder(liveState);
  const royalty = royaltyHolder === "none" ? 0 : rn(paid * MINING_ROYALTY_SHARE, 2);

  const labourPoints = Math.max(0, args.people) / DEFAULT_PEOPLE_PER_POPULATION_POINT;
  const unfree = getUnfreeExtractiveLabourShare(world.options?.historicalPeriod);
  const wageBill = labourPoints * getSubsistenceWage(market) * (1 - unfree + unfree * UNFREE_UPKEEP_SHARE_OF_WAGE);
  const wages = rn(Math.max(0, Math.min(paid - royalty, wageBill)), 2);
  const profit = rn(Math.max(0, paid - royalty - wages), 2);

  const credit = (holder: ExtractionHolder, amount: number) => {
    if (!(amount > 0)) return;
    if (holder === "state" && liveState) liveState.treasury = rn((liveState.treasury ?? 0) + amount, 2);
    else burg.treasury = rn((burg.treasury ?? 0) + amount, 2);
  };
  credit(royaltyHolder, royalty);
  creditHouseholdWealth(burg.i, wages);
  credit(getExtractionOperator(liveState), profit);
  return { paid, royalty, wages, profit };
}
