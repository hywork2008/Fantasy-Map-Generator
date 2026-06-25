import { loadDynamicExtensions } from "./dynamicLoader";
import { initEconomyExtension } from "./economy";

/** Register all built-in (statically compiled) extensions */
function initBuiltinExtensions(): void {
  initEconomyExtension();
}

/** Initialize all extensions: built-ins first, then user-installed from IndexedDB */
export async function initExtensions(): Promise<void> {
  initBuiltinExtensions();
  await loadDynamicExtensions();
}
