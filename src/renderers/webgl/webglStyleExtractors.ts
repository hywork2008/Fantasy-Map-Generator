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

/** @deprecated Live SVG is not a WebGL style source; retained only for call-site typing during migration. */
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
 * Canonical WebGL style source. Live SVG attributes are never read here —
 * style presets, the style editor, and legacy `.map` import write into
 * PresentationData; SVG is only a projection of that data.
 */
function presentationValue(selector: string, attribute: string): string | undefined {
  const value = getPresentationStyle(presentationData, selector, attribute);
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function styleString(selector: string, attribute: string): string | null {
  const value = presentationValue(selector, attribute);
  if (value) return value;
  const storedValue = getPresentationStyleRecord(presentationData, selector)?.[attribute];
  if (typeof storedValue === "string" && storedValue) return storedValue;
  // Style presets are parsed from JSON; numeric attributes retain their JSON number type.
  if (typeof storedValue === "number" && Number.isFinite(storedValue)) return String(storedValue);
  return null;
}

/** Precipitation circle fill from PresentationData (selector `#prec`). */
export function getPrecipitationPaint(_viewContext?: Readonly<ViewContext>): { color: Color } {
  const opacity = parseOptionalNumber(presentationValue("#prec", "opacity")) ?? 1;
  return {
    color: colorToRgba(presentationValue("#prec", "fill"), "#0080ff", opacity)
  };
}

/** Border and route dash patterns from PresentationData. */
export function getPathDashStyles(_viewContext?: Readonly<ViewContext>): PathDashStyles {
  return {
    stateBorders: getDashArray("#stateBorders"),
    provinceBorders: getDashArray("#provinceBorders"),
    roads: getDashArray("#roads"),
    trails: getDashArray("#trails"),
    searoutes: getDashArray("#searoutes")
  };
}

/** Border and route stroke colors from PresentationData. */
export function getPathPaintStyles(_viewContext?: Readonly<ViewContext>): PathPaintStyles {
  return {
    stateBorders: getStrokePaint("#stateBorders", "#56566d", 0.8),
    provinceBorders: getStrokePaint("#provinceBorders", "#56566d", 0.8),
    roads: getStrokePaint("#roads", "#d06324", 0.9),
    trails: getStrokePaint("#trails", "#d06324", 0.9),
    searoutes: getStrokePaint("#searoutes", "#ffffff", 0.9)
  };
}

/** River fill and opacity from PresentationData. */
export function getRiverPaint(_viewContext?: Readonly<ViewContext>): RiverPaint {
  const opacity = parseOptionalNumber(presentationValue("#rivers", "opacity")) ?? 1;
  return {
    color: colorToRgba(presentationValue("#rivers", "fill"), "#5d97bb", opacity)
  };
}

/**
 * deck.gl supports a dash and a gap. SVG permits longer repeating sequences, so use its first
 * pair; the map's border and route style controls use one or two values in all built-in presets.
 *
 * @param selector Presentation style selector (e.g. `"#stateBorders"`).
 */
export function getDashArray(selector: string): DeckPathDashArray {
  const value = presentationValue(selector, "stroke-dasharray");
  return parseDashArray(value);
}

/** Pure parser for stroke-dasharray strings (also used by tests). */
export function parseDashArray(value: string | null | undefined): DeckPathDashArray {
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

function getStrokePaint(selector: string, fallback: string, opacityFallback: number): Color {
  const opacity = parseOptionalNumber(presentationValue(selector, "opacity")) ?? opacityFallback;
  return colorToRgba(presentationValue(selector, "stroke"), fallback, opacity);
}

export function getLakePaint(_viewContext?: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    freshwater: getLayerPaint("freshwater", "#a6c1fd", "#5f799d", 0.7, 0.5),
    salt: getLayerPaint("salt", "#409b8a", "#388985", 0.7, 0.5),
    sinkhole: getLayerPaint("sinkhole", "#5bc9fd", "#53a3b0", 0.7, 1),
    frozen: getLayerPaint("frozen", "#cdd4e7", "#cfe0eb", 0, 0.95),
    lava: getLayerPaint("lava", "#90270d", "#f93e0c", 2, 0.7),
    dry: getLayerPaint("dry", "#c9bfa7", "#8e816f", 0.7, 1)
  };
}

export function getCoastlinePaint(_viewContext?: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    sea_island: getLayerPaint("sea_island", "transparent", "#1f3846", 0.5, 0.5),
    lake_island: getLayerPaint("lake_island", "transparent", "#7c8eaf", 0.35, 1)
  };
}

