import type { BurgSimulationState, BurgSimulationStates, SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg, BurgDemographics } from "../types/models";

type BurgSimulationField = keyof BurgSimulationState;
type BurgSimulationValue = number | BurgDemographics | undefined;
type MutableBurgSimulationState = Record<BurgSimulationField, BurgSimulationValue>;

/**
 * Phase 8 compatibility fields projected onto legacy `pack.burgs` records.
 * Map location, identity, construction and political ownership deliberately
 * remain on each burg definition.
 */
export const SIMULATION_BURG_FIELDS: readonly BurgSimulationField[] = [
  "population",
  "product",
  "treasury",
  "demographics"
];

function getBurgId(burg: Burg, index: number): number | null {
  if (typeof burg.i === "number" && Number.isInteger(burg.i) && burg.i > 0) return burg.i;
  return index > 0 ? index : null;
}

function getLegacyValue(burg: Burg, field: BurgSimulationField): BurgSimulationValue {
  const descriptor = Object.getOwnPropertyDescriptor(burg, field);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor.value as number | BurgDemographics | undefined;
}

function getBurgState(states: BurgSimulationStates, burgId: number): BurgSimulationState {
  const existing = states[burgId];
  if (existing) return existing;
  const state: BurgSimulationState = {};
  states[burgId] = state;
  return state;
}

/** Projects one newly created burg without walking the complete burg table. */
export function bindSimulationBurg(burg: Burg, burgId: number, simulation: SimulationContext): void {
  if (!simulation.burgs) simulation.burgs = {};
  const state = getBurgState(simulation.burgs, burgId);
  const mutableState = state as MutableBurgSimulationState;

  for (const field of SIMULATION_BURG_FIELDS) {
    const legacyValue = getLegacyValue(burg, field);
    if (legacyValue !== undefined) mutableState[field] = legacyValue;

    Object.defineProperty(burg, field, {
      configurable: true,
      enumerable: true,
      get: () => mutableState[field],
      set: (value: BurgSimulationValue) => {
        mutableState[field] = value;
      }
    });
  }
}

/**
 * Projects live burg values from `simulation.burgs` for legacy callers.
 * Rebinding is safe: a current legacy data property wins while an existing
 * accessor keeps the simulation-owned value intact.
 */
export function bindSimulationBurgState(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.burgs) simulation.burgs = {};
  if (!Array.isArray(world.pack?.burgs)) return;

  world.pack.burgs.forEach((burg, index) => {
    const burgId = getBurgId(burg, index);
    if (burgId === null) return;
    bindSimulationBurg(burg, burgId, simulation);
  });
}

/** Starts a fresh map without retaining settlement values from the prior one. */
export function resetSimulationBurgState(simulation: SimulationContext): void {
  simulation.burgs = {};
}

/** Removes only legacy burg mirrors already present in the simulation snapshot. */
export function removeSimulationBurgStateMirrors(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.burgs) return;
  // Pre-first-generate shell (and incomplete fixtures) may lack pack.burgs.
  if (!Array.isArray(world.pack?.burgs)) return;

  world.pack.burgs.forEach((burg, index) => {
    const burgId = getBurgId(burg, index);
    if (burgId === null) return;
    const state = simulation.burgs[burgId];
    if (!state) return;

    for (const field of SIMULATION_BURG_FIELDS) {
      if (Object.hasOwn(state, field)) delete burg[field];
    }
  });
}
