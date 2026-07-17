import type { Color } from "@deck.gl/core";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { getPresentationStyle, getPresentationStyleRecord, presentationData } from "../../runtime/presentationData";
import { useOptionsState } from "../../store/optionsState";
import { dampenBurgLabelSize, dampenStateLabelSize } from "../../utils/labelZoomScale";
import {
  colorToRgba,
  type DeckBurgIconStyle,
  type DeckEmblemType,
  type DeckHeightStyle,
  type DeckLabelStyle,
  type DeckMarkerStyle,
  type DeckPathDashArray
} from "./adapters/deckDataAdapters";

export interface LayerPaint {
  fill: Color;
  stroke: Color;
  strokeWidth: number;
}

export interface LayerStyleSelection {
  empty(): boolean;
  attr(name: string): string | null;
  style(name: string): string;
}

export interface PathDashStyles {
  stateBorders: DeckPathDashArray;
  provinceBorders: DeckPathDashArray;
  roads: DeckPathDashArray;
  trails: DeckPathDashArray;
  searoutes: DeckPathDashArray;
}

export interface PathPaintStyles {
  stateBorders: Color;
  provinceBorders: Color;
  roads: Color;
  trails: Color;
  searoutes: Color;
}

export interface RiverPaint {
  color: Color;
}

/**
 * Phase 3 source lookup. The SVG selection is only a legacy-map fallback
 * until every saved map has been imported into PresentationData.
 */
function presentationValue(selector: string, attribute: string): string | undefined {
  const value = getPresentationStyle(presentationData, selector, attribute);
  return value === undefined || value === null ? undefined : String(value);
}

function styleValue(
  selection: (Pick<LayerStyleSelection, "attr" | "style"> & Partial<Pick<LayerStyleSelection, "empty">>) | undefined,
  selector: string,
  attribute: string
): string | undefined {
  const value = presentationValue(selector, attribute);
  if (value !== undefined) return value;
  // D3's attr/style getters dereference the selected node. A group can be
  // absent during the first WebGL frame (before SVG compatibility groups have
  // been created), so an empty selection must use the caller's fallback.
  if (!selection || selection.empty?.()) return undefined;
  return selection.attr(attribute) || selection.style(attribute) || undefined;
}

/** Reads the SVG precipitation circle fill so hybrid mode honors style presets and edits. */
export function getPrecipitationPaint(viewContext: Readonly<ViewContext>): { color: Color } {
  const precipitation = viewContext.prec;
  const opacity = parseOptionalNumber(styleValue(precipitation, "#prec", "opacity")) ?? 1;
  return {
    color: colorToRgba(styleValue(precipitation, "#prec", "fill"), "#0080ff", opacity)
  };
}

/** Reads the SVG stroke-dasharray values used by WebGL-backed border and route layers. */
export function getPathDashStyles(viewContext: Readonly<ViewContext>): PathDashStyles {
  return {
    stateBorders: getDashArray(viewContext.stateBorders, "#stateBorders"),
    provinceBorders: getDashArray(viewContext.provinceBorders, "#provinceBorders"),
    roads: getDashArray(viewContext.roads, "#roads"),
    trails: getDashArray(viewContext.trails, "#trails"),
    searoutes: getDashArray(viewContext.searoutes, "#searoutes")
  };
}

/** Reads SVG stroke colors and opacity for borders and route groups. */
export function getPathPaintStyles(viewContext: Readonly<ViewContext>): PathPaintStyles {
  return {
    stateBorders: getStrokePaint(viewContext.stateBorders, "#stateBorders", "#56566d", 0.8),
    provinceBorders: getStrokePaint(viewContext.provinceBorders, "#provinceBorders", "#56566d", 0.8),
    roads: getStrokePaint(viewContext.roads, "#roads", "#d06324", 0.9),
    trails: getStrokePaint(viewContext.trails, "#trails", "#d06324", 0.9),
    searoutes: getStrokePaint(viewContext.searoutes, "#searoutes", "#ffffff", 0.9)
  };
}

