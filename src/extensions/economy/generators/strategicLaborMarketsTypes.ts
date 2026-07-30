export const STRATEGIC_OCCUPATIONS = ["forestry", "sailmaking", "ropeMaking", "tarBurning", "trade"] as const;
export type StrategicOccupation = (typeof STRATEGIC_OCCUPATIONS)[number];

export interface LaborMarket {
  marketId: number;
  workersByOccupation: Partial<Record<StrategicOccupation, number>>;
  wageByOccupation: Partial<Record<StrategicOccupation, number>>;
  skillByOccupation: Partial<Record<StrategicOccupation, number>>;
  capacityByOccupation: Partial<Record<StrategicOccupation, number>>;
}
