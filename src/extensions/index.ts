import { loadDynamicExtensions } from "./dynamicLoader";
import { init as initEconomy } from "./economy/index";
import { init as initNobility } from "./nobility/index";
import { init as initShipbuilding } from "./shipbuilding/index";

/** Initialize all extensions: load builtin extensions then user-installed packages from IndexedDB */
export async function initExtensions(): Promise<void> {
  initEconomy(window.fmg.extensionAPI);
  initNobility(window.fmg.extensionAPI);
  initShipbuilding(window.fmg.extensionAPI);
  await loadDynamicExtensions();
}