/** Reads the SVG river fill and opacity, which are applied to every generated river path. */
export function getRiverPaint(viewContext: Readonly<ViewContext>): RiverPaint {
  const rivers = viewContext.rivers;
  const opacity = parseOptionalNumber(styleValue(rivers, "#rivers", "opacity")) ?? 1;
  return {
    color: colorToRgba(styleValue(rivers, "#rivers", "fill"), "#5d97bb", opacity)
  };
}

/**
 * deck.gl supports a dash and a gap. SVG permits longer repeating sequences, so use its first
 * pair; the map's border and route style controls use one or two values in all built-in presets.
 */
export function getDashArray(selection: LayerStyleSelection | undefined, selector?: string): DeckPathDashArray {
  if ((!selection || selection.empty()) && !selector) return [0, 0];
  const value = selector
    ? styleValue(selection, selector, "stroke-dasharray")
    : selection?.attr("stroke-dasharray") || selection?.style("stroke-dasharray");
  if (!value || value === "none") return [0, 0];

  const values = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(number => Number.isFinite(number) && number >= 0);
  if (!values.length || values.every(number => number === 0)) return [0, 0];
  if (values.length === 1) return [values[0], values[0]];
  return [values[0], values[1]];
}

function getStrokePaint(
  selection: LayerStyleSelection | undefined,
  selector: string,
  fallback: string,
  opacityFallback: number
): Color {
  if (!selection || selection.empty()) return colorToRgba(fallback, fallback, opacityFallback);
  const opacity = parseOptionalNumber(styleValue(selection, selector, "opacity")) ?? opacityFallback;
  return colorToRgba(styleValue(selection, selector, "stroke"), fallback, opacity);
}

export function getLakePaint(viewContext: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    freshwater: getLayerPaint(viewContext, "lakes", "freshwater", "#a6c1fd", "#5f799d", 0.7, 0.5),
    salt: getLayerPaint(viewContext, "lakes", "salt", "#409b8a", "#388985", 0.7, 0.5),
    sinkhole: getLayerPaint(viewContext, "lakes", "sinkhole", "#5bc9fd", "#53a3b0", 0.7, 1),
    frozen: getLayerPaint(viewContext, "lakes", "frozen", "#cdd4e7", "#cfe0eb", 0, 0.95),
    lava: getLayerPaint(viewContext, "lakes", "lava", "#90270d", "#f93e0c", 2, 0.7),
    dry: getLayerPaint(viewContext, "lakes", "dry", "#c9bfa7", "#8e816f", 0.7, 1)
  };
}

export function getCoastlinePaint(viewContext: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    sea_island: getLayerPaint(viewContext, "coastline", "sea_island", "transparent", "#1f3846", 0.5, 0.5),
    lake_island: getLayerPaint(viewContext, "coastline", "lake_island", "transparent", "#7c8eaf", 0.35, 1)
  };
}

export function getIcePaint(viewContext: Readonly<ViewContext>): LayerPaint {
  const fallback = {
    fill: colorToRgba("#f1f8fe", "#f1f8fe", 0.9),
    stroke: colorToRgba("#e8f0f6", "#e8f0f6", 0.9),
    strokeWidth: 0.5
  };
  if (!viewContext.ice) return fallback;

  const opacity = parseOptionalNumber(styleValue(viewContext.ice, "#ice", "opacity")) ?? 0.9;
  return {
    fill: colorToRgba(styleValue(viewContext.ice, "#ice", "fill"), "#f1f8fe", opacity),
    stroke: colorToRgba(styleValue(viewContext.ice, "#ice", "stroke"), "#e8f0f6", opacity),
    strokeWidth: parseOptionalNumber(styleValue(viewContext.ice, "#ice", "stroke-width")) ?? 0.5
  };
}

export function getHeightStyle(viewContext: Readonly<ViewContext>): DeckHeightStyle {
  const land = viewContext.terrs?.select<SVGGElement>("#landHeights");
  const ocean = viewContext.terrs?.select<SVGGElement>("#oceanHeights");
  return {
    scheme: styleValue(land, "#terrs > #landHeights", "scheme") ?? "bright",
    opacity: parseOptionalNumber(styleValue(land, "#terrs > #landHeights", "opacity")) ?? 1,
    includeOcean: Boolean(Number(styleValue(ocean, "#terrs > #oceanHeights", "data-render") ?? 0))
  };
}

