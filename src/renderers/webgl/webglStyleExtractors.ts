import type { Color } from "@deck.gl/core";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
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

/** Reads the SVG stroke-dasharray values used by WebGL-backed border and route layers. */
export function getPathDashStyles(viewContext: Readonly<ViewContext>): PathDashStyles {
  return {
    stateBorders: getDashArray(viewContext.stateBorders),
    provinceBorders: getDashArray(viewContext.provinceBorders),
    roads: getDashArray(viewContext.roads),
    trails: getDashArray(viewContext.trails),
    searoutes: getDashArray(viewContext.searoutes)
  };
}

/** Reads SVG stroke colors and opacity for borders and route groups. */
export function getPathPaintStyles(viewContext: Readonly<ViewContext>): PathPaintStyles {
  return {
    stateBorders: getStrokePaint(viewContext.stateBorders, "#56566d", 0.8),
    provinceBorders: getStrokePaint(viewContext.provinceBorders, "#56566d", 0.8),
    roads: getStrokePaint(viewContext.roads, "#d06324", 0.9),
    trails: getStrokePaint(viewContext.trails, "#d06324", 0.9),
    searoutes: getStrokePaint(viewContext.searoutes, "#ffffff", 0.9)
  };
}

/** Reads the SVG river fill and opacity, which are applied to every generated river path. */
export function getRiverPaint(viewContext: Readonly<ViewContext>): RiverPaint {
  const rivers = viewContext.rivers;
  const opacity = parseOptionalNumber(rivers?.attr("opacity") ?? rivers?.style("opacity")) ?? 1;
  return {
    color: colorToRgba(rivers?.attr("fill") ?? rivers?.style("fill"), "#5d97bb", opacity)
  };
}

/**
 * deck.gl supports a dash and a gap. SVG permits longer repeating sequences, so use its first
 * pair; the map's border and route style controls use one or two values in all built-in presets.
 */
