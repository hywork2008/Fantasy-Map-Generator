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

import type { AppServices } from "../context/appServices";
import type { SvgGroup, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { ExtensionAction, ExtensionConfig, ExtensionDialog, ExtensionStyleConfig } from "../store/extensionState";
import type { LayerConfig } from "../store/layerState";
import type { OpenDialogConfig, RichDialogOptions } from "../ui/dialogs/dialogService";

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
  /** Readonly reference to the host app's shared services (RNG, storage, COA renderer). */
  readonly appServices: AppServices;

  // ── Extension registry ───────────────────────────────────────────────────
  registerExtension(config: ExtensionConfig, defaultEnabled?: boolean): void;
  registerAction(action: ExtensionAction): void;
  registerDialog(dialog: ExtensionDialog): void;
  /** Register style configurations and React components for the StyleTab. */
  registerStyleConfig(config: ExtensionStyleConfig): void;
  /** Remove all registrations for this extension id (called before cleanup/uninstall). */
  unregisterExtension(id: string): void;
  toggleExtension(id: string, forceState?: boolean): void;
  /** Returns true if the extension with the given id is currently enabled. */
  isExtensionEnabled(id: string): boolean;
  /**
   * Subscribe to extension enable/disable events.
   * Returns an unsubscribe function — call it in cleanup().
   */
  subscribeExtensionState(listener: (state: ExtensionStateSnapshot, prev: ExtensionStateSnapshot) => void): () => void;

  // ── Layer preset management ──────────────────────────────────────────────
  /** Register a named preset with a human-readable label and a list of layer toggle ids. */
  registerPreset(id: string, label: string, layers: string[]): void;
  /** Remove a previously registered preset. Resets the active preset to "political" if it was active. */
  unregisterPreset(id: string): void;

  // ── Layer management ─────────────────────────────────────────────────────
  addLayers(layers: LayerConfig[]): void;
  removeLayers(ids: string[]): void;
  toggleLayerById(id: string, event?: MouseEvent): void;
  layerIsOn(id: string): boolean;
  /** Mark a layer as active (updates button state and preset). */
  turnLayerOn(id: string): void;
  /** Mark a layer as inactive (updates button state and preset). */
  turnLayerOff(id: string): void;
  /** Register a toggle handler for an extension-owned layer button id. */
  registerLayerToggle(id: string, handler: (event?: MouseEvent) => void): void;
  /** Register a DOM-element getter for an extension-owned layer. */
  registerLayerElement(id: string, getter: () => HTMLElement | null): void;
  /**
   * Register a hook called at the end of drawLayers().
   * Use this to redraw extension layers after the host redraws everything.
   */
  registerDrawLayerHook(fn: () => void): void;
  /**
   * Get the D3 selection for an extension-owned SVG <g> element by its DOM id.
   * Returns null if the layer has not been created yet (extension disabled or not yet initialised).
   */
  getSvgLayer(id: string): SvgGroup | null;
  /**
   * Register a hook called after the host reinitialises its SVG layer references
   * (i.e. after `fmg:reinitialize-map-layers` completes).
   * Use this to re-attach event handlers to extension-owned SVG elements after a map load.
   */
  registerMapReinitHook(fn: () => void): void;

  // ── Dialog service ───────────────────────────────────────────────────────
  openRichDialog(options: RichDialogOptions): void;
  openDialog(id: string, config?: OpenDialogConfig): void;
  closeDialog(id: string): void;
  isDialogOpen(id: string): boolean;

  // ── Tool action registry ─────────────────────────────────────────────────
  /**
   * Register a handler for a named react-tool-action event.
   * tools.ts calls this as a fallback after exhausting built-in handlers,
   * so extensions can own their own button→dialog toggle logic without
   * modifying core controller code.
   */
  registerToolAction(eventName: string, handler: () => void): void;
  /** Unregister a previously registered tool action handler (call in cleanup). */
  unregisterToolAction(eventName: string): void;

  // ── View actions ─────────────────────────────────────────────────────────
  zoomTo(x: number, y: number, scale: number, duration?: number): void;
  /** Restore the default SVG pan/zoom/click handlers after an editing mode exits. */
  restoreDefaultEvents(): void;
  /** Show a brush circle at SVG coordinates (x, y) with radius r. */
  moveCircle(x: number, y: number, r?: number): void;
  /** Remove the brush circle from the SVG. */
  removeCircle(): void;

  // ── Tooltip hooks ────────────────────────────────────────────────────────
  /**
   * Mutable object for plugging into the host's tooltip/cell-info pipeline.
   * Assign showMapTooltip / updateCellInfo in init(), clear them in cleanup().
   */
  tooltipExtensions: TooltipExtensionHooks;
}
