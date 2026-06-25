import JSZip from "jszip";
import { useExtensionState } from "../store/extensionState";
import { type ExtensionManifest, extensionDB, type InstalledExtensionRecord } from "./extensionDB";

// Track injected DOM elements by extension id so we can eject them later
const injectedScripts = new Map<string, HTMLScriptElement>();
const injectedStyles = new Map<string, HTMLStyleElement>();
// Blob URLs need revocation to avoid memory leaks
const blobURLs = new Map<string, string>();

/** Inject a previously stored extension record into the page */
async function injectExtension(record: InstalledExtensionRecord): Promise<void> {
  const { id, jsCode, cssCode } = record;

  if (cssCode) {
    const style = document.createElement("style");
    style.setAttribute("data-fmg-extension", id);
    style.textContent = cssCode;
    document.head.appendChild(style);
    injectedStyles.set(id, style);
  }

  // Use blob URL so the module can use import.meta / relative imports safely
  const blob = new Blob([jsCode], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  blobURLs.set(id, url);

  const script = document.createElement("script");
  script.type = "module";
  script.src = url;
  script.setAttribute("data-fmg-extension", id);
  document.head.appendChild(script);
  injectedScripts.set(id, script);
}

/** Remove injected DOM elements for an extension */
function ejectExtension(id: string): void {
  const script = injectedScripts.get(id);
  if (script) {
    script.remove();
    injectedScripts.delete(id);
  }
  const style = injectedStyles.get(id);
  if (style) {
    style.remove();
    injectedStyles.delete(id);
  }
  const url = blobURLs.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    blobURLs.delete(id);
  }
}

/**
 * Parse a ZIP file, validate its manifest.json, and return the data
 * needed to store in IndexedDB.
 */
export async function parseExtensionZip(file: File): Promise<InstalledExtensionRecord> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("manifest.json not found in ZIP");

  const manifest = JSON.parse(await manifestFile.async("string")) as ExtensionManifest;
  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error("manifest.json must contain id, name, and version fields");
  }

  // Find the first .js / .mjs file as the main entry
  const jsEntry = Object.keys(zip.files).find(name => !zip.files[name].dir && /\.(m?js)$/.test(name));
  if (!jsEntry) throw new Error("No .js or .mjs file found in ZIP");
  const jsCode = await zip.files[jsEntry].async("string");

  // Optional CSS
  const cssEntry = Object.keys(zip.files).find(name => !zip.files[name].dir && /\.css$/.test(name));
  const cssCode = cssEntry ? await zip.files[cssEntry].async("string") : undefined;

  return {
    id: manifest.id,
    manifest,
    jsCode,
    cssCode,
    installedAt: Date.now()
  };
}

/** Install an extension from a ZIP File object and inject it immediately */
export async function installExtensionFromZip(file: File): Promise<void> {
  const record = await parseExtensionZip(file);
  const existing = await extensionDB.get(record.id);
  if (existing) {
    // Upgrade: eject old version first
    ejectExtension(record.id);
    useExtensionState.getState().unregisterExtension(record.id);
  }
  await extensionDB.save(record);

  const { enabledExtensions } = useExtensionState.getState();
  const isEnabled = enabledExtensions[record.id] ?? true;
  if (isEnabled) {
    await injectExtension(record);
  }
}

/** Enable a dynamically installed extension */
export async function enableDynamicExtension(id: string): Promise<void> {
  const record = await extensionDB.get(id);
  if (!record || record.builtin) return;
  if (!injectedScripts.has(id)) {
    await injectExtension(record);
  }
}

/** Disable a dynamically installed extension */
export function disableDynamicExtension(id: string): void {
  ejectExtension(id);
  useExtensionState.getState().unregisterExtension(id);
}

/** Uninstall a dynamically installed extension */
export async function uninstallExtension(id: string): Promise<void> {
  ejectExtension(id);
  useExtensionState.getState().unregisterExtension(id);
  await extensionDB.delete(id);
}

/** Load all user-installed extensions from IndexedDB on app startup */
export async function loadDynamicExtensions(): Promise<void> {
  const records = await extensionDB.getAll();
  const { enabledExtensions } = useExtensionState.getState();

  for (const record of records) {
    if (record.builtin) continue; // built-ins are handled separately
    const isEnabled = enabledExtensions[record.id] ?? true;
    if (isEnabled) {
      await injectExtension(record);
    }
  }
}
