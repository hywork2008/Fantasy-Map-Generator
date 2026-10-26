import type { MonthlyWeights } from "../../../data/cropCalendars";

export interface HusbandryDemand {
  readonly residueWorkers?: number;
  readonly residueMonthlyLaborWeights?: readonly number[];
  readonly slaughterWorkers?: number;
  readonly slaughterMonthlyLaborWeights?: readonly number[];
  /** Aggregate herders this cell could use across every grazed species present in its biome. */
  readonly requiredWorkers: number;
  /** Additional haymaking crew, unaffected by herding-dog efficiency. */
  readonly hayWorkers?: number;
  readonly hayMonthlyLaborWeights?: readonly number[];
  readonly careWorkers?: number;
  /** Care-headcount-weighted average good.value, for the greedy allocator's value-ranking (§3.1). */
  readonly value: number;
  /** Normalized distribution of this cell's annual herding work, when the cell has a herd. */
  readonly monthlyLaborWeights?: MonthlyWeights;
}
