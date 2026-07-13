import type { Deck, OrthographicView } from "@deck.gl/core";
import type { Line, Selection, ZoomBehavior } from "d3";

export type SvgGroup = Selection<SVGGElement, unknown, null, undefined>;
export type RenderMode = "svg" | "webglHybrid";

const storedRenderMode =
  typeof localStorage === "undefined" ? null : (localStorage.getItem("fmg-render-mode") as RenderMode | null);

export function isWebgl2Available(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
  } catch (_e) {
    return false;
  }
}

const canUseWebgl = isWebgl2Available();
const defaultRenderMode: RenderMode = "svg";
const initialRenderMode: RenderMode =
  storedRenderMode === "svg"
    ? "svg"
    : storedRenderMode === "webglHybrid" && canUseWebgl
      ? "webglHybrid"
      : defaultRenderMode;

/** Core SVG structure and viewport infrastructure. */
export interface RootLayers {
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
  defs: Selection<SVGDefsElement, unknown, null, undefined>;
  viewbox: SvgGroup;
  scaleBar: SvgGroup;
  legend: SvgGroup;
  /** Always-visible in-world calendar readout (current year/era), fixed screen-space overlay. */
  calendar: SvgGroup;
  ruler: SvgGroup;
  debug: SvgGroup;
  fogging: SvgGroup | null;
}

/** Natural environment layers. */
export interface EnvironmentLayers {
  ocean: SvgGroup;
  oceanLayers: SvgGroup;
  oceanPattern: SvgGroup;
  landmass: SvgGroup;
  texture: SvgGroup;
  terrs: SvgGroup;
  lakes: SvgGroup;
  biomes: SvgGroup;
  rivers: SvgGroup;
  terrain: SvgGroup;
  coastline: SvgGroup;
  ice: SvgGroup;
  prec: SvgGroup;
  temperature: SvgGroup;
  danger: SvgGroup;
}

/** Political and cultural division layers. */
export interface PoliticalLayers {
  relig: SvgGroup;
  cults: SvgGroup;
  regions: SvgGroup;
  statesBody: SvgGroup;
  statesHalo: SvgGroup;
  provs: SvgGroup;
  zones: SvgGroup;
  borders: SvgGroup;
  stateBorders: SvgGroup;
  provinceBorders: SvgGroup;
}

/** Route and transport infrastructure layers. */
export interface InfrastructureLayers {
  routes: SvgGroup;
  roads: SvgGroup;
  trails: SvgGroup;
  searoutes: SvgGroup;
}

/** Settlement, label and military layers. */
export interface SettlementLayers {
  icons: SvgGroup;
  labels: SvgGroup;
  burgLabels: SvgGroup;
  burgIcons: SvgGroup;
  anchors: SvgGroup;
  armies: SvgGroup;
  markers: SvgGroup;
  emblems: SvgGroup;
  population: SvgGroup;
}

/** Map overlay and diagnostic layers. */
export interface OverlayLayers {
  cells: SvgGroup;
  gridOverlay: SvgGroup;
  coordinates: SvgGroup;
  compass: SvgGroup;
}

/**
 * Scope that narrows rendering to a single state or province, or null to draw the whole map.
 * `cellIds` are packed-graph cell indices (`pack.cells`). `gridCellIds` are the corresponding
 * raw-grid cell indices (`grid.cells`, mapped via `pack.cells.g`) — a few renderers (temperature,
 * precipitation, ice) walk the pre-pack grid rather than `pack`, and need this separate index space.
 */
export interface FocusScope {
  kind: "state" | "province";
  id: number;
  /** Owning state id — equal to `id` when `kind === "state"`, the parent state when `kind === "province"`. */
  stateId: number;
  cellIds: Set<number>;
  gridCellIds: Set<number>;
  label: string;
}

/** Focus/isolation view state. Set and cleared exclusively by src/controllers/focus-view.ts. */
export interface FocusFields {
  focusScope: FocusScope | null;
}

/** Zoom/pan state, display dimensions, and editor mode. */
export interface ViewState {
  zoom: ZoomBehavior<SVGSVGElement, unknown>;
  viewX: number;
  viewY: number;
  /** Zoom scale level (1 = no zoom) */
  scale: number;
  /** Current editor customization mode (0 = default, 1 = heightmap edit, etc.) */
  customization: number;
  /**
   * Display width of the SVG element — Math.min(graphWidth, window.innerWidth).
   * Changes on browser resize; view concern, not world data.
   */
  svgWidth: number;
  /**
   * Display height of the SVG element — Math.min(graphHeight, window.innerHeight).
   * Changes on browser resize; view concern, not world data.
   */
  svgHeight: number;
  /** D3 curveBasis line generator shared by renderers and editors. */
  lineGen: Line<[number, number]>;
  /** Flag to determine if map drawing/rendering should occur */
  renderMap: boolean;
  /** Active 2D map renderer. SVG remains the default and compatibility renderer. */
  renderMode: RenderMode;
  /** Canvas owned by the deck.gl hybrid renderer. Null until map infrastructure is initialized. */
  webglCanvas: HTMLCanvasElement | null;
  /** deck.gl instance owned by the hybrid renderer. Null when SVG rendering is active or unavailable. */
  webglDeck: Deck<OrthographicView> | null;
  /** State selected in the Diplomacy Editor; null restores normal political colours. */
  diplomacySelectedStateId: number | null;
}

/**
 * Full view context: composition of all domain-grouped layer interfaces.
 * Renderers should declare only the group(s) they need rather than this full type.
 */
export interface ViewContext
  extends RootLayers,
    EnvironmentLayers,
    PoliticalLayers,
    InfrastructureLayers,
    SettlementLayers,
    OverlayLayers,
    ViewState,
    FocusFields {}

/**
 * Single mutable container for all SVG layer references and zoom state.
 * Cast as ViewContext immediately — properties are guaranteed to be assigned by
 * initViewLayers.createViewLayers() during the synchronous SVG setup phase before any renderer runs.
 */
export const viewContext = {
  fogging: null,
  focusScope: null,
  scale: 1,
  customization: 0,
  svgWidth: 0,
  svgHeight: 0,
  renderMap: true,
  renderMode: initialRenderMode,
  webglCanvas: null,
  webglDeck: null,
  diplomacySelectedStateId: null,
  lineGen: (() => "") as unknown as Line<[number, number]>
} as ViewContext;
