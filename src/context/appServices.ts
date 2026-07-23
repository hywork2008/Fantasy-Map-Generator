import { bindSimulationRng, createSimulationRngState, installSimulationRng } from "../runtime/simulationRng";
import { createRNGService, type RNGService } from "../utils/probabilityUtils";
import type { SimulationContext } from "./simulationContext";
import { simulationContext } from "./simulationContext";

export type { RNGService };

export interface StorageService {
  get(key: string): Promise<Blob | null>;
  set(key: string, value: Blob): Promise<void>;
}

export interface AppServices {
  rng: RNGService;
  storage: StorageService;
  COArenderer: {
    trigger(id: string, coa: unknown): unknown;
    shieldPaths: Record<string, string>;
    renderIconDataUrl(id: string, coa: unknown): Promise<string | null>;
  } | null;
}

/**
 * Mutable container for application-level services.
 * Populated by main.ts or respective service initialization.
 */
export const appServices: AppServices = {
  // Defaults to a plain Math.random-backed service so callers never crash before the first
  // setSeed()/initRng() of a session (tests, extension init that races generation, etc.).
  // initRng() replaces this with a properly seeded, independent stream once a map exists.
  // Wrapped in a closure (not passed as `Math.random` directly) so a later `vi.spyOn(Math,
  // "random")` in tests — which reassigns the `Math.random` property — is honored on every
  // call instead of being bypassed by a reference captured at this module's load time.
  rng: createRNGService(() => Math.random()),
  storage: {} as StorageService,
  COArenderer: null
};

/**
 * (Re)seeds the simulation PRNG with its own Alea stream, independent of the global
 * `Math.random` override. Live tick-driven systems must read randomness from
 * `appServices.rng` rather than `Math.random()` so unrelated Math.random() consumers
 * (UI id generation, autosave, etc.) cannot perturb simulation determinism for a
 * given seed. The stream position is mirrored into `simulationContext.rng` for
 * archive round-trips. Called once per generation from `setSeed()` in main.ts.
 */
export function initRng(seed: string): void {
  const state = createSimulationRngState(seed);
  simulationContext.rng = state;
  appServices.rng = installSimulationRng(state);
}

/**
 * Restore `appServices.rng` from a simulation slice (e.g. after `.fmg` load).
 * Missing `simulation.rng` is materialised from `seed`. Defaults to the live
 * singleton context when omitted.
 */
export function restoreRngFromSimulation(seed: string, simulation: SimulationContext = simulationContext): void {
  appServices.rng = bindSimulationRng(simulation, seed);
}
