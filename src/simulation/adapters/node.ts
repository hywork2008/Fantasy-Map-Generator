import { BUILTIN_SIMULATION_EXTENSIONS } from "../../extensions/simulation";
import type { CalendarDuration } from "../../runtime/calendarDuration";
import { hashArchiveBytes, type WorldHashReport } from "../goldenHash";
import { createSimulationHost, type SimulationHost } from "../host";
import { createMemorySettings, installSimulationScheduler, installSimulationSettings } from "../ports";
import { installNodeMasterReference } from "./masterReferenceNode";

/**
 * Node Adapter (docs/plan/simulation-core-separation.md §20, S6): a SimulationHost without DOM.
 *
 * Settings live in memory (seeded from a JSON object, the same keys the browser keeps in
 * localStorage), long work yields with `setImmediate`, and the built-in simulation entries are
 * registered in the browser's order. Nothing here touches `window` or `document`, so the same
 * code runs under plain Node, tsx, a Worker or a vitest `node` environment.
 */

export interface NodeSimulationHostOptions {
  /** Built-in extension ids to register (browser order is kept). Default: all. */
  readonly extensions?: readonly string[];
  /** Initial simulation settings (localStorage keys → values). World-scoped ones come from the .fmg. */
  readonly settings?: Readonly<Record<string, string>>;
}

export const BUILTIN_SIMULATION_EXTENSION_IDS: readonly string[] = BUILTIN_SIMULATION_EXTENSIONS.map(ext => ext.id);

const nextMacrotask = () => new Promise<void>(resolve => setImmediate(resolve));

export function createNodeSimulationHost(options: NodeSimulationHostOptions = {}): SimulationHost {
  installNodeMasterReference();
  const wanted = options.extensions ?? BUILTIN_SIMULATION_EXTENSION_IDS;
  const unknown = wanted.filter(id => !BUILTIN_SIMULATION_EXTENSION_IDS.includes(id));
  if (unknown.length) throw new Error(`Unknown simulation extension(s): ${unknown.join(", ")}`);
  installSimulationSettings(createMemorySettings(options.settings));
  installSimulationScheduler(nextMacrotask);
  return createSimulationHost({ extensions: BUILTIN_SIMULATION_EXTENSIONS.filter(ext => wanted.includes(ext.id)) });
}

/**
 * Loads a .fmg and runs the tasks a browser load runs (the port repair), so the loaded world
 * matches what the browser would advance from.
 */
export async function loadWorld(host: SimulationHost, data: Uint8Array): Promise<void> {
  await host.loadArchive(data);
  await host.prepare();
}

/**
 * Advances and lets the work a browser runs right after an Advance Time call finish
 * (Economy's monthly settlement is queued as a microtask).
 */
export async function advanceWorld(host: SimulationHost, duration: CalendarDuration): Promise<void> {
  host.advance(duration);
  await nextMacrotask();
}

/**
 * The golden checkpoints of the Node environment (§8): the fixture after load, then after each
 * cumulative day count. Same procedure as the browser golden runner (scripts/simGolden.mts).
 */
export async function runGoldenCheckpoints(
  host: SimulationHost,
  fixture: Uint8Array,
  days: readonly number[]
): Promise<Record<string, WorldHashReport>> {
  const capture = async () => hashArchiveBytes(await host.saveArchive());
  await loadWorld(host, fixture);
  const checkpoints: Record<string, WorldHashReport> = { "day-0": await capture() };
  let elapsed = 0;
  for (const day of days) {
    await advanceWorld(host, { days: day - elapsed });
    elapsed = day;
    checkpoints[`day-${day}`] = await capture();
  }
  return checkpoints;
}
