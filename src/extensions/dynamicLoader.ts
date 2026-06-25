/**
 * Dynamic extension loader.
 *
 * Lifecycle per extension:
 *   install  → parseExtensionZip → save to IndexedDB → injectExtension
 *   enable   → injectExtension
 *   disable  → ejectExtension (calls module.cleanup if available)
 *   uninstall → ejectExtension → delete from IndexedDB
 *
 * Each injected extension module is expected to export:
 *   export function init(api: ExtensionAPI): void
 *   export function cleanup(api: ExtensionAPI): void  // optional
 */

import JSZip from "jszip";
import { useExtensionState } from "../store/extensionState";
import type { ExtensionAPI } from "../types/extension-api";
import { type ExtensionManifest, extensionDB, type InstalledExtensionRecord } from "./extensionDB";

interface LoadedExtensionModule {
  init?: (api: ExtensionAPI) => void;
  cleanup?: (api: ExtensionAPI) => void;
}

/** Tracks injected <style> tags and loaded module instances by extension id */
const injectedStyles = new Map<string, HTMLStyleElement>();
const loadedModules = new Map<string, LoadedExtensionModule>();

function getAPI(): ExtensionAPI {
  return window.fmg.extensionAPI;
}

/** Inject CSS and run the module's init() for a given record */
async function injectExtension(record: InstalledExtensionRecord): Promise<void> {
  const { id, jsCode, cssCode } = record;

  if (cssCode) {
    const style = document.createElement("style");
    style.setAttribute("data-fmg-extension", id);
    style.textContent = cssCode;
    document.head.appendChild(style);
    injectedStyles.set(id, style);
  }

  // Create a blob URL, dynamic-import the module, then immediately revoke the URL.
  // Since the extension is a single bundled file (no lazy chunks), revoking after
  // the import() promise resolves is safe.
  const blob = new Blob([jsCode], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = (await import(/* @vite-ignore */ url)) as LoadedExtensionModule;
    loadedModules.set(id, mod);
    mod.init?.(getAPI());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Call cleanup() and remove CSS for a given extension */
function ejectExtension(id: string): void {
  const mod = loadedModules.get(id);
  if (mod) {
    try {
      mod.cleanup?.(getAPI());
    } catch (err) {
      console.error(`[fmg] Extension "${id}" cleanup error:`, err);
    }
    loadedModules.delete(id);
  }

  const style = injectedStyles.get(id);
  if (style) {
    style.remove();
    injectedStyles.delete(id);
  }
}

// ── ZIP parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a ZIP file, validate its manifest.json, and return the data
 * ready to be stored in IndexedDB.
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

  return { id: manifest.id, manifest, jsCode, cssCode, installedAt: Date.now() };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Install an extension from a ZIP File object and activate it immediately */
export async function installExtensionFromZip(file: File): Promise<void> {
  const record = await parseExtensionZip(file);

  const existing = await extensionDB.get(record.id);
  if (existing) {
    ejectExtension(record.id);
    useExtensionState.getState().unregisterExtension(record.id);
  }

  await extensionDB.save(record);

  const { enabledExtensions } = useExtensionState.getState();
  if (enabledExtensions[record.id] ?? true) {
    await injectExtension(record);
  }
}

/** Enable (re-inject) a previously disabled dynamic extension */
export async function enableDynamicExtension(id: string): Promise<void> {
  if (loadedModules.has(id)) return; // already active
  const record = await extensionDB.get(id);
  if (!record) return;
  await injectExtension(record);
}

/** Disable a dynamic extension without removing it from IndexedDB */
export function disableDynamicExtension(id: string): void {
  ejectExtension(id);
  useExtensionState.getState().unregisterExtension(id);
}

/** Fully remove an extension: eject, unregister, delete from IndexedDB */
export async function uninstallExtension(id: string): Promise<void> {
  ejectExtension(id);
  useExtensionState.getState().unregisterExtension(id);
  await extensionDB.delete(id);
}

/**
 * Called at app startup: load all user-installed extensions from IndexedDB.
 * Must run after window.fmg.extensionAPI has been assembled.
 */
export async function loadDynamicExtensions(): Promise<void> {
  const records = await extensionDB.getAll();
  const { enabledExtensions } = useExtensionState.getState();

  for (const record of records) {
    const isEnabled = enabledExtensions[record.id] ?? true;
    if (isEnabled) {
      await injectExtension(record);
    }
  }
}
