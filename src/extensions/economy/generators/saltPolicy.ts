import { simEvents } from "../../../simulation/events";
import { getSimulationCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { getRulerId } from "../../nobility/nobilityContext";
import { getSimulationMonth, getSimulationYear, getWorldContext } from "../economyContext";
import { getCouncilSupport } from "./councilAssembly";
import { appendCouncilLog } from "./councilSession";
import { simulateCouncilVote } from "./councilVotes";
import { resolveCapitalMarket, routeTaxFarmProceeds } from "./creditPool";
import { getTaxFarmPersonalityFactor, getTaxFarmRate } from "./fiscalEvents";
import type { Market } from "./marketTypes";
import { nominal } from "./moneyScale";
import type { StateSaltLedger } from "./saltLogisticsTypes";
import { recordStateFiscalReport } from "./stateFiscalReport";

/** Explicit simulation assumptions, not calibrated historical tax rates or revolt thresholds. */
export const SALT_POLICY_RULES = {
  defaultTaxRate: 0.5,
  maxTaxRate: 2,
  revoltThreshold: 80,
  revoltClearThreshold: 40
} as const;
export type SaltPolicy = NonNullable<State["saltPolicy"]>;
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function ensureSaltPolicy(state: State): SaltPolicy {
  state.saltPolicy ??= {
    mode: "open",
    taxRate: 0,
    automated: true,
    compulsoryPurchase: false,
    unrest: 0,
    revolt: false
  };
  const p = state.saltPolicy;
  p.taxRate = Number.isFinite(p.taxRate) ? clamp(p.taxRate, 0, SALT_POLICY_RULES.maxTaxRate) : 0;
  p.unrest = Number.isFinite(p.unrest) ? clamp(p.unrest, 0, 100) : 0;
  return p;
}

/** Both ruler proposals and player proposals use the existing faction vote and council log. */
export function configureSaltPolicy(
  stateId: number,
  mode: SaltPolicy["mode"],
  taxRate: number,
  compulsoryPurchase: boolean
): boolean {
  const state = getWorldContext().pack.states[stateId];
  if (
    !state?.i ||
    state.removed ||
    !["open", "monopoly"].includes(mode) ||
    !Number.isFinite(taxRate) ||
    taxRate < 0 ||
    taxRate > SALT_POLICY_RULES.maxTaxRate
  )
    return false;
  const p = ensureSaltPolicy(state);
  const tightening =
    (mode === "monopoly" && p.mode !== mode) || taxRate > p.taxRate || (compulsoryPurchase && !p.compulsoryPurchase);
  if (tightening) {
    state.councilSupport = getCouncilSupport(state).support;
    const vote = simulateCouncilVote(state, "saltMonopoly");
    appendCouncilLog(
      state,
      vote.passed ? "vote" : "veto",
      `Salt rights/levy proposal ${vote.passed ? "approved" : "rejected"} (${round(vote.yesShare * 100)}% yes).`,
      { support: state.councilSupport, yesShare: vote.yesShare }
    );
    p.lastDecision = vote.passed ? "approved" : "rejected";
    if (!vote.passed) return false;
  } else {
    p.lastDecision = "approved";
    if (p.mode !== mode || p.taxRate !== taxRate || p.compulsoryPurchase !== compulsoryPurchase)
      appendCouncilLog(state, "note", "Salt restrictions relaxed.");
  }
  p.mode = mode;
  p.taxRate = round(taxRate);
  p.compulsoryPurchase = compulsoryPurchase;
  p.automated = false;
  return true;
}

export function setSaltPolicyAutomatic(stateId: number, automated: boolean): boolean {
  const state = getWorldContext().pack.states[stateId];
  if (!state?.i || state.removed) return false;
  const policy = ensureSaltPolicy(state);
  policy.automated = automated;
  // Reconsider when automation is explicitly restored, not on every settlement within a month.
  if (automated) delete policy.lastDecisionMonth;
  return true;
}

export function shouldAdoptSaltMonopoly(
  cash: number,
  reserve: number,
  personality: { greed?: number; honor?: number; compassion?: number }
): boolean {
  const greed = personality.greed ?? 50,
    honor = personality.honor ?? 50,
    compassion = personality.compassion ?? 50;
  return cash < reserve && greed >= 65 && greed - (honor + compassion) / 2 >= 20;
}

export function updateSaltPolicies(): void {
  const month = getSimulationYear() * 12 + getSimulationMonth();
  for (const state of getWorldContext().pack.states) {
    if (!state?.i || state.removed) continue;
    const p = ensureSaltPolicy(state);
    if (!p.automated || p.lastDecisionMonth === month) continue;
    p.lastDecisionMonth = month;
    p.lastDecision = "unchanged";
    if (!hasCharactersContext()) continue;
    let rulerId: number | undefined;
    try {
      rulerId = getRulerId(state);
    } catch {
      continue;
    }
    const ruler = getSimulationCharacters().find(c => c.i === rulerId && !c.dead);
    if (!ruler?.personality) continue;
    const reserve = Math.max(
      nominal(5),
      Math.max(0, state.pollTax ?? 0) * ((state.rural ?? 0) + (state.urban ?? 0)) * 2
    );
    if (p.mode === "open" && shouldAdoptSaltMonopoly(state.treasury ?? 0, reserve, ruler.personality)) {
      configureSaltPolicy(state.i, "monopoly", SALT_POLICY_RULES.defaultTaxRate, p.compulsoryPurchase);
      p.automated = true;
    } else if (
      p.mode === "monopoly" &&
      ((state.treasury ?? 0) > reserve * 6 || (p.revolt && ruler.personality.compassion >= 60))
    ) {
      configureSaltPolicy(state.i, "open", 0, p.compulsoryPurchase);
      p.automated = true;
    }
  }
}

/** The same physical market inventory is diverted, purchased and consumed once. */
export function saltSmugglingShare(stateId: number, market: Market): number {
  const state = getWorldContext().pack.states[stateId];
  const p = state?.saltPolicy;
  if (!p || (p.mode === "open" && p.taxRate === 0)) return 0;
  const towns = getWorldContext().pack.burgs.filter(b => b?.i && !b.removed && b.market === market.i);
  const security = towns.length
    ? towns.reduce((sum, b) => sum + clamp(b.security ?? 50, 0, 100), 0) / towns.length
    : 50;
  return clamp(p.taxRate * 0.3 + p.unrest / 200 + (p.revolt ? 0.2 : 0), 0, 0.6) * (1 - (security / 100) * 0.75);
}

/** Gross receipts split between fiscal treasury and the existing tax-farm counterparties. */
export function collectSaltTax(stateId: number, amount: number): { tax: number; farm: number } {
  const state = getWorldContext().pack.states[stateId];
  const tax = round(amount);
  if (!state?.i || state.removed || !(tax > 0)) return { tax: 0, farm: 0 };
  const market = resolveCapitalMarket(state);
  const manager =
    hasCharactersContext() && market?.managerCharacterId
      ? getSimulationCharacters().find(c => c.i === market.managerCharacterId && !c.dead)
      : undefined;
  // Existing routing requires a real capital market to receive the institutional cash.
  const farm = market
    ? Math.min(
        tax,
        round(
          tax *
            getTaxFarmRate(state.form) *
            getTaxFarmPersonalityFactor(manager?.personality?.greed, manager?.personality?.honor)
        )
      )
    : 0;
  const opening = state.treasury ?? 0;
  state.treasury = opening + tax - farm;
  if (farm > 0) {
    market!.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
    routeTaxFarmProceeds(state, farm);
  }
  recordStateFiscalReport({
    stateId,
    openingTreasury: opening,
    closingTreasury: state.treasury,
    income: { saltTax: tax },
    expenses: { saltTaxFarm: farm }
  });
  return { tax, farm };
}

/** Political consequences share the Salt ledger, and feed real civic labor/migration and council confidence. */
export function settleSaltResistance(state: State, ledger: StateSaltLedger): void {
  const p = ensureSaltPolicy(state);
  const active = p.mode === "monopoly" || p.taxRate > 0 || p.compulsoryPurchase;
  const unmet =
    ledger.monthlyHouseholdDemandBags > 0 ? ledger.monthlyUnmetHouseholdBags / ledger.monthlyHouseholdDemandBags : 0;
  const quota =
    ledger.monthlyHouseholdDemandBags > 0 ? (ledger.monthlyUnmetQuotaBags ?? 0) / ledger.monthlyHouseholdDemandBags : 0;
  const burden = ledger.monthlyHouseholdPaid! > 0 ? (ledger.monthlySaltTaxPaid ?? 0) / ledger.monthlyHouseholdPaid! : 0;
  const delta = active ? unmet * 8 + burden * 8 + quota * 4 - 1.5 : -4;
  const previous = p.revolt;
  p.unrest = round(clamp(p.unrest + delta, 0, 100));
  p.revolt =
    p.unrest >= SALT_POLICY_RULES.revoltThreshold || (p.revolt && p.unrest >= SALT_POLICY_RULES.revoltClearThreshold);
  for (const burg of getWorldContext().pack.burgs) {
    if (burg?.i && !burg.removed && burg.state === state.i && active)
      burg.discontent = round(clamp((burg.discontent ?? 0) + delta, 0, 100));
  }
  if (previous !== p.revolt) {
    appendCouncilLog(state, "note", `Salt tax revolt ${p.revolt ? "begins" : "subsides"} (unrest ${p.unrest}).`);
    simEvents.dispatchEvent(
      new CustomEvent("fmg:salt-revolt", { detail: { stateId: state.i, active: p.revolt, unrest: p.unrest } })
    );
  }
  if ((ledger.monthlySaltTaxFarmPaid ?? 0) > 0)
    appendCouncilLog(state, "tax_farm", `Salt tax-farm proceeds ${ledger.monthlySaltTaxFarmPaid}.`, {
      amount: ledger.monthlySaltTaxFarmPaid
    });
  ledger.saltAutomated = p.automated;
  ledger.saltCompulsoryPurchase = p.compulsoryPurchase;
  ledger.saltMonopoly = p.mode === "monopoly";
  ledger.saltTaxRate = p.taxRate;
  ledger.saltUnrest = p.unrest;
  ledger.saltRevolt = p.revolt;
  ledger.saltCouncilDecision = p.lastDecision;
}
