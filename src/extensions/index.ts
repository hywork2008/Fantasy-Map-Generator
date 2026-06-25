import { loadDynamicExtensions } from "./dynamicLoader";

/** Initialize all extensions: load user-installed packages from IndexedDB */
export async function initExtensions(): Promise<void> {
  await loadDynamicExtensions();
}
