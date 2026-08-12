import type { Burg } from "../../hostTypes";
import { gauss, rn, TIME } from "../../hostUtils";
import { getDeals, getWorldContext } from "../economyContext";
import { getAcademyBonus } from "./academyKnowledge";
import { updateDiplomaticReliability } from "./chanceryDiplomacy";
import { applyCharacterLivingCosts } from "./characterLivingCosts";
import { payGuildStipends, payMarketStipends, payProvinceLordStipends } from "./characterStipends";
import { applyCivilAdministrationUpkeep } from "./civilAdministration";
import { applyAllDomainFiscalPolicies, getStateDomainPollTaxMultiplier } from "./domainFiscalPolicy";
import { updateReligiousUnrest } from "./ecclesiasticaUnrest";
import { getEconomyStartProfile } from "./economyStartMode";
import { applyFiscalEvents } from "./fiscalEvents";
import { Markets } from "./markets-generator";
import type { Deal } from "./marketTypes";
import { getStateMilitaryUpkeep } from "./militaryLogistics";
import { applyFormRevenueMix } from "./revenueMix";
import { recordStateFiscalReport } from "./stateFiscalReport";
import { applyTradeSanctionToIncome, refreshTradeSanctions } from "./tradeSanctions";
import { allocateTreasury, payMilitaryUpkeep } from "./treasuryAllocation";
import { applyWarFootingPoliticalCost, syncWarFootingFromDiplomacy } from "./warFooting";

type TaxBases = { salesTax: number; pollTax: number };

/**
 * pollTax ×3-rescaled 2026-08-06 together with the personal-stipend ladder
 * (characterStipends.ts, treasuryAllocation.ts, characterLivingCosts.ts) — domesticIncome
 * (pollTax × population) is the input the ruler-household and central-office stipend formulas
 * take their proportional share of, so pollTax has to grow with the same factor or only the
 * floor/cap-bound extremes (very poor/very rich states) would see any personal-pay change,
 * leaving the broad middle unaffected. salesTax is deliberately left untouched — it taxes trade
 * *value* from the separately-calibrated Goods economy (deal.tax), not a flat per-head levy, and
 * rescaling it would desync state revenue from goods-unit-scale.md's pricing calibration.
 */
const DEFAULT_TAX_BY_FORM: Record<string, TaxBases> = {
  Monarchy: { salesTax: 0.15, pollTax: 0.6 },
  Theocracy: { salesTax: 0.25, pollTax: 0.3 },
  Union: { salesTax: 0.07, pollTax: 0.39 },
  Republic: { salesTax: 0.05, pollTax: 0.45 },
  Anarchy: { salesTax: 0, pollTax: 0 }
};
const DEFAULT_TAX: TaxBases = DEFAULT_TAX_BY_FORM.Monarchy;

/**
 * PR-17b (docs/plan/department-budget-spending-effects.md §3.1) — Stewardship's funding effect.
 * A fully-neglected Stewardship (departmentServiceLevel.stewardship sustained at 0) raises
 * effective administrative upkeep by up to this many share-points and shrinks the administration
 * tax-efficiency bonus by up to this fraction. Kept small relative to economyStartMode.ts's
 * stateAdministrativeUpkeepShare (already 0.88-0.95 in the realistic/subsistence profiles) so a
 * starved Stewardship erodes a state further without being able to push upkeep past
 * STEWARDSHIP_UPKEEP_SHARE_CEILING on its own. Deliberately lagged one cycle — this cycle's
 * allocateTreasury() call (later in collectTaxes()) updates departmentServiceLevel for *next*
 * cycle, so today's neglect cannot be undone by a same-cycle "spend more" reaction.
 */
const STEWARDSHIP_UPKEEP_PENALTY_MAX_SHARE_POINTS = 0.05;
const STEWARDSHIP_UPKEEP_SHARE_CEILING = 0.98;
const STEWARDSHIP_TAX_EFFICIENCY_PENALTY_MAX = 0.15;

// Gold from Shipbuilding's trade-voyage ships (fmg:shipbuilding-voyage-income), buffered
// here until the next collectTaxes()/foldBufferedStateIncome() fold-in — mirrors how `deals`
// represents "income since the last cycle" rather than a running total, so it composes cleanly
// with a treasury that now carries forward between cycles instead of resetting. See
// docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）").
const _voyageIncomeByState = new Map<number, number>();
// Procurement spends between fold-ins must be buffered here and folded into the next
// carry-forward update, since they happen outside collectTaxes()/foldBufferedStateIncome().
const _strategicProcurementExpenseByState = new Map<number, number>();

export function registerVoyageIncome(stateId: number, amount: number): void {
  _voyageIncomeByState.set(stateId, (_voyageIncomeByState.get(stateId) ?? 0) + amount);
}

