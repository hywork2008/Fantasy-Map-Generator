/**
 * Urban pregnancy pipeline stock (docs/plan/urban-housing-system.md PR-P1).
 * Units are population points (same as `burg.demographics.femaleAdults`).
 */
export interface UrbanPregnancyRecord {
  burgId: number;
  /** Pregnant cohort in population points. */
  pregnant: number;
  /**
   * Due completions from the last economy tick that mutated this stock (points).
   * Observability only until PR-P2 applies a birth floor in demography.
   */
  lastDue: number;
}
