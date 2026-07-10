import type { Color } from "@deck.gl/core";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import {
  colorToRgba,
  type DeckBurgIconStyle,
  type DeckEmblemType,
  type DeckHeightStyle,
  type DeckLabelStyle,
  type DeckMarkerStyle
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
    burgIcons[group.name] = readBurgIconGroupStyle(
      viewContext.burgIcons?.select<SVGGElement>(`#${group.name}`),
      getStyleRecord(worldContext.style.burgIcons, group.name),
      { fill: "#3e3e4b", opacity: 1, size: getDefaultBurgIconSize(group.name) }
    );
    anchors[group.name] = readBurgIconGroupStyle(
      viewContext.anchors?.select<SVGGElement>(`#${group.name}`),
      getStyleRecord(worldContext.style.anchors, group.name),
      { fill: "#ffffff", opacity: 1, size: getDefaultAnchorSize(group.name) }
    );
  }

  burgIcons.town ??= { fill: "#3e3e4b", opacity: 1, size: 4 };
  anchors.town ??= { fill: "#ffffff", opacity: 1, size: 1 };
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
  const stateGroup = viewContext.labels?.select<SVGGElement>("#states");
  const state = readLabelStyle(stateGroup, null, { fill: "#3e3e4b", opacity: 1, size: 22, dx: 0, dy: 0 });
  const burgLabels: Record<string, DeckLabelStyle> = {};
  const visibleBurgGroups = new Set<string>();

  for (const group of worldContext.options.burgs?.groups ?? []) {
    visibleBurgGroups.add(group.name);
    burgLabels[group.name] = readLabelStyle(
      viewContext.burgLabels?.select<SVGGElement>(`#${group.name}`),
      getStyleRecord(worldContext.style.burgLabels, group.name),
      {
        fill: "#3e3e4b",
        opacity: 1,
        size: getDefaultBurgLabelSize(group.name),
        dx: 0,
        dy: group.name === "capital" ? -0.5 : -0.4
      }
    );
  }

  burgLabels.town ??= { fill: "#3e3e4b", opacity: 1, size: 4, dx: 0, dy: -0.4 };
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
  return { fill, opacity, size, dx, dy };
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
  return { fill, opacity, size };
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
  return typeof storedValue === "string" && storedValue ? storedValue : null;
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
