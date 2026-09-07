/**
 * Mixed-folk trait rule used by Half Elf (Human × Elf):
 * min = lower parent, max = higher parent, median = lower parent.
 */
import { APPEARANCE_AXIS_IDS, type AppearanceAxes, type AppearanceRanges, type RaceBeautyIdeal } from "../types/models";

export function hybridMinMaxMedian(a: number, b: number): { min: number; max: number; median: number } {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return { min, max, median: min };
}

export function hybridAppearance(
  a: AppearanceAxes,
  b: AppearanceAxes
): { baseline: AppearanceAxes; range: AppearanceRanges } {
  const baseline = {} as AppearanceAxes;
  const range = {} as AppearanceRanges;
  for (const axis of APPEARANCE_AXIS_IDS) {
    const { min, max, median } = hybridMinMaxMedian(a[axis], b[axis]);
    baseline[axis] = median;
    range[axis] = { min, max };
  }
  return { baseline, range };
}

/** Per-axis beauty weights: numerically lower parent (weaker pull, or stronger aversion). */
export function hybridBeautyIdeal(a: RaceBeautyIdeal, b: RaceBeautyIdeal): RaceBeautyIdeal {
  const weights: RaceBeautyIdeal["weights"] = {};
  for (const axis of APPEARANCE_AXIS_IDS) {
    const av = a.weights[axis];
    const bv = b.weights[axis];
    if (av === undefined && bv === undefined) continue;
    weights[axis] = Math.min(av ?? 0, bv ?? 0);
  }
  return { weights };
}

export function hybridNumericRecord<K extends string>(
  a: Partial<Record<K, number>>,
  b: Partial<Record<K, number>>,
  keys: readonly K[],
  missing = 0
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const value = Math.min(a[key] ?? missing, b[key] ?? missing);
    if (value !== missing) out[key] = value;
  }
  return out;
}
