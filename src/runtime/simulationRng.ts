import Alea from "alea";

import type { SimulationContext } from "../context/simulationContext";
import { createRNGService, type RNGService } from "../utils/probabilityUtils";
import { SIMULATION_RNG_ALGORITHM, type SimulationRngEngineState, type SimulationRngState } from "./simulationRngTypes";

export type { SimulationRngAlgorithm, SimulationRngEngineState, SimulationRngState } from "./simulationRngTypes";
export { SIMULATION_RNG_ALGORITHM } from "./simulationRngTypes";

type AleaPrng = ReturnType<typeof Alea>;

let livePrng: AleaPrng | null = null;
let liveSeed = "";

/** Identity of one system invocation used to derive an independent stream. */
export interface SystemRngStepKey {
  readonly systemId: string;
  readonly tick: number;
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function createSimulationRngState(seed: string): SimulationRngState {
  const prng = Alea(seed);
  return {
    algorithm: SIMULATION_RNG_ALGORITHM,
    seed,
    state: cloneEngineState(prng.exportState()),
    streams: {}
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
  if (value.streams === undefined) {
    value.streams = {};
  } else {
    assertValidStreamTable(value.streams, "simulation.rng.streams");
  }
}

function assertValidStreamTable(
  value: unknown,
  name: string
): asserts value is Record<string, SimulationRngEngineState> {
  if (!isRecord(value)) throw new Error(`Archive ${name} must be a record`);
  for (const [systemId, state] of Object.entries(value)) {
    if (!systemId.trim()) throw new Error(`Archive ${name} has an empty system id`);
    if (!Array.isArray(state) || state.length !== 4 || !state.every(isFiniteNumber)) {
      throw new Error(`Archive ${name}.${systemId} must be four finite numbers`);
    }
  }
}

/** Normalize missing RNG on older archives using the map seed. Mutates `simulation`. */
export function ensureSimulationRngState(simulation: SimulationContext, seed: string): SimulationRngState {
  if (simulation.rng) {
    assertValidSimulationRngState(simulation.rng);
    if (!simulation.rng.streams) simulation.rng.streams = {};
    return simulation.rng;
  }
  const created = createSimulationRngState(seed);
  simulation.rng = created;
  return created;
}

/**
 * Installs the root `rngState` as the live shared simulation PRNG and returns an
 * RNGService that draws from it. Callers assign the service to `appServices.rng`.
 * Per-system streams are separate — see `createSystemStepRng` / `runWithSystemRng`.
 */
export function installSimulationRng(rngState: SimulationRngState): RNGService {
  assertValidSimulationRngState(rngState);
  const prng = Alea.importState(cloneEngineState(rngState.state));
  livePrng = prng;
  liveSeed = rngState.seed;
  return createRNGService(() => prng());
}

/** Snapshot the live shared PRNG into a serializable root state, or null if none is installed. */
export function exportLiveSimulationRng(): SimulationRngState | null {
  if (!livePrng) return null;
  return {
    algorithm: SIMULATION_RNG_ALGORITHM,
    seed: liveSeed,
    state: cloneEngineState(livePrng.exportState()),
    streams: {}
  };
}

/**
 * Write the live shared PRNG into `simulation.rng` while preserving per-system
 * stream endings captured during this session.
 */
export function syncSimulationRngToContext(simulation: SimulationContext): void {
  const exported = exportLiveSimulationRng();
  if (!exported) return;
  const streams = simulation.rng?.streams ? { ...simulation.rng.streams } : {};
  simulation.rng = {
    algorithm: exported.algorithm,
    seed: exported.seed,
    state: exported.state,
    streams
  };
}

/**
 * Ensure `simulation.rng` exists, install the root stream as the live shared
 * PRNG, and return the service. Used after `world.replace` and map generation.
 */
export function bindSimulationRng(simulation: SimulationContext, seed: string): RNGService {
  const state = ensureSimulationRngState(simulation, seed);
  return installSimulationRng(state);
}

/** True when two root RNG snapshots describe the same shared engine position. */
export function simulationRngStatesEqual(
  a: SimulationRngState | undefined,
  b: SimulationRngState | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.algorithm !== b.algorithm ||
    a.seed !== b.seed ||
    a.state[0] !== b.state[0] ||
    a.state[1] !== b.state[1] ||
    a.state[2] !== b.state[2] ||
    a.state[3] !== b.state[3]
  ) {
    return false;
  }
  return streamTablesEqual(a.streams, b.streams);
}

function streamTablesEqual(
  a: Record<string, SimulationRngEngineState> | undefined,
  b: Record<string, SimulationRngEngineState> | undefined
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const la = left[key];
    const rb = right[key];
    if (!la || !rb) return false;
    if (la[0] !== rb[0] || la[1] !== rb[1] || la[2] !== rb[2] || la[3] !== rb[3]) return false;
  }
  return true;
}

/**
 * Deterministic material for one system invocation. Changing another system's
 * draw count cannot change this string, so streams stay independent.
 */
export function deriveSystemStreamSeed(masterSeed: string, key: SystemRngStepKey): string {
  return `${masterSeed}\u001f${key.systemId}\u001ft${key.tick}\u001f${key.year}-${key.month}-${key.day}`;
}

/**
 * Create a fresh Alea stream for one system step, derived from the master seed
 * and the step key. Does not advance the shared root stream.
 */
export function createSystemStepRng(
  masterSeed: string,
  key: SystemRngStepKey
): { service: RNGService; exportState: () => SimulationRngEngineState } {
  const prng = Alea(deriveSystemStreamSeed(masterSeed, key));
  return {
    service: createRNGService(() => prng()),
    exportState: () => cloneEngineState(prng.exportState())
  };
}

/**
 * Run `fn` with `appServices.rng` temporarily bound to the system step stream,
 * then store the ending engine state under `simulation.rng.streams[systemId]`.
 * Restores the previous `appServices.rng` even when `fn` throws (rollback of
 * the day snapshot still owns restoring simulation.rng as a whole).
 */
export function runWithSystemRng<T>(
  simulation: SimulationContext,
  key: SystemRngStepKey,
  appServicesHolder: { rng: RNGService },
  fn: (rng: RNGService) => T
): T {
  const masterSeed =
    typeof simulation.rng?.seed === "string" && simulation.rng.seed.length > 0 ? simulation.rng.seed : "0";
  const { service, exportState } = createSystemStepRng(masterSeed, key);
  const previous = appServicesHolder.rng;
  appServicesHolder.rng = service;
  try {
    return fn(service);
  } finally {
    appServicesHolder.rng = previous;
    if (!simulation.rng) {
      simulation.rng = createSimulationRngState(masterSeed);
    }
    if (!simulation.rng.streams || typeof simulation.rng.streams !== "object") {
      simulation.rng.streams = {};
    }
    // Only record endings for successful completion paths that leave the finally
    // without the outer day rollback replacing simulation.rng entirely.
    simulation.rng.streams[key.systemId] = exportState();
  }
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
