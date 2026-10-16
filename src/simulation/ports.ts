/**
 * Host ports for the simulation core (docs/plan/simulation-core-separation.md §6.2–6.3, S3).
 *
 * The core must not reach `localStorage` or `requestAnimationFrame` directly. It goes through
 * `simulationSettings` and `yieldToHost`, whose defaults resolve the browser globals at call time
 * (so the browser app behaves exactly as before without any setup) and fall back to an in-memory
 * store / `setImmediate` where those globals do not exist (Node, Workers). A headless runner can
 * install its own settings source, e.g. one read from a JSON file.
 */

export interface SimulationSettingsSource {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory settings, used where no browser storage exists. */
export function createMemorySettings(initial: Readonly<Record<string, string>> = {}): SimulationSettingsSource {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: key => {
      values.delete(key);
    }
  };
}

const fallbackSettings = createMemorySettings();
let installedSettings: SimulationSettingsSource | null = null;

function activeSettings(): SimulationSettingsSource {
  if (installedSettings) return installedSettings;
  return typeof localStorage === "undefined" ? fallbackSettings : localStorage;
}

/** Replaces the settings source (pass `null` to return to the browser/in-memory default). */
export function installSimulationSettings(source: SimulationSettingsSource | null): void {
  installedSettings = source;
}

/**
 * Persisted simulation settings (merchant route preference, grade-effect strength, trade logistics,
 * allowed races, …). Same contract as `localStorage`, including throwing on a full or blocked store.
 */
export const simulationSettings: SimulationSettingsSource = {
  getItem: key => activeSettings().getItem(key),
  setItem: (key, value) => activeSettings().setItem(key, value),
  removeItem: key => activeSettings().removeItem(key)
};

type Scheduler = () => Promise<void>;
let installedScheduler: Scheduler | null = null;

/** Replaces how long-running work yields to its host (pass `null` for the default). */
export function installSimulationScheduler(scheduler: Scheduler | null): void {
  installedScheduler = scheduler;
}

/**
 * Lets the host breathe during long incremental work: the next animation frame in a browser
 * (so the UI repaints, as before), the next macrotask elsewhere.
 */
export function yieldToHost(): Promise<void> {
  if (installedScheduler) return installedScheduler();
  if (typeof requestAnimationFrame === "function")
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const { setImmediate } = globalThis as { setImmediate?: (callback: () => void) => unknown };
  if (typeof setImmediate === "function") return new Promise<void>(resolve => setImmediate(resolve));
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}
