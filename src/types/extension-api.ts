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
import type { SimulationContext } from "../context/simulationContext";
import type { SvgGroup, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { SimulationSystem } from "../generators/simulationSystem";
import type { ExtensionReadRecord, ExtensionWorldReadView } from "../runtime/extensionReadModel";
import type { ExtensionStateSliceSpec } from "../runtime/extensionStateSliceRegistry";
import type { MapReadyTask } from "../runtime/mapReadyTaskCoordinator";
import type {
  DataTopic,
  ExtensionCommandDefinition,
  ExtensionCommandRequest,
  WorldCommit
} from "../runtime/worldRuntime";
import type { BurgEconomySummary } from "../services/burgEconomyExtensions";
import type { SkillModifierFn } from "../services/skillModifierService";
import type {
  BurgOverviewColumn,
  CellInfoRow,
  ExtensionAction,
  ExtensionConfig,
  ExtensionDialog,
  ExtensionEditorTab,
  ExtensionStyleConfig,
  StateOverviewColumn
} from "../store/extensionState";
import type { LayerConfig } from "../store/layerState";
import type { OpenDialogConfig, RichDialogOptions } from "../ui/dialogs/dialogService";
import type { Marker } from "./models";
import type { WebglPickDetail } from "./webglPicking";

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

export interface BurgEconomyExtensionHooks {
  getBurgEconomySummary?: (burgId: number) => BurgEconomySummary | null;
}

export interface ExtensionStateSnapshot {
  enabledExtensions: Record<string, boolean>;
}

export type ExtensionWebglPosition = readonly [number, number];
export type ExtensionWebglColor = readonly [number, number, number, number];

/** Pick metadata that lets an extension-owned deck.gl datum enter the map pick chooser. */
export interface ExtensionWebglPickMetadata {
  kind: "extension";
  extensionId: string;
  cellId: number | null;
}

export interface ExtensionWebglPolygonDatum {
  id: string;
  polygon: readonly ExtensionWebglPosition[];
  fillColor: ExtensionWebglColor;
  kind?: ExtensionWebglPickMetadata["kind"];
  extensionId?: string;
  cellId?: number | null;
}

export interface ExtensionWebglScatterDatum {
  id: string;
  position: ExtensionWebglPosition;
  fillColor: ExtensionWebglColor;
  lineColor?: ExtensionWebglColor;
  radius: number;
  lineWidth?: number;
  kind?: ExtensionWebglPickMetadata["kind"];
  extensionId?: string;
  cellId?: number | null;
}

export interface ExtensionWebglIconDatum {
  id: string;
  position: ExtensionWebglPosition;
  angle: number;
  size: number;
  iconUrl: string;
  kind?: ExtensionWebglPickMetadata["kind"];
  extensionId?: string;
  cellId?: number | null;
  /** Keep reference to raw caravan object if needed by custom pick handler */
  caravan?: unknown;
}

export interface ExtensionWebglPathDatum {
  id: string;
  path: ExtensionWebglPosition[];
  color: ExtensionWebglColor;
  width: number;
  kind?: ExtensionWebglPickMetadata["kind"];
  extensionId?: string;
  cellId?: number | null;
}

/**
 * Extension-provided presentation and selection behavior for a `kind: "extension"` pick.
 * The host keeps chooser DOM and event plumbing, while the extension owns its domain labels
 * and follow-up action.
 */
export interface ExtensionMapPickHandler {
  formatPick(detail: Readonly<WebglPickDetail>): string;
  selectPick?(detail: Readonly<WebglPickDetail>): void;
  /** Optional key for collapsing multiple visual primitives that represent one entity. */
  getEntityKey?(detail: Readonly<WebglPickDetail>): string;
}

/**
 * A declarative WebGL layer supplied by an extension. The host owns deck.gl class
 * construction, caching, visibility and lifecycle; extensions only return data.
 */
export type ExtensionWebglLayer =
  | {
      type: "polygon";
      id: string;
      toggle: string;
      data: readonly ExtensionWebglPolygonDatum[];
      pickable?: boolean;
    }
  | {
      type: "scatter";
      id: string;
      toggle: string;
      data: readonly ExtensionWebglScatterDatum[];
      radiusUnits?: "common" | "pixels";
      pickable?: boolean;
    }
  | {
      type: "icon";
      id: string;
      toggle: string;
      data: readonly ExtensionWebglIconDatum[];
      pickable?: boolean;
    }
  | {
      type: "path";
      id: string;
      toggle: string;
      data: readonly ExtensionWebglPathDatum[];
      pickable?: boolean;
    };

export interface ExtensionWebglLayerSpec {
  /** Must be pure: read extension-owned state and return serializable render descriptors only. */
  build(): readonly ExtensionWebglLayer[];
}

export interface ExtensionAPI {
  // ── Core contexts ────────────────────────────────────────────────────────
  /** Readonly reference to the host app's world context — same object, shared state. */
  readonly worldContext: WorldContext;
  /** Readonly reference to the host app's view context — same object, shared state. */
  readonly viewContext: ViewContext;
  /** Readonly reference to the host app's shared services (RNG, storage, COA renderer). */
  readonly appServices: AppServices;
  /** Readonly reference to the host app's live simulation clock (currentYear, era, tickCount). */
  readonly simulationContext: SimulationContext;

  // ── Extension registry ───────────────────────────────────────────────────
  registerExtension(config: ExtensionConfig, defaultEnabled?: boolean): void;
  registerAction(action: ExtensionAction): void;
  registerDialog(dialog: ExtensionDialog): void;
  /** Register a React component as an additional tab within an existing host editor dialog. */
  registerEditorTab(tab: ExtensionEditorTab): void;
  /** Register style configurations and React components for the StyleTab. */
  registerStyleConfig(config: ExtensionStyleConfig): void;
  /**
   * Register a numeric column shown in the Burgs Overview table (and every table sharing it),
   * positioned after Population. Unlike registerDialog/registerAction/registerEditorTab, this
   * is meant to be toggled live with extension enable state — call again in the enable branch
   * of subscribeExtensionState, and unregisterBurgOverviewColumn in the disable branch.
   */
  registerBurgOverviewColumn(column: BurgOverviewColumn): void;
  unregisterBurgOverviewColumn(id: string): void;
  /** Same as registerBurgOverviewColumn, but for the States Editor overview table. */
  registerStateOverviewColumn(column: StateOverviewColumn): void;
  unregisterStateOverviewColumn(id: string): void;
  /**
   * Register a row appended to the Cell Info dialog. Same live-toggle contract as
   * registerBurgOverviewColumn — the row's value is supplied separately via
   * tooltipExtensions.updateCellInfo, keyed into cellInfoState's `extra` bag by this row's id.
   */
  registerCellInfoRow(row: CellInfoRow): void;
  unregisterCellInfoRow(id: string): void;
  /** Remove all registrations for this extension id (called before cleanup/uninstall). */
  unregisterExtension(id: string): void;
  /** Returns false if the toggle was blocked by an unmet dependency requirement. */
  toggleExtension(id: string, forceState?: boolean): boolean;
  /** Returns true if the extension with the given id is currently enabled. */
  isExtensionEnabled(id: string): boolean;
  /**
   * Subscribe to extension enable/disable events.
   * Returns an unsubscribe function — call it in cleanup().
   */
  subscribeExtensionState(listener: (state: ExtensionStateSnapshot, prev: ExtensionStateSnapshot) => void): () => void;

  /**
   * Register optional initialization that runs only after the newly generated map has painted.
   * Use this for expensive extension data generation instead of blocking fmg:generate-post-core.
   */
  registerMapReadyTask(task: MapReadyTask): () => void;
  /** Queue this extension's map-ready task after a live toggle on an already completed map. */
  requestMapReadyTask(taskId: string): void;

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

  // ── WebGL layer management ──────────────────────────────────────────────
  /** Register declarative extension render data for the host deck.gl renderer. */
  registerWebglLayers(extensionId: string, spec: ExtensionWebglLayerSpec): void;
  /** Stop contributing deck.gl layers for this extension. */
  unregisterWebglLayers(extensionId: string): void;
  /** Rebuild deck.gl layers when extension-owned display data changes. No-op outside WebGL hybrid mode. */
  requestWebglRender(): void;

  // ── WebGL map picking ───────────────────────────────────────────────────
  /** Register formatter and optional selection behavior for this extension's WebGL pick candidates. */
  registerMapPickHandler(extensionId: string, handler: ExtensionMapPickHandler): void;
  /** Remove a previously registered WebGL map pick handler. */
  unregisterMapPickHandler(extensionId: string): void;

  // ── Map annotations (markers + notes) ───────────────────────────────────
  /**
   * Creates a `pack.markers` entry plus its paired note in one step, same shape as the host's own
   * `worldRuntime.createMarker()` (docs/plan/great-library.md §Marker作成経路). The caller supplies
   * every `Marker` field except `i` — the host allocates the id and derives `note.id = "marker" +
   * i` itself, so callers never invent or collide on marker/note ids. Calls
   * `requestWebglRender()` internally on success. Returns null if marker creation fails (e.g. an
   * invalid cell).
   */
  createMapMarker(input: {
    marker: Omit<Marker, "i">;
    note: { name: string; legend: string };
  }): { markerId: number; noteId: string } | null;
  /**
   * Patches an existing marker's fields and/or its paired note's name/legend in place. Returns
   * false if no marker with this id exists. Calls `requestWebglRender()` internally on success.
   */
  updateMapMarker(
    markerId: number,
    patch: Partial<Omit<Marker, "i">> & { noteName?: string; noteLegend?: string }
  ): boolean;

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
  registerToolAction(eventName: string, handler: (detail?: Record<string, unknown>) => void): void;
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

  // ── Simulation clock ─────────────────────────────────────────────────────
  /**
   * @deprecated Prefer `registerSimulationSystem()`. Built-in extensions have
   * migrated; this remains for unmigrated dynamic ZIP packages only.
   *
   * Compatibility wrapper: each hook becomes a politics-phase system, stays
   * registered for the session, and preserves registration order among other
   * legacy hooks. `label` names the tick profiler entry; `writes` is the
   * fallback topic set when the hook returns void.
   */
  registerTimeTickHook(
    hook: (deltaYears: number, deltaMonths: number, deltaDays: number) => readonly DataTopic[] | undefined,
    label?: string,
    writes?: readonly DataTopic[]
  ): void;
  /**
   * Register a synchronous system with explicit phase, cadence, dependencies,
   * and WorldRuntime topics. Preferred entry for any new simulation work.
   * The system must not import host Renderer modules; return only topics that
   * changed this tick. Call the returned function from `cleanup()`.
   */
  registerSimulationSystem(system: SimulationSystem): () => void;

  /**
   * Register a validated extension-owned writer. Its changes are committed as
   * `extension.<extensionId>`; call the returned function during cleanup.
   */
  registerExtensionCommand(command: ExtensionCommandDefinition): () => void;
  /** Execute a command previously registered by an extension. */
  dispatchExtensionCommand(request: ExtensionCommandRequest): WorldCommit<unknown> | null;
  /**
   * Register schema / validation / migration / core-reference collection for
   * this extension's simulation slice. Host codec ownership stays in the
   * archive adapter; the extension only owns the slice shape. Matching opaque
   * archive chunks are promoted after successful migrate+validate. Call the
   * returned function only on uninstall — disable must not unregister the slice
   * if data should remain under host delete policy.
   */
  registerStateSlice(spec: ExtensionStateSliceSpec): () => void;

  // ── Skill modifier chain ─────────────────────────────────────────────────
  /**
   * Registers a cross-extension modifier for character skill values (e.g. Nobility
   * supplies each character's base skill; other extensions can layer further
   * adjustments). Run in registration order. Returns an unregister function — call
   * it in cleanup().
   */
  registerSkillModifier(source: string, fn: SkillModifierFn): () => void;
  /**
   * Effective value of a character's skill after all registered modifiers have run.
   * Returns 0 if nothing has registered (e.g. Nobility disabled/not installed) —
   * treat 0 as "no data", not "unskilled".
   */
  getEffectiveSkill(characterId: number, skill: string): number;

  // ── Tooltip hooks ────────────────────────────────────────────────────────
  /**
   * Mutable object for plugging into the host's tooltip/cell-info pipeline.
   * Assign showMapTooltip / updateCellInfo in init(), clear them in cleanup().
   */
  tooltipExtensions: TooltipExtensionHooks;

  // ── Burg editor hooks ────────────────────────────────────────────────────
  /**
   * Mutable object for supplying the Burg Editor's Production/Wealth/Treasury
   * display. Assign getBurgEconomySummary in init(), clear it in cleanup().
   */
  burgEconomyExtensions: BurgEconomyExtensionHooks;
}

/** Refreshable immutable world snapshot access granted to dynamic ZIP extensions. */
export interface ExtensionWorldReader {
  read(): ExtensionWorldReadView;
}

/**
 * Dynamic-extension contract. Compatibility context names resolve to immutable
 * facades; canonical data can only change through registered commands.
 */
export interface DynamicExtensionAPI extends Omit<ExtensionAPI, "worldContext" | "simulationContext"> {
  readonly world: ExtensionWorldReader;
  readonly worldContext: ExtensionReadRecord;
  readonly simulationContext: ExtensionReadRecord;
}