export function getIcePaint(_viewContext?: Readonly<ViewContext>): LayerPaint {
  const opacity = parseOptionalNumber(presentationValue("#ice", "opacity")) ?? 0.9;
  return {
    fill: colorToRgba(presentationValue("#ice", "fill"), "#f1f8fe", opacity),
    stroke: colorToRgba(presentationValue("#ice", "stroke"), "#e8f0f6", opacity),
    strokeWidth: parseOptionalNumber(presentationValue("#ice", "stroke-width")) ?? 0.5
  };
}

export function getHeightStyle(_viewContext?: Readonly<ViewContext>): DeckHeightStyle {
  return {
    scheme: presentationValue("#terrs > #landHeights", "scheme") ?? "bright",
    opacity: parseOptionalNumber(presentationValue("#terrs > #landHeights", "opacity")) ?? 1,
    includeOcean: Boolean(Number(presentationValue("#terrs > #oceanHeights", "data-render") ?? 0))
  };
}

export function getEmblemStyle(_viewContext?: Readonly<ViewContext>): {
  opacity: number;
  sizes: Record<DeckEmblemType, number>;
} {
  return {
    opacity: parseOptionalNumber(presentationValue("#emblems", "opacity")) ?? 0.9,
    sizes: {
      state: parseOptionalNumber(presentationValue("#emblems > #stateEmblems", "data-size")) ?? 1,
      province: parseOptionalNumber(presentationValue("#emblems > #provinceEmblems", "data-size")) ?? 1,
      burg: parseOptionalNumber(presentationValue("#emblems > #burgEmblems", "data-size")) ?? 1
    }
  };
}

