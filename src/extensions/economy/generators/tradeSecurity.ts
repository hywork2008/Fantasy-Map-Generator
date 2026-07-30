import { rn } from "../../hostUtils";
import { getApi, getTradeSecurityLedgers, getWorldContext, setTradeSecurityLedgers } from "../economyContext";
import type { TradeSecurityLedger } from "./tradeSecurityTypes";
import { UrbanLaborIntake } from "./urbanLaborIntake";

export type { TradeSecurityLedger } from "./tradeSecurityTypes";

const BASE_BANDIT_RISK_PER_DAY = 0.001;
const SECURITY_UPKEEP_BASE = 0.2;
const SECURITY_UPKEEP_PER_BURG = 0.05;
const FRONTIER_WILDERNESS = 0;
const FRONTIER_OUTPOST = 1;
const FRONTIER_SETTLEMENT = 2;
const FRONTIER_INCORPORATED = 3;

/** Owns state-funded route security and the destination-side bandit-risk calculation. */
export class TradeSecurityModule {
  generate(): void {
    const priorByState = new Map(getTradeSecurityLedgers().map(ledger => [ledger.stateId, ledger]));
    const ledgers: TradeSecurityLedger[] = [];
    for (const state of getWorldContext().pack.states) {
      if (!state.i || state.removed) continue;
      const prior = priorByState.get(state.i);
      ledgers.push({
        stateId: state.i,
        investmentLevel: this.clampUnit(prior?.investmentLevel ?? 0),
        monthlyUpkeepPaid: 0,
        lastCaravansLost: 0
      });
    }
    setTradeSecurityLedgers(ledgers);
  }

  clear(): void {
    setTradeSecurityLedgers([]);
  }

  /** Pays monthly route-security costs and resets the month's loss counters. */
  settleMonthly(): void {
    if (!getTradeSecurityLedgers().length) this.generate();

    for (const ledger of getTradeSecurityLedgers()) {
      ledger.investmentLevel = this.clampUnit(ledger.investmentLevel);
      ledger.monthlyUpkeepPaid = 0;
      ledger.lastCaravansLost = 0;
      if (ledger.investmentLevel <= 0) continue;

      const state = getWorldContext().pack.states[ledger.stateId];
      if (!state || state.removed) continue;
      const requestedUpkeep = this.getMonthlyUpkeep(ledger.stateId) * ledger.investmentLevel;
      const treasury = Math.max(0, state.treasury ?? 0);
      const paidUpkeep = Math.min(treasury, requestedUpkeep);
      state.treasury = rn(treasury - paidUpkeep, 2);
      ledger.monthlyUpkeepPaid = rn(paidUpkeep, 2);
    }
  }

  getLedger(stateId: number): TradeSecurityLedger | undefined {
    return getTradeSecurityLedgers().find(ledger => ledger.stateId === stateId);
  }

  /** Returns the budget-adjusted security investment available to risk rolls this month. */
  getEffectiveInvestment(stateId: number): number {
    const ledger = this.getLedger(stateId);
    if (!ledger || ledger.investmentLevel <= 0) return 0;
    const requestedUpkeep = this.getMonthlyUpkeep(stateId) * this.clampUnit(ledger.investmentLevel);
    if (requestedUpkeep <= 0) return 0;
    return this.clampUnit(ledger.investmentLevel * (ledger.monthlyUpkeepPaid / requestedUpkeep));
  }

  recordCaravanLoss(stateId: number): void {
    const ledger = this.getLedger(stateId);
    if (ledger) ledger.lastCaravansLost += 1;
  }

  /**
   * Computes per-day risk at the destination market's burg. State-owned cells are
   * incorporated by default, even when the optional frontier simulation is absent.
   */
  getBanditRiskPerDay(destinationBurgId: number, warIntensity: number): number {
    const { burgs, cells } = getWorldContext().pack;
    const burg = burgs[destinationBurgId];
    if (!burg || burg.removed || !Number.isInteger(burg.cell)) return 0;

    const stateId = burg.state ?? 0;
    const stage = this.getFrontierStage(burg.cell, cells?.state?.[burg.cell] ?? 0);
    const frontierMultiplier =
      stage >= FRONTIER_INCORPORATED
        ? 0.05
        : stage === FRONTIER_SETTLEMENT
          ? 0.35
          : stage === FRONTIER_OUTPOST
            ? 0.75
            : 1.25;
    const danger = Math.max(0, Math.min(255, cells?.danger?.[burg.cell] ?? 0));
    const dangerMultiplier = 1 + (3 * danger) / 255;
    const warMultiplier = 1 + Math.max(0, Number.isFinite(warIntensity) ? warIntensity : 0);
    // Rural surplus may eventually become outlaw cohorts. Keep their pressure separate
    // from static map danger so an improved route-security budget can still counter it.
    const banditMultiplier = 1 + (UrbanLaborIntake.getBanditPressureByState().get(stateId) ?? 0);
    const securityMultiplier = 1 - this.getEffectiveInvestment(stateId);
    return this.clampUnit(
      BASE_BANDIT_RISK_PER_DAY *
        warMultiplier *
        frontierMultiplier *
        dangerMultiplier *
        banditMultiplier *
        securityMultiplier
    );
  }

  getMonthlyUpkeep(stateId: number): number {
    const activeBurgCount = getWorldContext().pack.burgs.filter(
      burg => burg.i && !burg.removed && burg.state === stateId
    ).length;
    return SECURITY_UPKEEP_BASE + activeBurgCount * SECURITY_UPKEEP_PER_BURG;
  }

  private getFrontierStage(cell: number, stateId: number): number {
    if (stateId) return FRONTIER_INCORPORATED;
    const stage = getApi().simulationContext?.frontier?.cellStages?.[cell];
    return typeof stage === "number" ? stage : FRONTIER_WILDERNESS;
  }

  private clampUnit(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
}

export const TradeSecurity = new TradeSecurityModule();
