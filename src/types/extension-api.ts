/**
 * ExtensionAPI — the single dependency-injection contract between the host app
 * and dynamically loaded extensions.
 *
 * When the host loads an extension module it calls:
 *   module.init(window.fmg.extensionAPI)
 *
 * The extension receives this object and uses it exclusively — it must NOT
 * import directly from host app modules, because dynamic loading creates
 * separate module instances that do not share state with the host.
 *
 * Extension entry-point signature:
 *   export function init(api: ExtensionAPI): void
 *   export function cleanup(api: ExtensionAPI): void   // optional
 */

import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { ExtensionAction, ExtensionConfig, ExtensionDialog } from "../store/extensionState";
import type { LayerConfig } from "../store/layerState";
import type { RichDialogOptions } from "../ui/dialogs/dialogService";

export interface TooltipExtensionHooks {
  showMapTooltip?: (
    point: [number, number],
    e: MouseEvent,
    i: number,
    g: number,
    group: string,
    subgroup: string
  ) => boolean;
  updateCellInfo?: (point: [number, number], i: number, g: number) => void;
}

export interface ExtensionStateSnapshot {
  enabledExtensions: Record<string, boolean>;
}

export interface ExtensionAPI {
  // ── Core contexts ────────────────────────────────────────────────────────
  /** Readonly reference to the host app's world context — same object, shared state. */
  readonly worldContext: WorldContext;
  /** Readonly reference to the host app's view context — same object, shared state. */
  readonly viewContext: ViewContext;

  // ── Extension registry ───────────────────────────────────────────────────
  registerExtension(config: ExtensionConfig, defaultEnabled?: boolean): void;
  registerAction(action: ExtensionAction): void;
  registerDialog(dialog: ExtensionDialog): void;
  /** Remove all registrations for this extension id (called before cleanup/uninstall). */
  unregisterExtension(id: string): void;
  toggleExtension(id: string, forceState?: boolean): void;
  /**
   * Subscribe to extension enable/disable events.
   * Returns an unsubscribe function — call it in cleanup().
   */
  subscribeExtensionState(listener: (state: ExtensionStateSnapshot, prev: ExtensionStateSnapshot) => void): () => void;

  // ── Layer management ─────────────────────────────────────────────────────
  addLayers(layers: LayerConfig[]): void;
  removeLayers(ids: string[]): void;
  toggleLayerById(id: string, event?: MouseEvent): void;
  layerIsOn(id: string): boolean;
  /** Register a toggle handler for an extension-owned layer button id. */
  registerLayerToggle(id: string, handler: (event?: MouseEvent) => void): void;
  /** Register a DOM-element getter for an extension-owned layer. */
  registerLayerElement(id: string, getter: () => HTMLElement | null): void;
  /**
   * Register a hook called at the end of drawLayers().
   * Use this to redraw extension layers after the host redraws everything.
   */
  registerDrawLayerHook(fn: () => void): void;

  // ── Dialog service ───────────────────────────────────────────────────────
  openRichDialog(options: RichDialogOptions): void;
  closeDialog(id: string): void;

  // ── Tooltip hooks ────────────────────────────────────────────────────────
  /**
   * Mutable object for plugging into the host's tooltip/cell-info pipeline.
   * Assign showMapTooltip / updateCellInfo in init(), clear them in cleanup().
   */
  tooltipExtensions: TooltipExtensionHooks;
}
