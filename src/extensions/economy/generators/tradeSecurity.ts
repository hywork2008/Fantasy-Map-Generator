import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getApi, getTradeSecurityLedgers, getWorldContext, setTradeSecurityLedgers } from "../economyContext";
import type { TradeSecurityLedger } from "./tradeSecurityTypes";
import { UrbanLaborIntake } from "./urbanLaborIntake";

export type { TradeSecurityLedger } from "./tradeSecurityTypes";

const BASE_BANDIT_RISK_PER_DAY = 0.001;
const SECURITY_UPKEEP_BASE = 0.2;
const SECURITY_UPKEEP_PER_BURG = 0.05;
/**
 * Extra bandit risk a fully-neglected Spymastery (`departmentServiceLevel.spymastery` sustained
 * at 0) adds to its state's roads, as a fraction of the otherwise-computed risk.
 *
 * Spymastery was the one funded department with no downstream effect at all: marshalcy pays
 * troop upkeep, chancery drives `diplomaticReliability`, stewardship drives tax efficiency and
 * administrative upkeep, ecclesiastica drives `religiousUnrest` — spymastery's budget and
 * service level were tracked and then read by nothing. Knowing which passes are held and which
 * villages are sheltering outlaws is exactly that department's job, so its neglect surfaces here.
 * docs/plan/economy-coupling-audit.md L8.
 *
 * Deliberately a neglect penalty only, never a bonus: `departmentServiceLevel` is clamped to
 * 0..1 with 1 = healthy (treasuryAllocation.ts's `updateDepartmentServiceLevel`), so a state at
 * the default level 1 gets a multiplier of exactly 1 and its risk is unchanged — the same shape
 * as PR-17b's Stewardship shortfall. Sized well under the existing frontier (up to 1.25) and
 * map-danger (up to 4x) multipliers so intelligence modulates route risk without dominating it.
 */
const SPYMASTERY_NEGLECT_RISK_MAX = 0.5;
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
    const { burgs, cells, states } = getWorldContext().pack;
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
    // Patrol budget (securityMultiplier) is money on the road; Spymastery is knowing where to
    // put it. Separate levers, so a separate factor rather than folding into the investment term.
    const spymasteryMultiplier = this.getSpymasteryRiskMultiplier(states?.[stateId]);
    return this.clampUnit(
      BASE_BANDIT_RISK_PER_DAY *
        warMultiplier *
        frontierMultiplier *
        dangerMultiplier *
        banditMultiplier *
        securityMultiplier *
        spymasteryMultiplier
    );
  }

  /**
   * Road-risk multiplier from a state's Spymastery funding. 1.0 at the healthy default level of
   * 1 (and for a neutral / missing state), rising to 1 + SPYMASTERY_NEGLECT_RISK_MAX as the
   * department's smoothed service level falls to 0.
   */
  getSpymasteryRiskMultiplier(state: State | undefined): number {
    if (!state || state.removed || !state.i) return 1;
    const level = state.departmentServiceLevel?.spymastery ?? 1;
    const shortfall = 1 - this.clampUnit(level);
    return 1 + shortfall * SPYMASTERY_NEGLECT_RISK_MAX;
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