export function clearVoyageIncome(): void {
  _voyageIncomeByState.clear();
}

export function registerStrategicProcurementExpense(stateId: number, amount: number): void {
  if (!stateId || !(amount > 0)) return;
  _strategicProcurementExpenseByState.set(stateId, (_strategicProcurementExpenseByState.get(stateId) ?? 0) + amount);
}

export function clearStrategicProcurementExpenses(): void {
  _strategicProcurementExpenseByState.clear();
}

export class TaxesModule {
  private get worldContext() {
    return getWorldContext();
  }

  /**
   * Seeds salesTax, pollTax, and a start-mode public reserve for any non-neutral
   * State that does not have rates yet. Idempotent — never overwrites an already-set
   * or user-edited rate / treasury.
   */
  defineTaxRates(): void {
    for (const state of this.worldContext.pack.states) {
      if (!state.i || state.salesTax !== undefined) continue;

      const { salesTax, pollTax } = DEFAULT_TAX_BY_FORM[state.form || ""] || DEFAULT_TAX;
      state.salesTax = rn(gauss(salesTax, salesTax * 0.15, salesTax * 0.5, salesTax * 1.5, 4), 2);
      state.pollTax = rn(gauss(pollTax, pollTax * 0.15, pollTax * 0.5, pollTax * 1.5, 4), 2);
      const population = (state.rural || 0) + (state.urban || 0);
      const profile = getEconomyStartProfile(this.worldContext.options);
      state.treasury = rn(population * profile.stateTreasuryPerPopulation, 2);
    }
  }

