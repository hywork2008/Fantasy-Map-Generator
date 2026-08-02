/**
 * Thin host registry for optional birth-floor providers (docs/plan/urban-housing-system.md PR-P2).
 *
 * Host generators (demography-simulator) call the registered provider; economy owns pregnancy
 * stock and registers/unregisters the implementation. This module must not import economy
 * modules (avoids cycles and keeps dynamic-extension isolation clean).
 */

export interface BirthFloorProviderArgs {
  burgId: number;
  /** Female adults after aging in this demography step (population points). */
  femaleAdults: number;
  /** Continuous logistic births for this step (points); provider must not sum with due. */
  continuousBirths: number;
  /** Same roomForGrowth demography used for continuous births. */
  roomForGrowth: number;
  deltaYears: number;
}

/** Returns birthsFromPregnancy in population points (due completions this step). */
export type BirthFloorProvider = (args: BirthFloorProviderArgs) => number;

let birthFloorProvider: BirthFloorProvider | null = null;

export function registerBirthFloorProvider(provider: BirthFloorProvider): void {
  birthFloorProvider = provider;
}

export function unregisterBirthFloorProvider(provider?: BirthFloorProvider): void {
  if (provider && birthFloorProvider !== provider) return;
  birthFloorProvider = null;
}

export function getBirthFloorProvider(): BirthFloorProvider | null {
  return birthFloorProvider;
}

export function clearBirthFloorProvider(): void {
  birthFloorProvider = null;
}