export function getDashArray(selection: LayerStyleSelection | undefined): DeckPathDashArray {
  if (!selection || selection.empty()) return [0, 0];
  const value = selection.attr("stroke-dasharray") || selection.style("stroke-dasharray");
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

function getStrokePaint(selection: LayerStyleSelection | undefined, fallback: string, opacityFallback: number): Color {
  if (!selection || selection.empty()) return colorToRgba(fallback, fallback, opacityFallback);
  const opacity = parseOptionalNumber(selection.attr("opacity") ?? selection.style("opacity")) ?? opacityFallback;
  return colorToRgba(selection.attr("stroke") ?? selection.style("stroke"), fallback, opacity);
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

  const opacity = parseOptionalNumber(viewContext.ice.attr("opacity") ?? viewContext.ice.style("opacity")) ?? 0.9;
  return {
    fill: colorToRgba(viewContext.ice.attr("fill") ?? viewContext.ice.style("fill"), "#f1f8fe", opacity),
    stroke: colorToRgba(viewContext.ice.attr("stroke") ?? viewContext.ice.style("stroke"), "#e8f0f6", opacity),
    strokeWidth:
      parseOptionalNumber(viewContext.ice.attr("stroke-width") ?? viewContext.ice.style("stroke-width")) ?? 0.5
  };
}

export function getHeightStyle(viewContext: Readonly<ViewContext>): DeckHeightStyle {
  const land = viewContext.terrs?.select<SVGGElement>("#landHeights");
  const ocean = viewContext.terrs?.select<SVGGElement>("#oceanHeights");
  return {
    scheme: land?.attr("scheme") ?? "bright",
    opacity: parseOptionalNumber(land?.attr("opacity") ?? land?.style("opacity")) ?? 1,
    includeOcean: Boolean(Number(ocean?.attr("data-render") ?? 0))
  };
}

export function getEmblemStyle(viewContext: Readonly<ViewContext>): {
  opacity: number;
  sizes: Record<DeckEmblemType, number>;
} {
  const emblems = viewContext.emblems;
  return {
    opacity: parseOptionalNumber(emblems?.attr("opacity") ?? emblems?.style("opacity")) ?? 0.9,
    sizes: {
      state: parseOptionalNumber(emblems?.select<SVGGElement>("#stateEmblems").attr("data-size")) ?? 1,
      province: parseOptionalNumber(emblems?.select<SVGGElement>("#provinceEmblems").attr("data-size")) ?? 1,
      burg: parseOptionalNumber(emblems?.select<SVGGElement>("#burgEmblems").attr("data-size")) ?? 1
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
    const burgStored = getStyleRecord(worldContext.style.burgIcons, group.name);
    burgIcons[group.name] = {
      ...readBurgIconGroupStyle(burgSelection, burgStored, {
        fill: "#3e3e4b",
        opacity: 1,
        size: getDefaultBurgIconSize(group.name),
        icon: "#icon-circle"
      }),
      icon: getStyleString(burgSelection, burgStored, "data-icon") ?? "#icon-circle"
    };
    // Anchors always render via the hardcoded "#icon-anchor" symbol regardless of any stored
    // data-icon (draw-burg-icons.ts's port rendering does not read a per-group icon override).
    anchors[group.name] = {
      ...readBurgIconGroupStyle(
        viewContext.anchors?.select<SVGGElement>(`#${group.name}`),
        getStyleRecord(worldContext.style.anchors, group.name),
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
  const state = readLabelStyle(stateGroup, null, {
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
      getStyleRecord(worldContext.style.burgLabels, group.name),
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
    pinnedOnly: Boolean(Number(markers?.attr("pinned") ?? 0)),
    rescale: (parseOptionalNumber(markers?.attr("rescale")) ?? 1) !== 0,
    scale: viewContext.scale || 1
  };
}

export function getMilitaryBoxSize(viewContext: Readonly<ViewContext>): number {
  return parseOptionalNumber(viewContext.armies?.attr("box-size")) ?? 6;
}

/**
 * Reads per-layer opacity from SVG elements so that WebGL polygon layers
 * visually match the SVG renderer when opacity has been customized by the user.
 * Falls back to the default opacity values from public/styles/clean.json.
 *
 * Note: temperature, precipitation, danger, and population layers do not have
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
  precipitation: number;
  danger: number;
  population: number;
} {
  const readOp = (
    el: { attr(n: string): string | null; style(n: string): string } | null | undefined,
    fallback: number
  ): number => parseOptionalNumber(el?.attr("opacity") ?? el?.style("opacity")) ?? fallback;

  return {
    biomes: readOp(viewContext.biomes, 0.5),
    religions: readOp(viewContext.relig, 0.7),
    cultures: readOp(viewContext.cults, 0.6),
    states: readOp(viewContext.statesBody, 0.3),
    // provinces share the regions/provs SVG group; use provs opacity.
    provinces: readOp(viewContext.provs, 0.7),
    zones: readOp(viewContext.zones, 0.7),
    // These layers have no parent element with a single opacity — use clean.json defaults.
    temperature: 0.72,
    precipitation: 0.75,
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
  stored: Record<string, unknown> | null,
  fallback: DeckLabelStyle
): DeckLabelStyle {
  const fill = getStyleString(selection, stored, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(getStyleString(selection, stored, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(getStyleString(selection, stored, "data-size")) ??
    parseOptionalNumber(getStyleString(selection, stored, "font-size")) ??
    fallback.size;
  const dx = parseOptionalNumber(getStyleString(selection, stored, "data-dx")) ?? fallback.dx;
  const dy = parseOptionalNumber(getStyleString(selection, stored, "data-dy")) ?? fallback.dy;
  const fontFamily = getStyleString(selection, stored, "font-family") ?? fallback.fontFamily;
  const haloColor = getHaloColor(selection, stored) ?? fallback.haloColor;
  return { fill, opacity, size, dx, dy, fontFamily, haloColor };
}

// Label groups set their halo via a CSS text-shadow (e.g. "text-shadow: white 0px 0px 4px" as the
// group's `style` attribute) rather than an SVG stroke, so there's no single presentation
// attribute to read directly — the color is the first token of the text-shadow value across every
// built-in style preset (public/styles/*.json), even though offsets/blur vary.
function getHaloColor(
  selection: LayerStyleSelection | undefined,
  stored: Record<string, unknown> | null
): string | null {
  const styleAttr = getStyleString(selection, stored, "style");
  const shadowMatch = styleAttr?.match(/text-shadow\s*:\s*([^;]+)/);
  if (!shadowMatch) return null;
  const colorMatch = shadowMatch[1].trim().match(/^([a-zA-Z]+|#[0-9a-fA-F]{3,8})/);
  return colorMatch ? colorMatch[1] : null;
}

function readBurgIconGroupStyle(
  selection: LayerStyleSelection | undefined,
  stored: Record<string, unknown> | null,
  fallback: DeckBurgIconStyle
): DeckBurgIconStyle {
  const hasSelection = selection && !selection.empty();
  const fill = getStyleString(selection, stored, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(getStyleString(selection, stored, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(getStyleString(selection, stored, "data-size")) ??
    parseOptionalNumber(getStyleString(selection, stored, "font-size")) ??
    fallback.size;

  if (!hasSelection && !stored) return fallback;
  // `icon` is resolved by the caller (getBurgIconStyle) and spread over this result — this
  // function only ever contributes fill/opacity/size.
  return { fill, opacity, size, icon: fallback.icon };
}

function getStyleString(
  selection: LayerStyleSelection | undefined,
  stored: Record<string, unknown> | null,
  key: string
): string | null {
  if (selection && !selection.empty()) {
    const attr = selection.attr(key);
    if (attr) return attr;
    const style = selection.style(key);
    if (style) return style;
  }
  const storedValue = stored?.[key];
  if (typeof storedValue === "string" && storedValue) return storedValue;
  // Style presets are parsed from JSON before SVG group nodes exist. Numeric attributes such as
  // `font-size` retain their JSON number type until SVG mode has rendered the groups once.
  if (typeof storedValue === "number" && Number.isFinite(storedValue)) return String(storedValue);
  return null;
}

function getStyleRecord(source: object | null | undefined, key: string): Record<string, unknown> | null {
  if (!source) return null;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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
  const opacity = parseOptionalNumber(group.attr("opacity") ?? group.style("opacity")) ?? opacityFallback;
  const fill = colorToRgba(group.attr("fill") ?? group.style("fill"), fillFallback, opacity);
  const stroke = colorToRgba(group.attr("stroke") ?? group.style("stroke"), strokeFallback, opacity);
  return {
    fill,
    stroke,
    strokeWidth: parseOptionalNumber(group.attr("stroke-width") ?? group.style("stroke-width")) ?? strokeWidthFallback
  };
}