export function getEmblemStyle(viewContext: Readonly<ViewContext>): {
  opacity: number;
  sizes: Record<DeckEmblemType, number>;
} {
  const emblems = viewContext.emblems;
  return {
    opacity: parseOptionalNumber(styleValue(emblems, "#emblems", "opacity")) ?? 0.9,
    sizes: {
      state:
        parseOptionalNumber(
          styleValue(emblems?.select<SVGGElement>("#stateEmblems"), "#emblems > #stateEmblems", "data-size")
        ) ?? 1,
      province:
        parseOptionalNumber(
          styleValue(emblems?.select<SVGGElement>("#provinceEmblems"), "#emblems > #provinceEmblems", "data-size")
        ) ?? 1,
      burg:
        parseOptionalNumber(
          styleValue(emblems?.select<SVGGElement>("#burgEmblems"), "#emblems > #burgEmblems", "data-size")
        ) ?? 1
    }
  };
}

export function getBurgIconStyle(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>
): {
  burgIcons: Record<string, DeckBurgIconStyle>;
  anchors: Record<string, DeckBurgIconStyle>;
  visibleGroups: ReadonlySet<string>;
} {
  const groups = worldContext.options.burgs?.groups ?? [];
  const burgIcons: Record<string, DeckBurgIconStyle> = {};
  const anchors: Record<string, DeckBurgIconStyle> = {};
  const visibleGroups = new Set<string>();

  for (const group of groups) {
    visibleGroups.add(group.name);
    const burgSelection = viewContext.burgIcons?.select<SVGGElement>(`#${group.name}`);
    const burgSelector = `#burgIcons > g#${group.name}`;
    burgIcons[group.name] = {
      ...readBurgIconGroupStyle(burgSelection, burgSelector, {
        fill: "#3e3e4b",
        opacity: 1,
        size: getDefaultBurgIconSize(group.name),
        icon: "#icon-circle"
      }),
      icon: getStyleString(burgSelection, burgSelector, "data-icon") ?? "#icon-circle"
    };
    // Anchors always render via the hardcoded "#icon-anchor" symbol regardless of any stored
    // data-icon (draw-burg-icons.ts's port rendering does not read a per-group icon override).
    anchors[group.name] = {
      ...readBurgIconGroupStyle(
        viewContext.anchors?.select<SVGGElement>(`#${group.name}`),
        `#anchors > g#${group.name}`,
        { fill: "#ffffff", opacity: 1, size: getDefaultAnchorSize(group.name), icon: "#icon-anchor" }
      ),
      icon: "#icon-anchor"
    };
  }

  burgIcons.town ??= { fill: "#3e3e4b", opacity: 1, size: 4, icon: "#icon-circle" };
  anchors.town ??= { fill: "#ffffff", opacity: 1, size: 1, icon: "#icon-anchor" };
  if (!visibleGroups.size) visibleGroups.add("town");
  return { burgIcons, anchors, visibleGroups };
}

