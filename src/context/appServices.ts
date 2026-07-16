import Alea from "alea";

import { createRNGService, type RNGService } from "../utils/probabilityUtils";

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
 * (Re)seeds `appServices.rng` with its own Alea stream, independent of the global `Math.random`
 * override. Live tick-driven systems (military simulation, etc.) must read randomness from here
 * rather than `Math.random()` so that unrelated Math.random() consumers elsewhere in the app
 * (UI id generation, autosave, etc.) can't perturb simulation determinism for a given seed.
 * Called once per generation from `setSeed()` in main.ts, alongside the `Math.random` reseed.
 */
export function initRng(seed: string): void {
  appServices.rng = createRNGService(Alea(seed));
}
