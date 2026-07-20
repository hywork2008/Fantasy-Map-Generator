import type { SimulationContext, StateSimulationState, StateSimulationStates } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { State } from "../types/models";

type StateSimulationField = keyof StateSimulationState;
type StateSimulationValue = boolean | number | undefined;
type MutableStateSimulationState = Record<StateSimulationField, StateSimulationValue>;

/**
 * Phase 8 compatibility fields projected onto legacy `pack.states` records.
 * Identity, territory, diplomacy and generated military definitions remain on
 * the map state; this list contains only values that evolve over time.
 */
export const SIMULATION_STATE_FIELDS: readonly StateSimulationField[] = [
  "alert",
  "salesTax",
  "pollTax",
  "treasury",
  "tributeRate",
  "tributePaid",
  "manpowerReconciled",
  "foodStress",
  "plantingExposure",
  "harvestExposure",
  "agricultureCarryOver",
  "agricultureYear",
  "supplyStrain",
  "foodStock"
];

function getStateId(state: State, index: number): number | null {
  if (Number.isInteger(state.i) && state.i > 0) return state.i;
  return index > 0 ? index : null;
}

function getLegacyValue(state: State, field: StateSimulationField): StateSimulationValue {
  const descriptor = Object.getOwnPropertyDescriptor(state, field);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor.value as StateSimulationValue;
}

function getStateSimulation(states: StateSimulationStates, stateId: number): StateSimulationState {
  const existing = states[stateId];
  if (existing) return existing;
  const simulationState: StateSimulationState = {};
  states[stateId] = simulationState;
  return simulationState;
}

/** Projects one new or replaced map-state record without walking the complete table. */
export function bindSimulationState(state: State, stateId: number, simulation: SimulationContext): void {
  if (!simulation.states) simulation.states = {};
  const simulationState = getStateSimulation(simulation.states, stateId);
  const mutableState = simulationState as MutableStateSimulationState;

  for (const field of SIMULATION_STATE_FIELDS) {
    const legacyValue = getLegacyValue(state, field);
    if (legacyValue !== undefined) mutableState[field] = legacyValue;

    Object.defineProperty(state, field, {
      configurable: true,
      enumerable: true,
      get: () => mutableState[field],
      set: (value: StateSimulationValue) => {
        mutableState[field] = value;
      }
    });
  }
}

/** Rebinds legacy state records after generation, map load or world replacement. */
export function bindSimulationStateState(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.states) simulation.states = {};
  if (!Array.isArray(world.pack?.states)) return;

  world.pack.states.forEach((state, index) => {
    const stateId = getStateId(state, index);
    if (stateId === null) return;
    bindSimulationState(state, stateId, simulation);
  });
}

/** Starts a fresh map without retaining live state values from the prior one. */
export function resetSimulationStateState(simulation: SimulationContext): void {
  simulation.states = {};
}

/** Removes live-state mirrors from an archive map payload when canonical values exist. */
export function removeSimulationStateStateMirrors(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.states) return;
  if (!Array.isArray(world.pack?.states)) return;

  world.pack.states.forEach((state, index) => {
    const stateId = getStateId(state, index);
    if (stateId === null) return;
    const simulationState = simulation.states[stateId];
    if (!simulationState) return;

    for (const field of SIMULATION_STATE_FIELDS) {
      if (Object.hasOwn(simulationState, field)) delete state[field];
    }
  });
}