  /**
   * Folds this generation cycle's deals plus poll tax into every non-neutral state's treasury,
   * which is now a carry-forward stock rather than a from-scratch recalculation (docs/temp/profits.md
   * decision #1). The economy deals slice is cleared at the start of each Production.produce() cycle
   * (production-generator.ts), so the deals loop below only ever sees the current cycle's deals —
   * this method is NOT idempotent and must only be called once per production cycle (every existing
   * call site pairs it 1:1 with a preceding Production.produce()/produceIncrementally()). Callers
   * that need to expose buffered voyage-income/procurement-expense adjustments outside of a
   * production cycle must call foldBufferedStateIncome() instead, not this method.
   */
  collectTaxes(): void {
    TIME && console.time("collectTaxes");
    const { states, burgs } = this.worldContext.pack;
    const deals = getDeals();
    const openingTreasuryByState = new Map<number, number>();
    const salesTaxByState = new Map<number, number>();
    for (const state of states) {
      if (state?.i) openingTreasuryByState.set(state.i, state.treasury || 0);
    }

    // PR-15: reset trade-sanction counters and refresh multipliers from prior-cycle FX default.
    for (const state of states) {
      if (!state?.i) continue;
      state.lastTradeSanctionBlocked = 0;
      refreshTradeSanctions(state);
    }

    for (const deal of deals) {
      if (!deal.tax) continue;
      const sellerStateId = this.getSellerStateId(deal, burgs);
      if (!sellerStateId) continue;
      const state = states[sellerStateId];
      if (!state) continue;
      // PR-15: foreign-debt sanctions haircut deal-tax receipts.
      const keptTax = applyTradeSanctionToIncome(state, deal.tax);
      state.treasury = rn((state.treasury || 0) + keptTax, 2);
      salesTaxByState.set(sellerStateId, rn((salesTaxByState.get(sellerStateId) ?? 0) + keptTax, 2));
    }

    for (const state of states) {
      if (!state.i) continue;
      const population = (state.rural || 0) + (state.urban || 0);
      const voyageIncome = _voyageIncomeByState.get(state.i) ?? 0;
      const procurementExpense = _strategicProcurementExpenseByState.get(state.i) ?? 0;
      const militaryUpkeep = getStateMilitaryUpkeep(state);
      // PR-17b: last cycle's Stewardship service level (this cycle's allocateTreasury() call,
      // below, updates it for next cycle — see the constants' doc comment for the lag rationale).
      const stewardshipServiceLevel = state.departmentServiceLevel?.stewardship ?? 1;
      const stewardshipShortfall = Math.max(0, 1 - stewardshipServiceLevel);
      // Better-staffed notaries/judges/clerks at the capital collect the household levy more
      // completely (less unrecorded evasion) — docs/plan/knowledge-guild-system.md §9 Phase 3.
      // A neglected Stewardship erodes this same efficiency (PR-17b).
      const administrationBonus =
        getAcademyBonus(state.capital ?? 0, "administration") *
        (1 - stewardshipShortfall * STEWARDSHIP_TAX_EFFICIENCY_PENALTY_MAX);
      // PR-12: domain levy intensity across province seats scales poll-tax collection.
      const domainPollMult = getStateDomainPollTaxMultiplier(state);
      state.domainPollTaxMultiplier = domainPollMult;
      const pollTaxRevenue = (state.pollTax || 0) * population * administrationBonus * domainPollMult;
      // PR-15: voyage income is trade-exposed; poll tax stays domestic.
      const voyageKept = applyTradeSanctionToIncome(state, voyageIncome);
      const rawDomesticIncome = pollTaxRevenue + voyageKept;
      // Credit L2 first so multi-ledger household purse (L2→L1) can draw this cycle's revenue.
      state.treasury = rn((state.treasury || 0) + rawDomesticIncome, 2);
      // Courts, scribes, tax farmers, messengers, and routine local administration consume
      // ordinary peace-time income before it becomes discretionary Treasury growth. This is
      // deliberately a real cash sink, not a cosmetic cap; a State that cannot cover it has
      // less cash for its departments and military in the same cycle. PR-17b: a neglected
      // Stewardship raises this share (clamped below STEWARDSHIP_UPKEEP_SHARE_CEILING) — a
      // starved civil service collects revenue less cleanly and administration itself gets
      // costlier, not cheaper.
      const profile = getEconomyStartProfile(this.worldContext.options);
      const administrativeUpkeepShare = Math.min(
        STEWARDSHIP_UPKEEP_SHARE_CEILING,
        profile.stateAdministrativeUpkeepShare + stewardshipShortfall * STEWARDSHIP_UPKEEP_PENALTY_MAX_SHARE_POINTS
      );
      const administrativeUpkeepTotal = rn(rawDomesticIncome * administrativeUpkeepShare, 2);
      // civilAdministration.ts (docs/plan/civil-administration-burg-state-split.md): splits the
      // total into 5 named components and re-attributes the locally-flavored ones to the state's
      // own burgs (cash-limited there), instead of the old single opaque state.treasury deduction.
      // Does not change administrativeUpkeepShare or budgetIncome below — the department-sizing
      // math stays keyed to the original flat-percentage model; the state simply keeps more real
      // cash whenever its burgs absorb part of the cost, which shows up as treasury growth rather
      // than a bigger nominal department budget.
      const civilAdministration = applyCivilAdministrationUpkeep(state, administrativeUpkeepTotal, burgs);
      // PR-6 form revenue mix: wartime Monarchy subsidy, Theocracy tithe, Anarchy plunder share.
      const mix = applyFormRevenueMix(state, rawDomesticIncome);
      // PR-7: council failure / tax farm / public debt — may scale income and move L2 cash.
      const events = applyFiscalEvents(state, mix.adjustedDomesticIncome);
      const budgetIncome = rn(mix.adjustedDomesticIncome * (1 - administrativeUpkeepShare) * events.incomeScale, 2);
      // PR-7: AI war footing sync from diplomacy (unless player-locked), then court cost.
      syncWarFootingFromDiplomacy(state);
      // Field commanders cash-settle inside allocateTreasury (L3a.marshalcy → L2, PR-5).
      // War footing reweights department shares (PR-6) when state.warFooting is set.
      const allocation = allocateTreasury(state, budgetIncome);
      // PR-17g: Chancery's freshly-updated service level feeds diplomatic reliability this cycle.
      updateDiplomaticReliability(state);
      // PR-17h: Ecclesiastica's freshly-updated service level feeds religious unrest this cycle.
      updateReligiousUnrest(state);
      applyWarFootingPoliticalCost(state);
      // Troop upkeep: L3a.marshalcy first, then L2 remainder (multi-ledger PR-5). Need is
      // recomputed here so it matches the same military snapshot collectTaxes already used.
      const militarySpend = payMilitaryUpkeep(state, militaryUpkeep);
      // Strategic procurement stays an L2-only expense for now (not a marshalcy institutional line).
      let paidProcurement = 0;
      if (procurementExpense > 0) {
        paidProcurement = Math.min(procurementExpense, state.treasury || 0);
        state.treasury = rn(Math.max(0, (state.treasury || 0) - procurementExpense), 2);
      }

      // Province lords are paid from their own seated Burg's treasury, not state.treasury
      // (docs/plan/state-treasury-department-budget.md §7 item 7) — no deduction here.
      payProvinceLordStipends(state);

      const openingTreasury = openingTreasuryByState.get(state.i) ?? 0;
      const income = {
        salesTax: salesTaxByState.get(state.i) ?? 0,
        pollTax: pollTaxRevenue,
        voyageIncome: voyageKept,
        wartimeSubsidy: mix.wartimeSubsidy,
        publicDebtIssued: events.debtIssued,
        foreignDebtIssued: events.foreignDebtIssued,
        // PR-17a: overflow remitted L3a → L2 when a non-marshalcy department balance hit its cap.
        departmentBalanceRemit: allocation.departmentBalanceRemit
      };
      const expenses = {
        // civilAdministration.ts: administrativeUpkeep's former single total, split into 5 named
        // components (docs/plan/civil-administration-burg-state-split.md). Only the
        // state.treasury-side amounts appear here — courts/scribesNotaries/taxFarmers/
        // routineLocalAdministration are already net of whatever the state's own burgs absorbed.
        courts: civilAdministration.courts,
        scribesNotaries: civilAdministration.scribesNotaries,
        taxFarmers: civilAdministration.taxFarmers,
        messengers: civilAdministration.messengers,
        routineLocalAdministration: civilAdministration.routineLocalAdministration,
        councilClawback: mix.adjustedDomesticIncome * (1 - events.incomeScale),
        taxFarmLeak: events.taxFarmLeak,
        publicDebtInterest: events.debtInterestPaid,
        publicDebtRepaid: events.debtRepaid,
        foreignDebtInterest: events.foreignDebtInterest,
        householdTransfer: allocation.householdPurseCredit,
        // PR-17e: departmentTransfer's single combined total split into a per-department
        // breakdown (docs/plan/department-budget-spending-effects.md §5) — sums to what
        // departmentBalancesCredit reported before this PR.
        marshalcyTransfer: allocation.departmentActualCredit.marshalcy,
        chanceryTransfer: allocation.departmentActualCredit.chancery,
        stewardshipTransfer: allocation.departmentActualCredit.stewardship,
        spymasteryTransfer: allocation.departmentActualCredit.spymastery,
        ecclesiasticaTransfer: allocation.departmentActualCredit.ecclesiastica,
        militaryUpkeep: militarySpend.fromTreasury,
        strategicProcurement: paidProcurement,
        titheTransfer: mix.titheToEcclesiastica,
        plunderTransfer: mix.plunderToRuler
      };
      const incomeTotal = Object.values(income).reduce((sum, value) => sum + value, 0);
      const expenseTotal = Object.values(expenses).reduce((sum, value) => sum + value, 0);
      const closingTreasury = state.treasury || 0;
      const unclassified = rn(closingTreasury - openingTreasury - incomeTotal + expenseTotal, 2);
      recordStateFiscalReport({
        stateId: state.i,
        openingTreasury,
        closingTreasury,
        income: { ...income, unclassifiedIncome: unclassified > 0 ? unclassified : 0 },
        expenses: { ...expenses, unclassified: unclassified < 0 ? -unclassified : 0 }
      });
    }
    // PR-7 domain policies (extract / fortify) after all province lord stipends this cycle.
    applyAllDomainFiscalPolicies();
    _voyageIncomeByState.clear();
    _strategicProcurementExpenseByState.clear();

    // Guild/Market roles are paid from their own domain-guild/market treasuries, not
    // state.treasury — global passes, not part of the per-state loop above.
    payGuildStipends();
    payMarketStipends();

    // After all personal stipends: consume lifestyle (+ soft wealth upkeep) from Character.wealth
    // so purses do not grow unbounded. Order matters — pay first, then spend.
    applyCharacterLivingCosts();

    TIME && console.timeEnd("collectTaxes");
  }

