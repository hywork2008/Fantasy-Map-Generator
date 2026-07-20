import Alea from "alea";

import type { SimulationContext } from "../context/simulationContext";
import { createRNGService, type RNGService } from "../utils/probabilityUtils";
import { SIMULATION_RNG_ALGORITHM, type SimulationRngEngineState, type SimulationRngState } from "./simulationRngTypes";

export type { SimulationRngAlgorithm, SimulationRngEngineState, SimulationRngState } from "./simulationRngTypes";
export { SIMULATION_RNG_ALGORITHM } from "./simulationRngTypes";

type AleaPrng = ReturnType<typeof Alea>;

let livePrng: AleaPrng | null = null;
let liveSeed = "";

export function createSimulationRngState(seed: string): SimulationRngState {
  const prng = Alea(seed);
  return {
    algorithm: SIMULATION_RNG_ALGORITHM,
    seed,
    state: cloneEngineState(prng.exportState())
  };
}

export function assertValidSimulationRngState(value: unknown): asserts value is SimulationRngState {
  if (!isRecord(value)) throw new Error("Archive simulation.rng must be a record");
  if (value.algorithm !== SIMULATION_RNG_ALGORITHM) {
    throw new Error(`Archive simulation.rng algorithm '${String(value.algorithm)}' is unsupported`);
  }
  if (typeof value.seed !== "string") throw new Error("Archive simulation.rng.seed must be a string");
  if (!Array.isArray(value.state) || value.state.length !== 4 || !value.state.every(isFiniteNumber)) {
    throw new Error("Archive simulation.rng.state must be four finite numbers");
  }
}

/** Normalize missing RNG on older archives using the map seed. Mutates `simulation`. */
export function ensureSimulationRngState(simulation: SimulationContext, seed: string): SimulationRngState {
  if (simulation.rng) {
    assertValidSimulationRngState(simulation.rng);
    return simulation.rng;
  }
  const created = createSimulationRngState(seed);
  simulation.rng = created;
  return created;
}

/**
 * Installs `rngState` as the live simulation PRNG and returns an RNGService that
 * draws from it. Callers assign the service to `appServices.rng`.
 */
export function installSimulationRng(rngState: SimulationRngState): RNGService {
  assertValidSimulationRngState(rngState);
  const prng = Alea.importState(cloneEngineState(rngState.state));
  livePrng = prng;
  liveSeed = rngState.seed;
  return createRNGService(() => prng());
}

/** Snapshot the live PRNG into a serializable state, or null if none is installed. */
export function exportLiveSimulationRng(): SimulationRngState | null {
  if (!livePrng) return null;
  return {
    algorithm: SIMULATION_RNG_ALGORITHM,
    seed: liveSeed,
    state: cloneEngineState(livePrng.exportState())
  };
}

/** Write the live PRNG into `simulation.rng` so archive capture sees the current stream. */
export function syncSimulationRngToContext(simulation: SimulationContext): void {
  const exported = exportLiveSimulationRng();
  if (exported) simulation.rng = exported;
}

/**
 * Ensure `simulation.rng` exists, install it as the live stream, and return the
 * service. Used after `world.replace` and map generation.
 */
export function bindSimulationRng(simulation: SimulationContext, seed: string): RNGService {
  const state = ensureSimulationRngState(simulation, seed);
  return installSimulationRng(state);
}

/** True when two RNG snapshots describe the same engine position. */
export function simulationRngStatesEqual(
  a: SimulationRngState | undefined,
  b: SimulationRngState | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.algorithm === b.algorithm &&
    a.seed === b.seed &&
    a.state[0] === b.state[0] &&
    a.state[1] === b.state[1] &&
    a.state[2] === b.state[2] &&
    a.state[3] === b.state[3]
  );
}

function cloneEngineState(
  state: SimulationRngEngineState | [number, number, number, number]
): [number, number, number, number] {
  return [state[0], state[1], state[2], state[3]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