export function getLabelStyle(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>
): {
  state: DeckLabelStyle;
  burgLabels: Record<string, DeckLabelStyle>;
  visibleBurgGroups: ReadonlySet<string>;
} {
  // Label sizes are stored (via data-size) as the same zoom-independent base the SVG renderer
  // uses, then dampened here with the identical formula src/main.ts's invokeActiveZooming()
  // applies to the SVG font-size attribute — otherwise WebGL's TextLayer (which scales size
  // linearly with the deck.gl viewport zoom) renders text up to 2x larger than SVG at high zoom.
  const scale = Math.max(viewContext.scale || 1, 0.0001);

  const stateGroup = viewContext.labels?.select<SVGGElement>("#states");
  const state = readLabelStyle(stateGroup, "#labels > #states", {
    fill: "#3e3e4b",
    opacity: 1,
    size: 22,
    dx: 0,
    dy: 0,
    fontFamily: "Almendra SC",
    haloColor: "white"
  });
  if (useOptionsState.getState().rescaleLabels) state.size = dampenStateLabelSize(state.size, scale);

  const burgLabels: Record<string, DeckLabelStyle> = {};
  const visibleBurgGroups = new Set<string>();

  for (const group of worldContext.options.burgs?.groups ?? []) {
    visibleBurgGroups.add(group.name);
    const style = readLabelStyle(
      viewContext.burgLabels?.select<SVGGElement>(`#${group.name}`),
      `#burgLabels > g#${group.name}`,
      {
        fill: "#3e3e4b",
        opacity: 1,
        size: getDefaultBurgLabelSize(group.name),
        dx: 0,
        dy: group.name === "capital" ? -0.5 : -0.4,
        fontFamily: "Almendra SC",
        haloColor: "white"
      }
    );
    style.size = dampenBurgLabelSize(style.size, scale);
    burgLabels[group.name] = style;
  }

  burgLabels.town ??= {
    fill: "#3e3e4b",
    opacity: 1,
    size: dampenBurgLabelSize(4, scale),
    dx: 0,
    dy: -0.4,
    fontFamily: "Almendra SC",
    haloColor: "white"
  };
  if (!visibleBurgGroups.size) visibleBurgGroups.add("town");
  return { state, burgLabels, visibleBurgGroups };
}

export function getMarkerStyle(viewContext: Readonly<ViewContext>): DeckMarkerStyle {
  const markers = viewContext.markers;
  return {
    pinnedOnly: Boolean(Number(styleValue(markers, "#markers", "pinned") ?? 0)),
    rescale: (parseOptionalNumber(styleValue(markers, "#markers", "rescale")) ?? 1) !== 0,
    scale: viewContext.scale || 1
  };
}

export function getMilitaryBoxSize(viewContext: Readonly<ViewContext>): number {
  return parseOptionalNumber(styleValue(viewContext.armies, "#armies", "box-size")) ?? 6;
}

/**
 * Reads per-layer opacity from SVG elements so that WebGL polygon layers
 * visually match the SVG renderer when opacity has been customized by the user.
 * Falls back to the default opacity values from public/styles/clean.json.
 *
 * Note: temperature, danger, and population layers do not have
 * a direct parent SVG element with a single opacity attribute — their opacity is
 * baked into per-cell colour intensity. For those layers the default values serve
 * as the "maximum opacity" cap, matching the SVG renderer's unset (null) convention.
 */
export function getCellLayerOpacities(viewContext: Readonly<ViewContext>): {
  biomes: number;
  religions: number;
  cultures: number;
  states: number;
  provinces: number;
  zones: number;
  temperature: number;
  danger: number;
  population: number;
} {
  const readOp = (
    el: { attr(n: string): string | null; style(n: string): string } | null | undefined,
    fallback: number,
    selector: string
  ): number => parseOptionalNumber(styleValue(el ?? undefined, selector, "opacity")) ?? fallback;

  return {
    biomes: readOp(viewContext.biomes, 0.5, "#biomes"),
    religions: readOp(viewContext.relig, 0.7, "#relig"),
    cultures: readOp(viewContext.cults, 0.6, "#cults"),
    states: readOp(viewContext.statesBody, 0.3, "#statesBody"),
    // provinces share the regions/provs SVG group; use provs opacity.
    provinces: readOp(viewContext.provs, 0.7, "#provs"),
    zones: readOp(viewContext.zones, 0.7, "#zones"),
    // These layers have no parent element with a single opacity — use clean.json defaults.
    temperature: 0.72,
    danger: 0.75,
    population: 0.72
  };
}