  /**
   * Folds only the buffered Shipbuilding voyage-income / strategic-procurement adjustments into
   * state treasuries. Unlike collectTaxes(), this must NOT re-sum the current cycle's deal taxes
   * or re-apply poll tax / military upkeep — those are only valid once per production cycle
   * (collectTaxes() is always called immediately after Production.produce(), which is the only
   * place `deals` gets cleared). Safe to call any number of times between production cycles —
   * e.g. once per ship hull per tick from the Shipbuilding voyage-income event — since the
   * underlying buffers are drained on read, same as collectTaxes()'s own handling of them.
   */
  foldBufferedStateIncome(): void {
    const { states } = this.worldContext.pack;

    for (const state of states) {
      if (!state.i) continue;
      const voyageIncome = _voyageIncomeByState.get(state.i) ?? 0;
      const procurementExpense = _strategicProcurementExpenseByState.get(state.i) ?? 0;
      if (!voyageIncome && !procurementExpense) continue;
      state.treasury = rn(Math.max(0, (state.treasury || 0) + voyageIncome - procurementExpense), 2);
    }

    _voyageIncomeByState.clear();
    _strategicProcurementExpenseByState.clear();
  }

  private getSellerStateId(deal: Deal, burgs: Burg[]): number | undefined {
    if (deal.sellerType === "burg") return burgs[deal.seller]?.state;

    const market = Markets.get(deal.seller);
    if (!market) return undefined;
    return burgs[market.centerBurgId]?.state;
  }
}

export const Taxes = new TaxesModule();
