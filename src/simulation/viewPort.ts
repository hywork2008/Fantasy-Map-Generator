import type { Emblem } from "../generators/emblem/generator";

/**
 * View side effects the simulation core requests but must not implement
 * (docs/plan/simulation-core-separation.md §6, S1). The browser app installs the real handlers
 * (toast tooltip, emblem cache, SVG burg icon/label removal) at start-up; without a browser the
 * defaults only log, so the same simulation code runs in Node and tests.
 */
export type SimulationTipType = "info" | "warn" | "error" | "success";

export interface SimulationViewPort {
  /** User-facing notice (the browser shows it as a tooltip/toast). */
  tip(message: string, main?: boolean, type?: SimulationTipType, time?: number): void;
  /** A burg was created after generation; the browser registers its emblem for drawing. */
  burgAdded(burgId: number, coa: Emblem, x: number, y: number): void;
  /** A burg was removed; the browser drops its icon and label. */
  burgRemoved(burgId: number): void;
}

const headlessViewPort: SimulationViewPort = {
  tip: (message, _main, type) => {
    if (type === "error") console.error(message);
    else if (type === "warn") console.warn(message);
  },
  burgAdded: () => {},
  burgRemoved: () => {}
};

let current: SimulationViewPort = headlessViewPort;

export function installSimulationViewPort(port: SimulationViewPort): void {
  current = port;
}

/** Stable facade so callers never hold a stale port. */
export const simulationView: SimulationViewPort = {
  tip: (message, main, type, time) => current.tip(message, main, type, time),
  burgAdded: (burgId, coa, x, y) => current.burgAdded(burgId, coa, x, y),
  burgRemoved: burgId => current.burgRemoved(burgId)
};
