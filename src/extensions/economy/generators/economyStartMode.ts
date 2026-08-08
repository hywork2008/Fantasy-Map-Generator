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
  balanced: {
    burgTreasuryPerPopulation: 5,
    stateTreasuryPerPopulation: 0.5,
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
