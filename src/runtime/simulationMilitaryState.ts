import type { SimulationContext, SimulationMilitaryRosters } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { MilitaryRegiment, State } from "../types/models";

function getStateId(state: State, index: number): number | null {
  if (Number.isInteger(state.i) && state.i > 0) return state.i;
  return index > 0 ? index : null;
}

function getLegacyRoster(state: State): MilitaryRegiment[] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(state, "military");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  return descriptor.value as MilitaryRegiment[];
}

function getRoster(rosters: SimulationMilitaryRosters, stateId: number): MilitaryRegiment[] {
  const existing = rosters[stateId];
  if (existing) return existing;
  const roster: MilitaryRegiment[] = [];
  rosters[stateId] = roster;
  return roster;
}

/** Projects one state's military roster for legacy generators, editors and renderers. */
export function bindSimulationMilitaryRoster(state: State, stateId: number, simulation: SimulationContext): void {
  if (!simulation.military) simulation.military = {};
  const legacyRoster = getLegacyRoster(state);
  const roster = legacyRoster ?? getRoster(simulation.military, stateId);
  simulation.military[stateId] = roster;

  Object.defineProperty(state, "military", {
    configurable: true,
    enumerable: true,
    get: () => simulation.military[stateId],
    set: (value: MilitaryRegiment[] | undefined) => {
      simulation.military[stateId] = value ?? [];
    }
  });
}

/** Rebinds all state rosters after generation, map load or world replacement. */
export function bindSimulationMilitaryState(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.military) simulation.military = {};

  world.pack.states.forEach((state, index) => {
    const stateId = getStateId(state, index);
    if (stateId === null) return;
    bindSimulationMilitaryRoster(state, stateId, simulation);
  });
}

/** Starts a fresh map without retaining regiments from the prior world. */
export function resetSimulationMilitaryState(simulation: SimulationContext): void {
  simulation.military = {};
}

/** Removes map mirrors when a canonical simulation roster exists. */
export function removeSimulationMilitaryStateMirrors(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.military) return;

  world.pack.states.forEach((state, index) => {
    const stateId = getStateId(state, index);
    if (stateId === null || !Object.hasOwn(simulation.military, stateId)) return;
    delete state.military;
  });
}