export function parseOptionalNumber(value: string | null | undefined): number | null {
  if (!value || value === "none" || value === "null") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readLabelStyle(
  selection: LayerStyleSelection | undefined,
  selector: string,
  fallback: DeckLabelStyle
): DeckLabelStyle {
  const fill = getStyleString(selection, selector, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(getStyleString(selection, selector, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(getStyleString(selection, selector, "data-size")) ??
    parseOptionalNumber(getStyleString(selection, selector, "font-size")) ??
    fallback.size;
  const dx = parseOptionalNumber(getStyleString(selection, selector, "data-dx")) ?? fallback.dx;
  const dy = parseOptionalNumber(getStyleString(selection, selector, "data-dy")) ?? fallback.dy;
  const fontFamily = getStyleString(selection, selector, "font-family") ?? fallback.fontFamily;
  const haloColor = getHaloColor(selection, selector) ?? fallback.haloColor;
  return { fill, opacity, size, dx, dy, fontFamily, haloColor };
}

// Label groups set their halo via a CSS text-shadow (e.g. "text-shadow: white 0px 0px 4px" as the
// group's `style` attribute) rather than an SVG stroke, so there's no single presentation
// attribute to read directly — the color is the first token of the text-shadow value across every
// built-in style preset (public/styles/*.json), even though offsets/blur vary.
function getHaloColor(selection: LayerStyleSelection | undefined, selector: string): string | null {
  const styleAttr = getStyleString(selection, selector, "style");
  const shadowMatch = styleAttr?.match(/text-shadow\s*:\s*([^;]+)/);
  if (!shadowMatch) return null;
  const colorMatch = shadowMatch[1].trim().match(/^([a-zA-Z]+|#[0-9a-fA-F]{3,8})/);
  return colorMatch ? colorMatch[1] : null;
}

function readBurgIconGroupStyle(
  selection: LayerStyleSelection | undefined,
  selector: string,
  fallback: DeckBurgIconStyle
): DeckBurgIconStyle {
  const hasSelection = selection && !selection.empty();
  const fill = getStyleString(selection, selector, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(getStyleString(selection, selector, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(getStyleString(selection, selector, "data-size")) ??
    parseOptionalNumber(getStyleString(selection, selector, "font-size")) ??
    fallback.size;

  if (!hasSelection && !getPresentationStyleRecord(presentationData, selector)) return fallback;
  // `icon` is resolved by the caller (getBurgIconStyle) and spread over this result — this
  // function only ever contributes fill/opacity/size.
  return { fill, opacity, size, icon: fallback.icon };
}

function getStyleString(selection: LayerStyleSelection | undefined, selector: string, key: string): string | null {
  const value = styleValue(selection, selector, key);
  if (value) return value;
  const storedValue = getPresentationStyleRecord(presentationData, selector)?.[key];
  if (typeof storedValue === "string" && storedValue) return storedValue;
  // Style presets are parsed from JSON before SVG group nodes exist. Numeric attributes such as
  // `font-size` retain their JSON number type until SVG mode has rendered the groups once.
  if (typeof storedValue === "number" && Number.isFinite(storedValue)) return String(storedValue);
  return null;
}

function getDefaultBurgLabelSize(group: string): number {
  if (group === "capital") return 6;
  if (group === "city") return 5;
  if (group === "town") return 4;
  if (group === "village") return 3;
  return 2;
}

function getDefaultBurgIconSize(group: string): number {
  if (group === "capital") return 6;
  if (group === "city") return 5;
  if (group === "town") return 4;
  if (group === "village") return 3;
  return 2;
}

function getDefaultAnchorSize(group: string): number {
  if (group === "capital") return 1.9;
  if (group === "city") return 1.5;
  if (group === "town") return 1;
  return 0.7;
}

function getLayerPaint(
  viewContext: Readonly<ViewContext>,
  root: "lakes" | "coastline",
  id: string,
  fillFallback: string,
  strokeFallback: string,
  strokeWidthFallback: number,
  opacityFallback: number
): LayerPaint {
  if (!viewContext[root]) {
    return {
      fill: colorToRgba(fillFallback, fillFallback, opacityFallback),
      stroke: colorToRgba(strokeFallback, strokeFallback, opacityFallback),
      strokeWidth: strokeWidthFallback
    };
  }
  const group = viewContext[root].select<SVGGElement>(`#${id}`);
  const opacity = parseOptionalNumber(styleValue(group, `#${id}`, "opacity")) ?? opacityFallback;
  const fill = colorToRgba(styleValue(group, `#${id}`, "fill"), fillFallback, opacity);
  const stroke = colorToRgba(styleValue(group, `#${id}`, "stroke"), strokeFallback, opacity);
  return {
    fill,
    stroke,
    strokeWidth: parseOptionalNumber(styleValue(group, `#${id}`, "stroke-width")) ?? strokeWidthFallback
  };
}
