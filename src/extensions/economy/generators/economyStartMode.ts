import type { EconomyStartMode, WorldOptions } from "../../../types/WorldState";

/** New maps use a modest, pre-industrial economy. */
export const DEFAULT_NEW_MAP_ECONOMY_START_MODE: EconomyStartMode = "balanced";

export interface EconomyStartProfile {
  /** Initial Burg working cash per population point. */
  burgTreasuryPerPopulation: number;
  /** Initial public State reserve per population point. */
  stateTreasuryPerPopulation: number;
  /** Initial liquid Market cash as a share of local Burg working cash. */
  marketTreasuryShare: readonly [number, number];
  /** Initial inter-market merchant capital as a share of local Burg working cash. */
  tradeCapitalShare: readonly [number, number];
  /** Multiplier for one-off guild working-capital and starter-material grants. */
  guildBootstrapMultiplier: number;
  /** Burg reserve target expressed as recent production cycles. */
  comfortableTreasuryMultiplier: number;
  /** Share of annual Burg surplus remitted to the State after local reserves. */
  stateRemittanceShare: number;
  /** Share of monthly domestic State income consumed by ordinary administration. */
  stateAdministrativeUpkeepShare: number;
  /** Monthly Market infrastructure cost per Burg population point. */
  marketMaintenancePerPopulation: number;
}

const PROFILES: Readonly<Record<EconomyStartMode, EconomyStartProfile>> = {
  // Compatibility profile for old saves and players who want the previous fast start.
  provisioned: {
    burgTreasuryPerPopulation: 20,
    stateTreasuryPerPopulation: 0,
    marketTreasuryShare: [0.5, 1],
    tradeCapitalShare: [0.25, 0.8],
    guildBootstrapMultiplier: 1,
    comfortableTreasuryMultiplier: 4,
    stateRemittanceShare: 0.5,
    stateAdministrativeUpkeepShare: 0,
    marketMaintenancePerPopulation: 0
  },
  // A normal pre-gunpowder polity: ordinary revenues mostly keep institutions running.
  //
  // burgTreasuryPerPopulation/stateTreasuryPerPopulation raised 5→15 / 0.5→1.5 (2026-08-13,
  // docs/plan/burg-treasury-equilibrium.md "2026-08-13 追加調整"): this constant is BOTH the
  // one-time starting seed AND getComfortableTreasuryLevel()'s population floor (guildTreasury.ts),
  // so a fresh, not-yet-producing Burg previously started exactly AT its own "comfortable"
  // ceiling — zero headroom before the very first cycle's civil-administration deduction (however
  // small) flagged it as "struggling". A live 711-burg/16-state check on this exact profile
  // (2026-08-13) confirmed the practical effect: zero-treasury Burgs grew from 95 to 254 (13%→36%)
  // over a single simulated month, even though the richest Burg tripled its own treasury
  // (53.68→158.9sp) in the same month — the seed gave no cushion to the struggling majority while
  // the thriving minority compounded freely. 3x gives every Burg/State real runway to reach its
  // first production cycle before any shortfall-driven rescue is even attempted, without touching
  // any income/expense formula.
  balanced: {
    burgTreasuryPerPopulation: 15,
    stateTreasuryPerPopulation: 1.5,
    marketTreasuryShare: [0.25, 0.5],
    tradeCapitalShare: [0.1, 0.3],
    guildBootstrapMultiplier: 0.35,
    comfortableTreasuryMultiplier: 3,
    stateRemittanceShare: 0.1,
    stateAdministrativeUpkeepShare: 0.88,
    marketMaintenancePerPopulation: 0.06
  },
  // Cities can feed themselves from seeded staple reserves, but have almost no spare capital.
  subsistence: {
    burgTreasuryPerPopulation: 1,
    stateTreasuryPerPopulation: 0.05,
    marketTreasuryShare: [0.05, 0.15],
    tradeCapitalShare: [0.02, 0.08],
    guildBootstrapMultiplier: 0,
    comfortableTreasuryMultiplier: 2,
    stateRemittanceShare: 0.03,
    stateAdministrativeUpkeepShare: 0.95,
    marketMaintenancePerPopulation: 0.12
  }
};

/** Legacy archives deliberately resolve to the previous provisioned economy. */
export function getEconomyStartMode(options: Pick<WorldOptions, "economyStartMode">): EconomyStartMode {
  return options.economyStartMode ?? "provisioned";
}

export function getEconomyStartProfile(options: Pick<WorldOptions, "economyStartMode">): EconomyStartProfile {
  return PROFILES[getEconomyStartMode(options)];
}
