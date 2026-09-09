export interface RaceWaterTechBias {
  ceilingBonus: { waterLifting: number; municipalSanitation: number };
  administrationBonusBonus: number;
  urgencyThresholdMultiplier: number;
  constructionSpeedMultiplier: number;
}

export interface EconomyRaceParameters {
  key: string;
  hoardSpPerAdultYear?: number;
  waterTechBias?: RaceWaterTechBias;
}
