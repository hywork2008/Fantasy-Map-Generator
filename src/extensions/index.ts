import { loadDynamicExtensions } from "./dynamicLoader";
import { init as initEconomy } from "./economy/index";

/** Initialize all extensions: load builtin extensions then user-installed packages from IndexedDB */
export async function initExtensions(): Promise<void> {
  initEconomy(window.fmg.extensionAPI);
  await loadDynamicExtensions();
}
