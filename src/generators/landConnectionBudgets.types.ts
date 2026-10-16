export interface LandSearchMeasurements {
  networkLabels: number;
  networkExpansions: number;
  approachLabels: number;
  approachExpansions: number;
}

export interface LandBudgetPolicy {
  headroom: number;
  minimum: LandSearchMeasurements;
  ceiling: LandSearchMeasurements;
  maxAssessmentSearches: number;
}