export function getBurgIconStyle(
  worldContext: Readonly<WorldContext>,
  _viewContext?: Readonly<ViewContext>
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
    const burgSelector = `#burgIcons > g#${group.name}`;
    burgIcons[group.name] = {
      ...readBurgIconGroupStyle(burgSelector, {
        fill: "#3e3e4b",
        opacity: 1,
        size: getDefaultBurgIconSize(group.name),
        icon: "#icon-circle"
      }),
      icon: styleString(burgSelector, "data-icon") ?? "#icon-circle"
    };
    // Anchors always render via the hardcoded "#icon-anchor" symbol regardless of any stored
    // data-icon (draw-burg-icons.ts's port rendering does not read a per-group icon override).
    anchors[group.name] = {
      ...readBurgIconGroupStyle(`#anchors > g#${group.name}`, {
        fill: "#ffffff",
        opacity: 1,
        size: getDefaultAnchorSize(group.name),
        icon: "#icon-anchor"
      }),
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

  const state = readLabelStyle("#labels > #states", {
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
    const style = readLabelStyle(`#burgLabels > g#${group.name}`, {
      fill: "#3e3e4b",
      opacity: 1,
      size: getDefaultBurgLabelSize(group.name),
      dx: 0,
      dy: group.name === "capital" ? -0.5 : -0.4,
      fontFamily: "Almendra SC",
      haloColor: "white"
    });
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
  return {
    pinnedOnly: Boolean(Number(presentationValue("#markers", "pinned") ?? 0)),
    rescale: (parseOptionalNumber(presentationValue("#markers", "rescale")) ?? 1) !== 0,
    scale: viewContext.scale || 1
  };
}

export function getMilitaryBoxSize(_viewContext?: Readonly<ViewContext>): number {
  return parseOptionalNumber(presentationValue("#armies", "box-size")) ?? 6;
}

/**
 * Per-layer opacity from PresentationData so WebGL polygon layers match the SVG
 * projection when opacity has been customized. Hardcoded defaults match
 * public/styles/clean.json when a selector has no stored value.
 *
 * Note: temperature, danger, and population layers do not have a single parent
 * opacity attribute — their opacity is baked into per-cell colour intensity.
 */
export function getCellLayerOpacities(_viewContext?: Readonly<ViewContext>): {
  landmass: number;
  biomes: number;
  coastalHabitats: number;
  religions: number;
  cultures: number;
  states: number;
  provinces: number;
  zones: number;
  temperature: number;
  danger: number;
  population: number;
} {
  const readOp = (selector: string, fallback: number): number =>
    parseOptionalNumber(presentationValue(selector, "opacity")) ?? fallback;

  return {
    landmass: readOp("#landmass", 1),
    biomes: readOp("#biomes", 0.5),
    coastalHabitats: readOp("#coastalHabitats", 0.65),
    religions: readOp("#relig", 0.7),
    cultures: readOp("#cults", 0.6),
    states: readOp("#statesBody", 0.3),
    provinces: readOp("#provs", 0.7),
    zones: readOp("#zones", 0.7),
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

function readLabelStyle(selector: string, fallback: DeckLabelStyle): DeckLabelStyle {
  const fill = styleString(selector, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(styleString(selector, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(styleString(selector, "data-size")) ??
    parseOptionalNumber(styleString(selector, "font-size")) ??
    fallback.size;
  const dx = parseOptionalNumber(styleString(selector, "data-dx")) ?? fallback.dx;
  const dy = parseOptionalNumber(styleString(selector, "data-dy")) ?? fallback.dy;
  const fontFamily = styleString(selector, "font-family") ?? fallback.fontFamily;
  const haloColor = getHaloColor(selector) ?? fallback.haloColor;
  return { fill, opacity, size, dx, dy, fontFamily, haloColor };
}

// Label groups set their halo via a CSS text-shadow (e.g. "text-shadow: white 0px 0px 4px" as the
// group's `style` attribute) rather than an SVG stroke, so there's no single presentation
// attribute to read directly — the color is the first token of the text-shadow value across every
// built-in style preset (public/styles/*.json), even though offsets/blur vary.
function getHaloColor(selector: string): string | null {
  const styleAttr = styleString(selector, "style");
  const shadowMatch = styleAttr?.match(/text-shadow\s*:\s*([^;]+)/);
  if (!shadowMatch) return null;
  const colorMatch = shadowMatch[1].trim().match(/^([a-zA-Z]+|#[0-9a-fA-F]{3,8})/);
  return colorMatch ? colorMatch[1] : null;
}

function readBurgIconGroupStyle(selector: string, fallback: DeckBurgIconStyle): DeckBurgIconStyle {
  if (!getPresentationStyleRecord(presentationData, selector)) return fallback;
  const fill = styleString(selector, "fill") ?? fallback.fill;
  const opacity = parseOptionalNumber(styleString(selector, "opacity")) ?? fallback.opacity;
  const size =
    parseOptionalNumber(styleString(selector, "data-size")) ??
    parseOptionalNumber(styleString(selector, "font-size")) ??
    fallback.size;
  // `icon` is resolved by the caller (getBurgIconStyle) and spread over this result.
  return { fill, opacity, size, icon: fallback.icon };
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
  id: string,
  fillFallback: string,
  strokeFallback: string,
  strokeWidthFallback: number,
  opacityFallback: number
): LayerPaint {
  const selector = `#${id}`;
  const opacity = parseOptionalNumber(presentationValue(selector, "opacity")) ?? opacityFallback;
  return {
    fill: colorToRgba(presentationValue(selector, "fill"), fillFallback, opacity),
    stroke: colorToRgba(presentationValue(selector, "stroke"), strokeFallback, opacity),
    strokeWidth: parseOptionalNumber(presentationValue(selector, "stroke-width")) ?? strokeWidthFallback
  };
}
