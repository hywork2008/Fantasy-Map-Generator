import type { ExtensionStateSnapshot } from "../types/extension-api";

/**
 * Which extensions are enabled, as the simulation core sees it (docs/plan/simulation-core-separation.md
 * §7, S5). The browser backs this with the Extensions tab store (persisted per browser); a headless
 * run uses a fixed set. Systems and handlers ask at call time, so toggling takes effect immediately.
 */
export interface SimulationExtensionEnablement {
  isEnabled(id: string): boolean;
  subscribe(listener: (state: ExtensionStateSnapshot, prev: ExtensionStateSnapshot) => void): () => void;
}

export interface StaticExtensionEnablement extends SimulationExtensionEnablement {
  setEnabled(id: string, enabled: boolean): void;
}

/** Enablement held in memory (Node, tests). Listeners fire synchronously on every change. */
export function createStaticEnablement(enabledIds: Iterable<string> = []): StaticExtensionEnablement {
  let enabled: Record<string, boolean> = Object.fromEntries([...enabledIds].map(id => [id, true]));
  const listeners = new Set<(state: ExtensionStateSnapshot, prev: ExtensionStateSnapshot) => void>();
  return {
    isEnabled: id => enabled[id] ?? false,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled: (id, value) => {
      if ((enabled[id] ?? false) === value) return;
      const prev = { enabledExtensions: enabled };
      enabled = { ...enabled, [id]: value };
      for (const listener of [...listeners]) listener({ enabledExtensions: enabled }, prev);
    }
  };
}

let active: SimulationExtensionEnablement = createStaticEnablement();

/** Installed by the SimulationHost; core code that is not an extension reads it through here. */
export function installExtensionEnablement(enablement: SimulationExtensionEnablement): void {
  active = enablement;
}

export function isSimulationExtensionEnabled(id: string): boolean {
  return active.isEnabled(id);
}
