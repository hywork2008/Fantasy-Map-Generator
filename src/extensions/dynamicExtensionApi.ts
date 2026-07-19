import type { WorldRuntime } from "../runtime/worldRuntime";
import type { DynamicExtensionAPI, ExtensionAPI, ExtensionWorldReader } from "../types/extension-api";

/** Narrows the dynamic-extension seam to immutable runtime snapshots. */
export function createDynamicExtensionAPI(api: ExtensionAPI, runtime: Pick<WorldRuntime, "read">): DynamicExtensionAPI {
  const world: ExtensionWorldReader = Object.freeze({ read: () => runtime.read() });

  return Object.freeze({
    ...api,
    world,
    get worldContext() {
      return world.read().world;
    },
    get simulationContext() {
      return world.read().simulation;
    }
  });
}
