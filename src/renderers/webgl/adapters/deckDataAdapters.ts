import type { Color } from "@deck.gl/core";
import {
  forceCollide,
  forceSimulation,
  interpolateMagma,
  interpolateSpectral,
  interpolateYlOrRd,
  color as parseColor
} from "d3";
import _simplify from "simplify-js";
import type { AppServices } from "../../../context/appServices";
import type { FocusScope, ViewContext } from "../../../context/viewContext";
import type { WorldContext } from "../../../context/worldContext";
import { HeightThreshold } from "../../../data/constants";
import { Rivers } from "../../../generators/river-generator";
import type {
  Burg,
  BurgGroup,
  IceElement,
  Marker,
  MilitaryRegiment,
  PackedGraphFeature,
  Province,
  Route,
  State
} from "../../../types/models";
import type { PackedGraphCells, PackedGraphVertices } from "../../../types/PackedGraph";
import type { WebglPickKind } from "../../../types/webglPicking";
import { clipPoly } from "../../../utils";
import { getColor, getColorScheme } from "../../../utils/colorUtils";
import { type RelationKey, relations } from "../../../utils/diplomacyRelations";
import { fractalizeCoastline, sampleCatmullRomPolyline, sampleCoastlineShape } from "../../coastline-fractal";
import { isCellInScope, isGridCellInScope } from "../../core/focusScope";
import { getCachedBurgIconRaster } from "../burgIconRasterCache";
import { getCachedEmblemIconUrl } from "../emblemIconCache";
import { hasExternalIconFailed } from "../externalIconFailureCache";

export type DeckPosition = [number, number];
export type DeckPathDashArray = readonly [number, number];

export interface DeckCellPolygon {
  id: string;
  kind: WebglPickKind;
  cellId: number;
  polygon: DeckPosition[];
  fillColor: Color;
}

export interface DeckHeightStyle {
  scheme: string | null;
  opacity: number;
  includeOcean: boolean;
}

export interface DeckPath {
  id: string;
  path: DeckPosition[];
  color: Color;
  width: number;
  kind: WebglPickKind;
  cellId: number | null;
  group?: string;
  /** Dash and gap lengths normalized for deck.gl's PathStyleExtension, if this path is dashed. */
  dashArray?: DeckPathDashArray;
}

export interface DeckRiverPolygon {
  id: string;
  kind: "river";
  cellId: number | null;
  polygon: DeckPosition[];
  fillColor: Color;
}

export interface DeckFeaturePolygon extends DeckCellPolygon {
  featureId: number;
  group: string;
}

/** One land feature with zero or more lake holes for deck.gl's nested polygon representation. */
export interface DeckLandMaskPolygon {
  id: string;
  polygon: DeckPosition[][];
  fillColor: Color;
}

export interface DeckIcePolygon {
  id: string;
  kind: "ice";
  cellId: number | null;
  polygon: DeckPosition[];
  fillColor: Color;
  lineColor: Color;
  lineWidth: number;
  iceType: IceElement["type"];
}

export type DeckEmblemType = "burg" | "province" | "state";
export type DeckBurgIconType = "burg" | "anchor";

export interface DeckBurgIconStyle {
  fill: string;
  opacity: number;
  size: number;
  /** SVG `data-icon` href, e.g. "#icon-circle" or "#icon-watabou-capital". */
  icon: string;
}

export interface DeckBurgIconSymbol {
  id: string;
  kind: "burgIcon";
  type: DeckBurgIconType;
  burgId: number;
  cellId: number;
  group: string;
  position: [number, number];
  size: number;
  color: Color;
  /** Rasterized data-icon symbol as a data URI, or null while it's still being generated. */
  iconUrl: string | null;
  /** True to tint iconUrl via `color` (monochrome glyph); false to show its own baked-in colors. */
  mask: boolean;
}

/** Geometry-neutral burg icon data for real 3D renderers. */
export type LowPolyBurgShape = "sphere" | "cube" | "anchor";

export interface LowPolyBurgSymbol {
  id: string;
  burgId: number;
  cellId: number;
  /** Source burg population, retained for population-driven 3D presentation effects. */
  population: number | undefined;
  group: string;
  type: DeckBurgIconType;
  shape: LowPolyBurgShape;
  position: [number, number];
  /** Map-space radius/half-size used when composing an instance transform. */
  size: number;
  color: string;
  opacity: number;
}

export interface DeckMarkerStyle {
  pinnedOnly: boolean;
  rescale: boolean;
  scale: number;
}

export interface DeckMarkerSymbol {
  id: string;
  kind: "marker";
  markerId: number;
  cellId: number;
  position: [number, number];
  textPosition: [number, number];
  imagePosition: [number, number];
  size: number;
  icon: string;
  iconSize: number;
  fillColor: string;
  strokeColor: string;
  pin: string;
  isExternalIcon: boolean;
}

export type DeckMilitaryBoxPart = "main" | "unit" | "action";

export interface DeckMilitaryRegimentSymbol {
  id: string;
  kind: "military";
  regimentId: number;
  stateId: number;
  cellId: number;
  position: [number, number];
  totalPosition: [number, number];
  unitIconPosition: [number, number];
  unitImagePosition: [number, number];
  actionIconPosition: [number, number];
  width: number;
  height: number;
  size: number;
  angle: number;
  total: string;
  unitIcon: string;
  actionIcon: string;
  isExternalIcon: boolean;
}

export interface DeckMilitaryBoxPolygon {
  id: string;
  kind: "military";
  regimentId: number;
  stateId: number;
  cellId: number;
  part: DeckMilitaryBoxPart;
  polygon: DeckPosition[];
  fillColor: Color;
}

export type DeckLabelType = "state" | "burg";

export interface DeckLabelStyle {
  fill: string;
  opacity: number;
  size: number;
  dx: number;
  dy: number;
  /** CSS font-family, e.g. "Almendra SC". Only `state`'s value is used as the (layer-wide) TextLayer fontFamily. */
  fontFamily: string;
  /** Halo/text-shadow color, e.g. "white". Only `state`'s value is used as the (layer-wide) TextLayer outlineColor. */
  haloColor: string;
}

export interface DeckLabelSymbol {
  id: string;
  kind: "label";
  type: DeckLabelType;
  itemId: number;
  cellId: number | null;
  group: string;
  text: string;
  position: [number, number];
  size: number;
  color: Color;
  /** Rotation in degrees. Always 0 for burg labels; approximated from state geometry for state labels
   * (deck.gl's TextLayer cannot follow a curved path like draw-state-labels.ts's SVG textPath). */
  angle: number;
}

export interface DeckEmblemIcon {
  id: string;
  kind: "emblem";
  type: DeckEmblemType;
  cellId: number | null;
  x: number;
  y: number;
  position: [number, number];
  size: number;
  color: Color;
  /** Rendered coa artwork as a data URI, or null while it's still being generated (see emblemIconCache.ts). */
  iconUrl: string | null;
}

export type DeckDivisionBoundaryKind = "state" | "province" | "culture" | "religion";

export interface DeckLandCellGeometry {
  cellId: number;
  polygon: DeckPosition[];
}

export function colorToRgba(value: string | undefined, fallback: string, opacity = 1): Color {
  const parsed = parseColor(value || fallback) ?? parseColor(fallback);
  if (!parsed) return [153, 153, 153, Math.round(255 * opacity)];
  const rgba = parsed.rgb();
  return [rgba.r, rgba.g, rgba.b, Math.round(255 * rgba.opacity * opacity)];
}

export function buildBackgroundPolygons(worldContext: Readonly<WorldContext>): DeckCellPolygon[] {
  const { graphWidth, graphHeight } = worldContext;
  return [
    {
      id: "background-ocean",
      kind: "background",
      cellId: -1,
      polygon: [
        [0, 0],
        [graphWidth, 0],
        [graphWidth, graphHeight],
        [0, graphHeight]
      ],
      fillColor: colorToRgba("#466eab", "#466eab")
    }
  ];
}

/**
 * Land-cell vertex-to-polygon geometry, shared by every land-based cell overlay (land fill, biomes,
 * cultures, religions, states, provinces, zones, precipitation, danger, population) so simultaneously
 * active overlays don't each repeat the same per-cell vertex lookup — only `fillColor` differs between them.
 */
export function buildLandCellGeometry(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckLandCellGeometry[] {
  const { cells, vertices } = worldContext.pack;
  if (!cells?.i || !vertices) return [];
  const geometry: DeckLandCellGeometry[] = [];

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (cells.h[cellId] < 20 || !isCellInScope(focusScope, cellId)) continue;
    const polygon = getCellPolygon(cells, vertices, cellId);
    if (!polygon) continue;
    geometry.push({ cellId, polygon });

    const fringes = getCoastalFringePolygons(cells, vertices, cellId);
    for (const fringe of fringes) {
      geometry.push({ cellId, polygon: fringe });
    }
  }

  return geometry;
}

/**
 * Build per-cell polygons for ocean cells, shaded by depth.
 *
 * `pack.cells.h` values range roughly 0–19 for ocean (0 = deep, 19 = shallow transition).
 * We blend the base ocean colour toward a lighter "shallow" tint proportionally so that
 * deep water appears as the base colour and shallow areas are brighter.
 *
 * @param oceanBaseColor  Base ocean fill colour string (e.g. "#466eab") read from the SVG style.
 */
export function buildOceanDepthPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  oceanBaseColor = "#466eab"
): DeckCellPolygon[] {
  const { cells, vertices } = worldContext.pack;
  const polygons: DeckCellPolygon[] = [];

  // Parse the base ocean colour once.
  const base = parseColor(oceanBaseColor)?.rgb() ?? parseColor("#466eab")!.rgb();
  // Shallow highlight colour: lighter / more saturated — mix toward near-white (#ecf2f9).
  const shallowR = 236,
    shallowG = 242,
    shallowB = 249; // #ecf2f9

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    const h = cells.h[cellId];
    // Only ocean cells (h < 20). Skip cells outside focus scope.
    if (h >= 20 || !isCellInScope(focusScope, cellId)) continue;

    const polygon = getCellPolygon(cells, vertices, cellId);
    if (!polygon) continue;

    // t is in [0, 1]: 0 = deepest (h ≈ 0), 1 = shallowest (h ≈ 19).
    const t = Math.min(1, Math.max(0, h / 19));

    // Interpolate base → shallow and layer a translucent shallow tint on top.
    // Using a small base alpha so deep cells are almost opaque ocean colour,
    // and shallow cells receive more of the #ecf2f9 tint.
    const alpha = Math.round(t * 180); // 0 (fully transparent) at depth, 180/255 at shore
    const r = Math.round(base.r + (shallowR - base.r) * t);
    const g = Math.round(base.g + (shallowG - base.g) * t);
    const b = Math.round(base.b + (shallowB - base.b) * t);

    polygons.push({
      id: `ocean-depth-cell-${cellId}`,
      kind: "background",
      cellId: -1,
      polygon,
      fillColor: [r, g, b, alpha]
    });
  }

  return polygons;
}

export function buildLandPolygonsBase(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  fill = "#eef6fb",
  landCells?: ReadonlyArray<DeckLandCellGeometry>
): DeckCellPolygon[] {
  return buildLandPolygons(worldContext, focusScope, "land", () => colorToRgba(fill, "#eef6fb"), landCells);
}

export function buildHeightPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  style: DeckHeightStyle = { scheme: "bright", opacity: 1, includeOcean: false },
  landCells?: ReadonlyArray<DeckLandCellGeometry>
): DeckCellPolygon[] {
  const { cells, vertices } = worldContext.grid;
  if (!cells?.i || !cells.v || !vertices?.p) return [];

  const scheme = getColorScheme(style.scheme);
  const polygons: DeckCellPolygon[] = [];

  // When rendering land heights without ocean, prepend base land polygons colored with the
  // height 20 color to cover the landmass down to the detailed coastline and lake shores.
  if (!style.includeOcean && landCells) {
    const baseColor = colorToRgba(getColor(20, scheme), "#999999", style.opacity);
    for (const { cellId, polygon } of landCells) {
      polygons.push({
        id: `height-base-cell-${cellId}`,
        kind: "height",
        cellId,
        polygon,
        fillColor: baseColor
      });
    }
  }

  for (const gridCellId of cells.i) {
    if (!isGridCellInScope(focusScope, gridCellId)) continue;
    const height = cells.h[gridCellId];
    if (!style.includeOcean && height < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const polygon = getGridCellPolygon(cells, vertices, gridCellId);
    if (!polygon) continue;
    polygons.push({
      id: `height-grid-cell-${gridCellId}`,
      kind: "height",
      cellId: -1,
      polygon,
      fillColor: colorToRgba(getColor(height, scheme), "#999999", style.opacity)
    });
  }

  return polygons;
}

export function buildBiomesPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.5
): DeckCellPolygon[] {
  const { pack, biomesData } = worldContext;
  return buildLandPolygons(
    worldContext,
    focusScope,
    "biome",
    cellId => colorToRgba(biomesData.color[pack.cells.biome[cellId]], "#999999", opacity),
    landCells
  );
}

export function buildCulturePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.6
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(
    worldContext,
    focusScope,
    "culture",
    cellId => colorToRgba(pack.cultures[pack.cells.culture[cellId]]?.color, "#999999", opacity),
    landCells
  );
}

export function buildReligionPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.7
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(
    worldContext,
    focusScope,
    "religion",
    cellId => colorToRgba(pack.religions[pack.cells.religion[cellId]]?.color, "#999999", opacity),
    landCells
  );
}

export function buildStatePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.3,
  diplomacySelectedStateId: number | null = null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(
    worldContext,
    focusScope,
    "state",
    cellId => {
      const state = pack.states[pack.cells.state[cellId]];
      const relationValue =
        diplomacySelectedStateId === null ? undefined : state?.diplomacy?.[diplomacySelectedStateId];
      const relation = typeof relationValue === "string" ? (relationValue as RelationKey) : undefined;
      // Keep the SVG editor's fallback colour for the selected state and malformed relation data.
      const relationColor = relation ? relations[relation]?.color : undefined;
      const fill = diplomacySelectedStateId === null ? state?.color : relationColor || "#4682b4";
      return colorToRgba(fill, "#999999", opacity);
    },
    landCells
  );
}

export function buildProvincePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.7
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(
    worldContext,
    focusScope,
    "province",
    cellId => colorToRgba(pack.provinces[pack.cells.province[cellId]]?.color, "#999999", opacity),
    landCells
  );
}

export function buildZonePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.7
): DeckCellPolygon[] {
  const { pack } = worldContext;
  const zoneByCell = new Map<number, string>();
  for (const zone of pack.zones ?? []) {
    if (!zone || zone.hidden) continue;
    for (const cellId of zone.cells ?? []) zoneByCell.set(cellId, zone.color);
  }

  return buildLandPolygons(
    worldContext,
    focusScope,
    "zone",
    cellId => {
      const color = zoneByCell.get(cellId);
      return color ? colorToRgba(color, "#999999", opacity) : [0, 0, 0, 0];
    },
    landCells
  ).filter(polygon => (polygon.fillColor[3] ?? 255) > 0);
}

export function buildTemperaturePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  opacity = 0.72
): DeckCellPolygon[] {
  const { grid } = worldContext;
  const tMax = 50;
  const tMin = -50;
  const delta = tMax - tMin;

  return buildGridCellPolygons(worldContext, focusScope, "temperature", cellId => {
    const temp = grid.cells.temp?.[cellId] ?? 0;
    const tNormalized = 1 - (temp - tMin) / delta;
    const hexColor = interpolateSpectral(Math.max(0, Math.min(1, tNormalized)));
    return colorToRgba(hexColor, "#999999", opacity);
  });
}

export function buildPrecipitationPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  maxOpacity = 0.75
): DeckCellPolygon[] {
  const { grid, pack } = worldContext;
  return buildLandPolygons(
    worldContext,
    focusScope,
    "precipitation",
    cellId => {
      const precipitation = grid.cells.prec?.[pack.cells.g[cellId]] ?? 0;
      const alpha = Math.min(maxOpacity, Math.max(maxOpacity * 0.24, precipitation / 220));
      return colorToRgba("#2d7dd2", "#2d7dd2", alpha);
    },
    landCells
  );
}

export function buildDangerPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  maxOpacity = 0.75
): DeckCellPolygon[] {
  const { pack } = worldContext;
  const { cells } = pack;
  if (!cells?.i || !cells.danger) return [];

  let maxDanger = 0;
  for (const i of cells.i) {
    if (!isCellInScope(focusScope, i)) continue;
    const d = cells.danger[i] as number;
    if (d > maxDanger) maxDanger = d;
  }

  if (maxDanger === 0) return [];

  const getDangerBucket = (cellId: number): number => {
    const d = cells.danger[cellId] as number;
    if (d <= 0) return -1;

    const ratio = d / maxDanger;
    return Math.min(9, Math.floor(ratio * 10));
  };

  return buildCellPolygons(
    worldContext,
    focusScope,
    "danger",
    cellId => {
      const bucket = getDangerBucket(cellId);
      if (bucket < 0) return [0, 0, 0, 0];
      const hexColor = interpolateMagma((bucket + 1) / 10);
      return colorToRgba(hexColor, "#999999", maxOpacity);
    },
    cellId => (cells.danger[cellId] ?? 0) > 0
  ).filter(polygon => (polygon.fillColor[3] ?? 255) > 0);
}

export function buildPopulationPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  maxOpacity = 0.72
): DeckCellPolygon[] {
  const { pack, populationRate, urbanization } = worldContext;
  const { cells, burgs } = pack;
  if (!cells?.i) return [];

  const totalPop = new Float32Array(cells.i.length);
  const densities = new Float32Array(cells.i.length);
  let maxDensity = 0;

  for (const i of cells.i) {
    if (!isCellInScope(focusScope, i)) continue;
    const pop = cells.pop[i] as number;
    totalPop[i] = pop * populationRate;
  }

  for (const b of burgs) {
    if (b.i && !b.removed && isCellInScope(focusScope, b.cell)) {
      const uPop = (b.population ?? 0) * populationRate * urbanization;
      totalPop[b.cell] += uPop;
    }
  }

  for (const i of cells.i) {
    if (!isCellInScope(focusScope, i)) continue;
    const area = cells.area[i];
    if (area > 0) {
      const density = totalPop[i] / area;
      densities[i] = density;
      if (density > maxDensity) maxDensity = density;
    }
  }

  const getPopBucket = (cellId: number): number => {
    const density = densities[cellId];
    if (density < 1) return -1;
    if (maxDensity <= 1) return 0;

    const ratio = Math.log(density) / Math.log(maxDensity);
    return Math.min(9, Math.floor(ratio * 10));
  };

  return buildLandPolygons(
    worldContext,
    focusScope,
    "population",
    cellId => {
      const bucket = getPopBucket(cellId);
      if (bucket < 0) return [0, 0, 0, 0];
      const hexColor = interpolateYlOrRd((bucket + 1) / 10);
      return colorToRgba(hexColor, "#999999", maxOpacity);
    },
    landCells
  ).filter(polygon => (polygon.fillColor[3] ?? 255) > 0);
}

export function buildCellOutlinePaths(worldContext: Readonly<WorldContext>, focusScope: FocusScope | null): DeckPath[] {
  const { cells, vertices } = worldContext.pack;
  const paths: DeckPath[] = [];

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isCellInScope(focusScope, cellId)) continue;
    const polygon = getCellPolygon(cells, vertices, cellId);
    if (!polygon) continue;
    paths.push({
      id: `cell-${cellId}`,
      path: [...polygon, polygon[0]],
      color: colorToRgba("#333333", "#333333", 0.45),
      width: 0.25,
      kind: "cell",
      cellId
    });
  }

  return paths;
}

export function buildGridPaths(worldContext: Readonly<WorldContext>, focusScope: FocusScope | null): DeckPath[] {
  const { cells, vertices } = worldContext.pack;
  const paths: DeckPath[] = [];
  const seen = new Set<string>();

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isCellInScope(focusScope, cellId)) continue;
    for (const neighborId of cells.c[cellId] ?? []) {
      if (neighborId < cellId || !isCellInScope(focusScope, neighborId)) continue;
      const edge = getSharedEdge(cells, vertices, cellId, neighborId);
      if (!edge) continue;
      const key = `${edge[0][0]},${edge[0][1]}-${edge[1][0]},${edge[1][1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push({
        id: `grid-${cellId}-${neighborId}`,
        path: edge,
        color: colorToRgba("#555555", "#555555", 0.45),
        width: 0.2,
        kind: "grid",
        cellId
      });
    }
  }

  return paths;
}

export function buildBorderPaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  dashArrays?: { state: DeckPathDashArray; province: DeckPathDashArray },
  colors?: { state: Color; province: Color }
): DeckPath[] {
  const { cells, vertices } = worldContext.pack;
  const paths: DeckPath[] = [];
  const seen = new Set<string>();

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isCellInScope(focusScope, cellId) || cells.h[cellId] < 20) continue;
    for (const neighborId of cells.c[cellId] ?? []) {
      if (neighborId < cellId || cells.h[neighborId] < 20 || !isCellInScope(focusScope, neighborId)) continue;
      const isStateBorder = cells.state[cellId] !== cells.state[neighborId];
      const isProvinceBorder =
        !isStateBorder && cells.province[cellId] && cells.province[cellId] !== cells.province[neighborId];
      if (!isStateBorder && !isProvinceBorder) continue;

      const edge = getSharedEdge(cells, vertices, cellId, neighborId);
      if (!edge) continue;
      const key = `${cellId}-${neighborId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const width = isStateBorder ? 1.1 : 0.45;
      const dashArray = isStateBorder ? dashArrays?.state : dashArrays?.province;
      paths.push({
        id: `border-${key}`,
        path: edge,
        color: applyDashOpacity(
          isStateBorder ? (colors?.state ?? getBorderColor()) : (colors?.province ?? getBorderColor()),
          dashArray,
          width
        ),
        width,
        kind: "border",
        cellId,
        dashArray: getNormalizedDashArray(dashArray, width)
      });
    }
  }

  return paths;
}

export function buildDivisionBoundaryPaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  division: DeckDivisionBoundaryKind,
  dashArray?: DeckPathDashArray,
  color?: Color
): DeckPath[] {
  const { cells, vertices } = worldContext.pack;
  const paths: DeckPath[] = [];
  const seen = new Set<string>();

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isCellInScope(focusScope, cellId) || cells.h[cellId] < 20) continue;
    const value = cells[division][cellId];
    if (!value) continue;

    for (const neighborId of cells.c[cellId] ?? []) {
      if (neighborId < cellId || cells.h[neighborId] < 20 || !isCellInScope(focusScope, neighborId)) continue;
      const neighborValue = cells[division][neighborId];
      if (!neighborValue || value === neighborValue) continue;

      const edge = getSharedEdge(cells, vertices, cellId, neighborId);
      if (!edge) continue;

      const key = `${division}-${cellId}-${neighborId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const width = getDivisionBoundaryWidth(division);
      paths.push({
        id: `${division}-boundary-${cellId}-${neighborId}`,
        path: edge,
        color: applyDashOpacity(color ?? getDivisionBoundaryColor(division), dashArray, width),
        width,
        kind: "border",
        cellId,
        dashArray: getNormalizedDashArray(dashArray, width)
      });
    }
  }

  return paths;
}

export function buildRiverPaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  color: Color = colorToRgba("#3f75a2", "#3f75a2")
): DeckPath[] {
  return (worldContext.pack.rivers ?? [])
    .filter(
      river => river.cells?.length >= 2 && (!focusScope || river.cells.some(cell => isCellInScope(focusScope, cell)))
    )
    .map(river => {
      const resolvedPoints = river.points && river.points.length === river.cells.length ? river.points : null;
      let path = Rivers.addMeandering(river.cells, resolvedPoints).map(([x, y]) => [x, y] as DeckPosition);
      if (path.length >= 3) {
        path = sampleCatmullRomPolyline(path, 0.1, false, 0.5);
      }
      return {
        id: `river-${river.i}`,
        path,
        color,
        width: Math.max(0.6, river.sourceWidth + river.widthFactor),
        kind: "river" as const,
        cellId: river.cells[0] ?? null
      };
    });
}

/**
 * Convert each river into tapered bank-to-bank quads. Unlike PathLayer's one width per path,
 * these polygons preserve SVG's source-to-mouth width progression and flow-derived colour depth.
 */
export function buildRiverPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  baseColor: Color = colorToRgba("#3f75a2", "#3f75a2")
): DeckRiverPolygon[] {
  return (worldContext.pack.rivers ?? []).flatMap(river => {
    if (river.cells.length < 2 || (focusScope && !river.cells.some(cell => isCellInScope(focusScope, cell)))) return [];

    const resolvedPoints = river.points && river.points.length === river.cells.length ? river.points : null;
    let points = Rivers.addMeandering(river.cells, resolvedPoints);
    if (points.length >= 3) {
      const sampled = sampleCatmullRomPolyline(points as unknown as [number, number][], 0.1, false, 0.5);
      points = interpolateRiverWidths(points, sampled);
    }
    if (points.length < 2) return [];

    const banks = Rivers.getRiverBanks(points, river.widthFactor, river.sourceWidth);
    const maxWidth = Math.max(...banks.widths, 0.0001);
    const maxFlux = Math.max(...banks.fluxes, 0.0001);
    const polygons: DeckRiverPolygon[] = [];

    for (let index = 0; index < points.length - 1; index++) {
      const left = banks.left[index];
      const nextLeft = banks.left[index + 1];
      const right = banks.right[index];
      const nextRight = banks.right[index + 1];
      if (!left || !nextLeft || !right || !nextRight) continue;

      polygons.push({
        // Keep the river id as the trailing segment so existing tooltip/editor pick parsing still works.
        id: `river-segment-${index}-${river.i}`,
        kind: "river",
        cellId: river.cells[0] ?? null,
        polygon: [left, nextLeft, nextRight, right],
        fillColor: getRiverSegmentColor(
          baseColor,
          Math.max(banks.widths[index], banks.widths[index + 1]) / maxWidth,
          Math.max(banks.fluxes[index], banks.fluxes[index + 1]) / maxFlux
        )
      });
    }

    return polygons;
  });
}

function interpolateRiverWidths(
  original: [number, number, number][],
  sampled: [number, number][]
): [number, number, number][] {
  if (original.length === 0 || sampled.length === 0) return [];

  const out: [number, number, number][] = [];
  const origDists = [0];
  let totalOrigDist = 0;
  for (let i = 1; i < original.length; i++) {
    const dx = original[i][0] - original[i - 1][0];
    const dy = original[i][1] - original[i - 1][1];
    totalOrigDist += Math.sqrt(dx * dx + dy * dy);
    origDists.push(totalOrigDist);
  }

  if (totalOrigDist === 0) {
    return sampled.map(p => [p[0], p[1], original[0][2]]);
  }

  let totalSampleDist = 0;
  for (let i = 1; i < sampled.length; i++) {
    const dx = sampled[i][0] - sampled[i - 1][0];
    const dy = sampled[i][1] - sampled[i - 1][1];
    totalSampleDist += Math.sqrt(dx * dx + dy * dy);
  }

  const ratio = totalOrigDist / (totalSampleDist || 1);
  let dist = 0;
  let origIdx = 0;

  out.push([sampled[0][0], sampled[0][1], original[0][2]]);

  for (let i = 1; i < sampled.length; i++) {
    const dx = sampled[i][0] - sampled[i - 1][0];
    const dy = sampled[i][1] - sampled[i - 1][1];
    dist += Math.sqrt(dx * dx + dy * dy) * ratio;

    while (origIdx < original.length - 2 && origDists[origIdx + 1] <= dist) {
      origIdx++;
    }

    const d0 = origDists[origIdx];
    const d1 = origDists[origIdx + 1];
    let t = (dist - d0) / (d1 - d0 || 1);
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const z0 = original[origIdx][2];
    const z1 = original[origIdx + 1][2];
    out.push([sampled[i][0], sampled[i][1], z0 + (z1 - z0) * t]);
  }

  return out;
}

function getRiverSegmentColor(baseColor: Color, widthRatio: number, fluxRatio: number): Color {
  const intensity = Math.min(1, Math.max(0, Math.sqrt(widthRatio * fluxRatio)));
  const shade = 1 - intensity * 0.12;
  const alpha = (baseColor[3] ?? 255) * (0.68 + intensity * 0.32);
  return [
    Math.round(baseColor[0] * shade),
    Math.round(baseColor[1] * shade),
    Math.round(baseColor[2] * shade),
    Math.round(alpha)
  ];
}

export function buildRoutePaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  dashArrays?: Partial<Record<"roads" | "trails" | "searoutes", DeckPathDashArray>>,
  colors?: Partial<Record<"roads" | "trails" | "searoutes", Color>>
): DeckPath[] {
  return (worldContext.pack.routes ?? []).flatMap(route => {
    if (focusScope && !(route.cells ?? []).some(cell => isCellInScope(focusScope, cell))) return [];

    // Imported maps can contain incomplete route point arrays. deck.gl cannot render NaN / missing
    // coordinates reliably, so omit the entire route instead of connecting unrelated valid endpoints.
    let path = getValidDeckPath(route.points);
    if (!path) return [];

    if (path.length >= 3) {
      // FMG uses alpha 0.5 for searoutes, 0.1 for land routes
      const alpha = route.group === "searoutes" ? 0.5 : 0.1;
      path = sampleCatmullRomPolyline(path, alpha, false, 0.5);
    }

    const width = route.group === "searoutes" ? 0.7 : route.group === "roads" ? 1.1 : 0.65;
    const dashArray =
      route.group === "roads" || route.group === "trails" || route.group === "searoutes"
        ? dashArrays?.[route.group]
        : undefined;
    const color =
      route.group === "roads" || route.group === "trails" || route.group === "searoutes"
        ? (colors?.[route.group] ?? getRouteColor(route))
        : getRouteColor(route);

    return [
      {
        id: `route-${route.i}`,
        path,
        color: applyDashOpacity(color, dashArray, width),
        width,
        kind: "route" as const,
        cellId: route.cells?.[0] ?? null,
        dashArray: getNormalizedDashArray(dashArray, width)
      }
    ];
  });
}

/**
 * PathStyleExtension interprets dash sizes in multiples of the path width. SVG stores absolute
 * stroke-dasharray lengths, so normalize here to retain the configured visual rhythm.
 */
function getNormalizedDashArray(
  dashArray: DeckPathDashArray | undefined,
  width: number
): DeckPathDashArray | undefined {
  if (!dashArray || width <= 0) return undefined;
  return [dashArray[0] / width, dashArray[1] / width];
}

/**
 * SVG's blank dash segments reduce a line's perceived colour density. deck.gl may reset the dash
 * phase at short path segments, so apply the same dash-to-gap coverage to its alpha explicitly.
 */
function applyDashOpacity(color: Color, dashArray: DeckPathDashArray | undefined, width: number): Color {
  if (!dashArray) return color;
  const [dash, gap] = dashArray;
  if (dash <= 0 && gap <= 0) return color;

  // SVG's `0 gap` pattern with round caps renders dots one stroke-width long.
  const visibleLength = dash > 0 ? dash : width;
  const coverage = visibleLength / (visibleLength + gap);
  return [color[0], color[1], color[2], Math.round((color[3] ?? 255) * coverage)];
}

export function buildLakePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  appServices: AppServices,
  getFillColor: (group: string) => Color
): DeckFeaturePolygon[] {
  return getRenderableFeatures(worldContext, focusScope, "lake", appServices).map(feature => ({
    id: `lake-${feature.feature.i}`,
    kind: "lake",
    cellId: feature.feature.firstCell,
    featureId: feature.feature.i,
    group: feature.feature.group || "freshwater",
    polygon: feature.points,
    fillColor: getFillColor(feature.feature.group || "freshwater")
  }));
}

export function buildLakeOutlinePaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  appServices: AppServices,
  getStrokeColor: (group: string) => Color,
  getStrokeWidth: (group: string) => number
): DeckPath[] {
  return getRenderableFeatures(worldContext, focusScope, "lake", appServices).map(feature => {
    const group = feature.feature.group || "freshwater";
    return {
      id: `lake-outline-${feature.feature.i}`,
      path: closePath(feature.points),
      color: getStrokeColor(group),
      width: getStrokeWidth(group),
      kind: "lake",
      cellId: feature.feature.firstCell,
      group
    };
  });
}

export function buildIcePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  fillColor: Color,
  lineColor: Color,
  lineWidth: number
): DeckIcePolygon[] {
  return (worldContext.pack.ice ?? [])
    .filter(iceElement => iceElement.type === "glacier" || isGridCellInScope(focusScope, iceElement.cellId))
    .map(iceElement => ({
      id: `${iceElement.type}-${iceElement.i}`,
      kind: "ice" as const,
      cellId: iceElement.type === "iceberg" ? iceElement.cellId : null,
      polygon: applyOffset(iceElement.points, iceElement.offset),
      fillColor,
      lineColor,
      lineWidth,
      iceType: iceElement.type
    }))
    .filter(iceElement => iceElement.polygon.length >= 3);
}

export function buildEmblemIcons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  sizes: Record<DeckEmblemType, number>,
  opacity: number,
  appServices: Readonly<AppServices>
): DeckEmblemIcon[] {
  const { pack, graphHeight, graphWidth } = worldContext;
  const states = pack.states.filter(
    state =>
      state.i && !state.removed && state.coa && state.coa.size !== 0 && (!focusScope || state.i === focusScope.stateId)
  );
  const provinces = (pack.provinces as Province[]).filter(
    province =>
      province.i &&
      !province.removed &&
      province.coa &&
      province.coa.size !== 0 &&
      isCellInScope(focusScope, province.center)
  );
  const burgs = pack.burgs.filter(
    burg => burg.i && !burg.removed && burg.coa && burg.coa.size !== 0 && isCellInScope(focusScope, burg.cell)
  );

  const baseSizes = {
    state: getStateEmblemsSize(graphWidth, graphHeight, states, sizes.state),
    province: getProvinceEmblemsSize(graphWidth, graphHeight, provinces, sizes.province),
    burg: getBurgEmblemsSize(graphWidth, graphHeight, burgs, sizes.burg)
  };

  const nodes = [
    ...burgs.map(burg => buildBurgEmblem(worldContext, burg, baseSizes.burg, opacity, appServices)),
    ...provinces.map(province => buildProvinceEmblem(worldContext, province, baseSizes.province, opacity, appServices)),
    ...states.map(state => buildStateEmblem(worldContext, state, baseSizes.state, opacity, appServices))
  ];

  const simulation = forceSimulation(nodes)
    .alphaMin(0.6)
    .alphaDecay(0.2)
    .velocityDecay(0.6)
    .force(
      "collision",
      forceCollide<DeckEmblemIcon>().radius(emblem => emblem.size / 2)
    )
    .stop();
  const ticks = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()));
  for (let index = 0; index < ticks; index++) simulation.tick();

  return nodes.map(node => ({ ...node, position: [node.x, node.y] }));
}

export function buildBurgIconSymbols(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  styles: {
    burgIcons: Record<string, DeckBurgIconStyle>;
    anchors: Record<string, DeckBurgIconStyle>;
    visibleGroups: ReadonlySet<string>;
  }
): DeckBurgIconSymbol[] {
  const icons: DeckBurgIconSymbol[] = [];
  for (const burg of worldContext.pack.burgs) {
    if (!burg.i || burg.removed || !isCellInScope(focusScope, burg.cell)) continue;
    const group = burg.group || getBurgGroupName(worldContext, burg);
    if (!styles.visibleGroups.has(group)) continue;

    const iconStyle = styles.burgIcons[group] ?? styles.burgIcons.town ?? DEFAULT_BURG_ICON_STYLE;
    const iconRaster = getCachedBurgIconRaster(iconStyle.icon);
    icons.push({
      id: `burg-${burg.i}`,
      kind: "burgIcon",
      type: "burg",
      burgId: burg.i,
      cellId: burg.cell,
      group,
      position: [burg.x, burg.y],
      size: iconStyle.size,
      color:
        iconRaster && !iconRaster.mask
          ? colorToRgba("#ffffff", "#ffffff", iconStyle.opacity)
          : colorToRgba(iconStyle.fill, "#3e3e4b", iconStyle.opacity),
      iconUrl: iconRaster?.url ?? null,
      mask: iconRaster?.mask ?? true
    });

    if (!burg.port) continue;
    const anchorStyle = styles.anchors[group] ?? styles.anchors.town ?? DEFAULT_ANCHOR_ICON_STYLE;
    const anchorRaster = getCachedBurgIconRaster(anchorStyle.icon);
    icons.push({
      id: `anchor-${burg.i}`,
      kind: "burgIcon",
      type: "anchor",
      burgId: burg.i,
      cellId: burg.cell,
      group,
      position: [burg.x, burg.y],
      size: anchorStyle.size,
      color:
        anchorRaster && !anchorRaster.mask
          ? colorToRgba("#ffffff", "#ffffff", anchorStyle.opacity)
          : colorToRgba(anchorStyle.fill, "#ffffff", anchorStyle.opacity),
      iconUrl: anchorRaster?.url ?? null,
      mask: anchorRaster?.mask ?? true
    });
  }

  return icons;
}

/**
 * Builds the same visible burg/port set as the 2D icon adapter, but deliberately does not
 * rasterize SVG symbols. Mesh mode uses these descriptors to choose small shared geometries.
 */
export function buildLowPolyBurgSymbols(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  styles: {
    burgIcons: Record<string, DeckBurgIconStyle>;
    anchors: Record<string, DeckBurgIconStyle>;
    visibleGroups: ReadonlySet<string>;
  }
): LowPolyBurgSymbol[] {
  const icons: LowPolyBurgSymbol[] = [];
  for (const burg of worldContext.pack.burgs) {
    if (!burg.i || burg.removed || !isCellInScope(focusScope, burg.cell)) continue;
    const group = burg.group || getBurgGroupName(worldContext, burg);
    if (!styles.visibleGroups.has(group)) continue;

    const iconStyle = styles.burgIcons[group] ?? styles.burgIcons.town ?? DEFAULT_BURG_ICON_STYLE;
    icons.push({
      id: `burg-${burg.i}`,
      burgId: burg.i,
      cellId: burg.cell,
      population: burg.population,
      group,
      type: "burg",
      shape: getLowPolyBurgShape(iconStyle.icon, "burg"),
      position: [burg.x, burg.y],
      size: Math.max(0.6, iconStyle.size * 0.2),
      color: iconStyle.fill,
      opacity: iconStyle.opacity
    });

    if (!burg.port) continue;
    const anchorStyle = styles.anchors[group] ?? styles.anchors.town ?? DEFAULT_ANCHOR_ICON_STYLE;
    icons.push({
      id: `anchor-${burg.i}`,
      burgId: burg.i,
      cellId: burg.cell,
      population: burg.population,
      group,
      type: "anchor",
      shape: "anchor",
      position: [burg.x, burg.y],
      size: Math.max(0.45, anchorStyle.size * 0.32),
      color: anchorStyle.fill,
      opacity: anchorStyle.opacity
    });
  }
  return icons;
}

function getLowPolyBurgShape(icon: string, type: DeckBurgIconType): LowPolyBurgShape {
  if (type === "anchor" || icon.includes("anchor")) return "anchor";
  return /square|castle|capital|fort/.test(icon) ? "cube" : "sphere";
}

export function buildMarkerSymbols(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  style: DeckMarkerStyle
): DeckMarkerSymbol[] {
  const markers = style.pinnedOnly
    ? worldContext.pack.markers.filter((marker: Marker) => marker.pinned)
    : worldContext.pack.markers;

  return markers
    .filter(marker => !marker.hidden && isCellInScope(focusScope, marker.cell))
    .map(marker => {
      const x = marker.x ?? worldContext.pack.cells.p[marker.cell]?.[0] ?? 0;
      const y = marker.y ?? worldContext.pack.cells.p[marker.cell]?.[1] ?? 0;
      const size = getMarkerSize(marker.size ?? 30, style);
      const rawIcon = marker.icon || "";
      const isExternal = isExternalMarkerIcon(rawIcon);
      // A previously failed (404/CORS-blocked) external image is treated like "no icon" rather
      // than left as a permanently broken image request — same fallback the marker already has
      // when it has no icon at all.
      const icon = isExternal && hasExternalIconFailed(rawIcon) ? "" : rawIcon;
      const dx = marker.dx ?? 50;
      const dy = marker.dy ?? 50;
      return {
        id: `marker-${marker.i}`,
        kind: "marker" as const,
        markerId: marker.i,
        cellId: marker.cell,
        position: [x, y],
        textPosition: [x - size / 2 + size * (dx / 100), y - size + size * (dy / 100)],
        imagePosition: [x - size / 2 + size * (dx / 200), y - size + size * (dy / 200)],
        size,
        icon,
        iconSize: marker.px ?? 12,
        fillColor: marker.fill ?? "#ffffff",
        strokeColor: marker.stroke ?? "#000000",
        pin: marker.pin ?? "bubble",
        isExternalIcon: isExternalMarkerIcon(icon)
      };
    });
}

export function buildMilitaryRegimentSymbols(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  boxSize: number
): DeckMilitaryRegimentSymbol[] {
  const regiments: DeckMilitaryRegimentSymbol[] = [];
  for (const state of worldContext.pack.states) {
    if (!state.i || state.removed || (focusScope && state.i !== focusScope.stateId)) continue;
    for (const regiment of state.military ?? []) {
      if (!isCellInScope(focusScope, regiment.cell)) continue;
      const size = Math.max(boxSize || 6, 1);
      const width = regiment.n ? size * 4 : size * 6;
      const height = size * 2;
      const left = regiment.x - width / 2;
      const top = regiment.y - size;
      const unitIcon = regiment.icon || getMilitaryEmblem(worldContext, regiment);
      regiments.push({
        id: `regiment-${state.i}-${regiment.i}`,
        kind: "military",
        regimentId: regiment.i,
        stateId: state.i,
        cellId: regiment.cell,
        position: [regiment.x, regiment.y],
        totalPosition: [regiment.x, regiment.y],
        unitIconPosition: [left - size, regiment.y],
        unitImagePosition: [left - height + height / 2, top + height / 2],
        actionIconPosition: [left + width + size, regiment.y],
        width,
        height,
        size,
        angle: regiment.angle ?? 0,
        total: formatMilitaryTotal(regiment.a, Boolean(regiment.n)),
        unitIcon,
        actionIcon: regiment.actionStatus === "battled" ? "🎯" : "🎪",
        isExternalIcon: isExternalMarkerIcon(unitIcon)
      });
    }
  }

  return regiments;
}

export function buildMilitaryBoxPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  boxSize: number
): DeckMilitaryBoxPolygon[] {
  const boxes: DeckMilitaryBoxPolygon[] = [];
  for (const state of worldContext.pack.states) {
    if (!state.i || state.removed || (focusScope && state.i !== focusScope.stateId)) continue;
    const baseColor = state.color && state.color[0] === "#" ? state.color : "#999999";
    const darkerColor = parseColor(baseColor)?.darker().formatHex() ?? "#666666";
    const mainColor = colorToRgba(baseColor, "#999999", 0.9);
    const sideColor = colorToRgba(darkerColor, "#666666", 0.9);

    for (const regiment of state.military ?? []) {
      if (!isCellInScope(focusScope, regiment.cell)) continue;
      const size = Math.max(boxSize || 6, 1);
      const width = regiment.n ? size * 4 : size * 6;
      const height = size * 2;
      const left = regiment.x - width / 2;
      const top = regiment.y - size;
      const angle = regiment.angle ?? 0;
      boxes.push(
        buildMilitaryBox(regiment, state.i, "main", left, top, width, height, angle, mainColor),
        buildMilitaryBox(regiment, state.i, "unit", left - height, top, height, height, angle, sideColor),
        buildMilitaryBox(regiment, state.i, "action", left + width, top, height, height, angle, sideColor)
      );
    }
  }

  return boxes;
}

export function buildLabelSymbols(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  styles: {
    state: DeckLabelStyle;
    burgLabels: Record<string, DeckLabelStyle>;
    visibleBurgGroups: ReadonlySet<string>;
  },
  options: { includeStateLabels?: boolean } = {}
): DeckLabelSymbol[] {
  const labels: DeckLabelSymbol[] = [];
  if (options.includeStateLabels !== false) {
    const stateAngles = computeStateOrientationAngles(worldContext);
    for (const state of worldContext.pack.states) {
      if (!state.i || state.removed || state.lock || !state.pole) continue;
      if (focusScope && state.i !== focusScope.stateId) continue;
      labels.push({
        id: `state-label-${state.i}`,
        kind: "label",
        type: "state",
        itemId: state.i,
        cellId: state.center ?? null,
        group: "states",
        text: getStateLabelText(worldContext, state),
        position: state.pole,
        size: styles.state.size,
        color: colorToRgba(styles.state.fill, "#3e3e4b", styles.state.opacity),
        angle: stateAngles.get(state.i) ?? 0
      });
    }
  }

  for (const burg of worldContext.pack.burgs) {
    if (!burg.i || burg.removed || !isCellInScope(focusScope, burg.cell)) continue;
    const group = burg.group || "town";
    if (!styles.visibleBurgGroups.has(group)) continue;
    const style = styles.burgLabels[group] ?? styles.burgLabels.town ?? DEFAULT_BURG_LABEL_STYLE;
    labels.push({
      id: `burg-label-${burg.i}`,
      kind: "label",
      type: "burg",
      itemId: burg.i,
      cellId: burg.cell,
      group,
      text: burg.name ?? `Burg ${burg.i}`,
      position: [burg.x + style.dx * style.size, burg.y + style.dy * style.size],
      size: style.size,
      color: colorToRgba(style.fill, "#3e3e4b", style.opacity),
      angle: 0
    });
  }

  return labels;
}

// Approximates draw-state-labels.ts's curved textPath raycast layout, which deck.gl's TextLayer
// architecturally cannot follow (it only lays out straight lines). Instead each state's cells are
// used to compute a principal-axis angle (2x2 covariance eigenvector, closed form for symmetric
// 2x2 matrices) so the flat label at least follows the state's general orientation. One pass over
// all cells accumulates the moments for every state at once, then one pass over (few) states
// resolves each angle — O(cells + states) rather than O(cells * states).
function computeStateOrientationAngles(worldContext: Readonly<WorldContext>): Map<number, number> {
  const { cells } = worldContext.pack;
  const stateIds = cells.state;
  const points = cells.p;
  if (!stateIds || !points) return new Map();

  interface Moments {
    count: number;
    sumX: number;
    sumY: number;
    sumXX: number;
    sumYY: number;
    sumXY: number;
  }
  const moments = new Map<number, Moments>();
  for (let cellId = 0; cellId < stateIds.length; cellId++) {
    const stateId = stateIds[cellId];
    if (!stateId) continue;
    const p = points[cellId];
    if (!p) continue;
    let m = moments.get(stateId);
    if (!m) {
      m = { count: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 };
      moments.set(stateId, m);
    }
    m.count++;
    m.sumX += p[0];
    m.sumY += p[1];
    m.sumXX += p[0] * p[0];
    m.sumYY += p[1] * p[1];
    m.sumXY += p[0] * p[1];
  }

  const angles = new Map<number, number>();
  for (const [stateId, m] of moments) {
    if (m.count < 2) continue;
    const meanX = m.sumX / m.count;
    const meanY = m.sumY / m.count;
    const varX = m.sumXX / m.count - meanX * meanX;
    const varY = m.sumYY / m.count - meanY * meanY;
    const covXY = m.sumXY / m.count - meanX * meanY;
    const angleRad = 0.5 * Math.atan2(2 * covXY, varX - varY);
    angles.set(stateId, (angleRad * 180) / Math.PI);
  }
  return angles;
}

function getStateLabelText(worldContext: Readonly<WorldContext>, state: State): string {
  const mode = worldContext.options.stateLabelsMode || "auto";
  if (mode === "full") return state.fullName || state.name || `State ${state.i}`;
  return state.name || state.fullName || `State ${state.i}`;
}

function buildMilitaryBox(
  regiment: MilitaryRegiment,
  stateId: number,
  part: DeckMilitaryBoxPart,
  left: number,
  top: number,
  width: number,
  height: number,
  angle: number,
  fillColor: Color
): DeckMilitaryBoxPolygon {
  const polygon = rotatePolygon(
    [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height]
    ],
    [regiment.x, regiment.y],
    angle
  );
  return {
    id: `regiment-${stateId}-${regiment.i}-${part}`,
    kind: "military",
    regimentId: regiment.i,
    stateId,
    cellId: regiment.cell,
    part,
    polygon,
    fillColor
  };
}

function rotatePolygon(points: DeckPosition[], origin: DeckPosition, angle: number): DeckPosition[] {
  if (!angle) return points;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const [originX, originY] = origin;
  return points.map(([x, y]) => {
    const dx = x - originX;
    const dy = y - originY;
    return [originX + dx * cos - dy * sin, originY + dx * sin + dy * cos];
  });
}

function formatMilitaryTotal(amount: number, naval: boolean): string {
  const threshold = naval ? 999 : 99999;
  if (amount <= threshold) return String(Math.round(amount));
  if (amount >= 1_000_000) return `${Math.round(amount / 100_000) / 10}M`;
  return `${Math.round(amount / 100) / 10}k`;
}

function getMilitaryEmblem(worldContext: Readonly<WorldContext>, regiment: MilitaryRegiment): string {
  if (regiment.isCapitalGuard) return "👑";
  if (regiment.n) {
    const navalUnit = worldContext.options.military?.find(unit => unit.type === "naval");
    return navalUnit?.icon ?? "🌊";
  }
  const units = Object.entries(regiment.u);
  if (!units.length) return "🔰";
  const [mainUnit] = units.sort((left, right) => right[1] - left[1])[0];
  const unit = worldContext.options.military?.find(item => item.name === mainUnit);
  return unit?.icon ?? "⚔️";
}

function getMarkerSize(size: number, style: DeckMarkerStyle): number {
  return style.rescale ? Math.max(Math.round((size / 5 + 24 / Math.max(style.scale, 0.0001)) * 100) / 100, 1) : size;
}

function isExternalMarkerIcon(icon: string): boolean {
  return icon.startsWith("http") || icon.startsWith("data:image");
}

export function buildCoastlinePaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  appServices: AppServices,
  getStrokeColor: (group: string) => Color,
  getStrokeWidth: (group: string) => number
): DeckPath[] {
  return getRenderableFeatures(worldContext, focusScope, "island", appServices).map(feature => {
    const group = feature.feature.group === "lake_island" ? "lake_island" : "sea_island";
    return {
      id: `coastline-${feature.feature.i}`,
      path: closePath(feature.points),
      color: getStrokeColor(group),
      width: getStrokeWidth(group),
      kind: "coastline",
      cellId: feature.feature.firstCell,
      group
    };
  });
}

/**
 * Build the curved, fractalized island geometry used as a GPU land mask. SVG applies the same
 * feature geometry through #land, preventing political and land overlays from spilling into sea.
 */
export function buildLandMaskPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  appServices: AppServices
): DeckLandMaskPolygon[] {
  const islands = getRenderableFeatures(worldContext, focusScope, "island", appServices);
  // Lakes must remain in the mask even when a focused state excludes their water cells. Otherwise
  // adjacent land fills and river polygons would bridge straight across their surface.
  const lakes = getRenderableFeatures(worldContext, null, "lake", appServices);

  return islands.map(island => ({
    id: `land-mask-${island.feature.i}`,
    polygon: [
      island.points,
      ...lakes.filter(lake => isPointInsidePolygon(lake.points[0], island.points)).map(lake => lake.points)
    ],
    fillColor: [255, 255, 255, 255]
  }));
}

function isPointInsidePolygon(point: DeckPosition | undefined, polygon: DeckPosition[]): boolean {
  if (!point || polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [currentX, currentY] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const intersects =
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildBurgEmblem(
  worldContext: Readonly<WorldContext>,
  burg: Burg,
  baseSize: number,
  opacity: number,
  _appServices: Readonly<AppServices>
): DeckEmblemIcon {
  const size = Math.max(1, baseSize * (burg.coa?.size || 1));
  const state = burg.state ? worldContext.pack.states[burg.state] : null;
  // Burgs keep the flat placeholder shield rather than rasterized coa art: a map can have
  // hundreds to thousands of burgs (vs. tens/low hundreds of states+provinces), and deck.gl's
  // IconLayer auto-packing lays every distinct icon into one shared atlas texture whose height
  // grows with icon count — rasterizing coa art for every burg risks exceeding GPU texture size
  // limits on large maps. States/provinces are few enough that this isn't a concern for them.
  return {
    id: `burg-${burg.i}`,
    kind: "emblem",
    type: "burg",
    cellId: burg.cell,
    x: burg.coa?.x || burg.x,
    y: burg.coa?.y || burg.y,
    position: [burg.coa?.x || burg.x, burg.coa?.y || burg.y],
    size,
    color: colorToRgba(state?.color, "#ffffff", opacity),
    iconUrl: null
  };
}

function buildProvinceEmblem(
  worldContext: Readonly<WorldContext>,
  province: Province,
  baseSize: number,
  opacity: number,
  appServices: Readonly<AppServices>
): DeckEmblemIcon {
  const [x, y] = province.pole || worldContext.pack.cells.p[province.center];
  const size = Math.max(1, baseSize * (province.coa?.size || 1));
  const id = `province-${province.i}`;
  const iconUrl = getCachedEmblemIconUrl(id, province.coa, appServices);
  return {
    id,
    kind: "emblem",
    type: "province",
    cellId: province.center,
    x: province.coa?.x || x,
    y: province.coa?.y || y,
    position: [province.coa?.x || x, province.coa?.y || y],
    size,
    color: iconUrl ? colorToRgba("#ffffff", "#ffffff", opacity) : colorToRgba(province.color, "#ffffff", opacity),
    iconUrl
  };
}

function buildStateEmblem(
  worldContext: Readonly<WorldContext>,
  state: State,
  baseSize: number,
  opacity: number,
  appServices: Readonly<AppServices>
): DeckEmblemIcon {
  const [x, y] = state.pole || worldContext.pack.cells.p[state.center];
  const size = Math.max(1, baseSize * (state.coa?.size || 1));
  const id = `state-${state.i}`;
  const iconUrl = getCachedEmblemIconUrl(id, state.coa, appServices);
  return {
    id,
    kind: "emblem",
    type: "state",
    cellId: state.center,
    x: state.coa?.x || x,
    y: state.coa?.y || y,
    position: [state.coa?.x || x, state.coa?.y || y],
    size,
    color: iconUrl ? colorToRgba("#ffffff", "#ffffff", opacity) : colorToRgba(state.color, "#ffffff", opacity),
    iconUrl
  };
}

function getStateEmblemsSize(graphWidth: number, graphHeight: number, states: State[], sizeMod: number): number {
  const startSize = clamp((graphHeight + graphWidth) / 40, 10, 100);
  const statesMod = 1 + states.length / 100 - (15 - states.length) / 200;
  return Math.round((startSize / statesMod) * sizeMod);
}

function getProvinceEmblemsSize(
  graphWidth: number,
  graphHeight: number,
  provinces: Province[],
  sizeMod: number
): number {
  const startSize = clamp((graphHeight + graphWidth) / 100, 5, 70);
  const provincesMod = 1 + provinces.length / 1000 - (115 - provinces.length) / 1000;
  return Math.round((startSize / provincesMod) * sizeMod);
}

function getBurgEmblemsSize(graphWidth: number, graphHeight: number, burgs: Burg[], sizeMod: number): number {
  const startSize = clamp((graphHeight + graphWidth) / 185, 2, 50);
  const burgsMod = 1 + burgs.length / 1000 - (450 - burgs.length) / 1000;
  return Math.round((startSize / burgsMod) * sizeMod);
}

const DEFAULT_BURG_ICON_STYLE: DeckBurgIconStyle = { fill: "#3e3e4b", opacity: 1, size: 4, icon: "#icon-circle" };
const DEFAULT_ANCHOR_ICON_STYLE: DeckBurgIconStyle = { fill: "#ffffff", opacity: 1, size: 1, icon: "#icon-anchor" };
const DEFAULT_BURG_LABEL_STYLE: DeckLabelStyle = {
  fill: "#3e3e4b",
  opacity: 1,
  size: 4,
  dx: 0,
  dy: -0.4,
  fontFamily: "Almendra SC",
  haloColor: "white"
};

function getBurgGroupName(worldContext: Readonly<WorldContext>, burg: Burg): string {
  const groups = worldContext.options.burgs?.groups as BurgGroup[] | undefined;
  if (burg.capital) return "capital";
  return groups?.find(group => group.name === burg.group)?.name ?? "town";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function applyOffset(points: [number, number][], offset: [number, number] | undefined): DeckPosition[] {
  if (!offset) return points.map(([x, y]) => [x, y]);
  return points.map(([x, y]) => [x + offset[0], y + offset[1]]);
}

function buildLandPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  kind: WebglPickKind,
  getFillColor: (cellId: number) => Color,
  landCells?: ReadonlyArray<DeckLandCellGeometry>
): DeckCellPolygon[] {
  if (landCells) {
    return landCells.map(({ cellId, polygon }) => ({
      id: `${kind}-cell-${cellId}`,
      kind,
      cellId,
      polygon,
      fillColor: getFillColor(cellId)
    }));
  }

  return buildCellPolygons(
    worldContext,
    focusScope,
    kind,
    getFillColor,
    cellId => worldContext.pack.cells.h[cellId] >= 20
  );
}

function buildGridCellPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  kind: WebglPickKind,
  getFillColor: (cellId: number) => Color
): DeckCellPolygon[] {
  const { cells, vertices } = worldContext.grid;
  const polygons: DeckCellPolygon[] = [];

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isGridCellInScope(focusScope, cellId)) continue;
    const vertexIds = cells.v[cellId] ?? [];
    const polygon = vertexIds
      .map(vertexId => vertices.p[vertexId])
      .filter((point): point is [number, number] => Boolean(point))
      .map(([x, y]) => [x, y] as DeckPosition);

    if (polygon.length >= 3) {
      polygons.push({
        id: `${kind}-grid-cell-${cellId}`,
        kind,
        cellId,
        polygon,
        fillColor: getFillColor(cellId)
      });
    }
  }

  return polygons;
}

function buildCellPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  kind: WebglPickKind,
  getFillColor: (cellId: number) => Color,
  includeCell: (cellId: number) => boolean = () => true
): DeckCellPolygon[] {
  const { cells, vertices } = worldContext.pack;
  const polygons: DeckCellPolygon[] = [];

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!includeCell(cellId) || !isCellInScope(focusScope, cellId)) continue;
    const polygon = getCellPolygon(cells, vertices, cellId);
    if (!polygon) continue;
    polygons.push({ id: `${kind}-cell-${cellId}`, kind, cellId, polygon, fillColor: getFillColor(cellId) });
  }

  return polygons;
}

function getCellPolygon(
  cells: Readonly<PackedGraphCells>,
  vertices: Readonly<PackedGraphVertices>,
  cellId: number
): DeckPosition[] | null {
  const polygon = (cells.v[cellId] ?? [])
    .map(vertexId => vertices.p[vertexId])
    .filter((point): point is [number, number] => Boolean(point))
    .map(([x, y]) => [x, y] as DeckPosition);

  return polygon.length >= 3 ? polygon : null;
}

function getCoastalFringePolygons(
  cells: Readonly<PackedGraphCells>,
  vertices: Readonly<PackedGraphVertices>,
  cellId: number
): DeckPosition[][] {
  const fringes: DeckPosition[][] = [];
  const vIds = cells.v[cellId] ?? [];
  if (vIds.length < 3) return fringes;

  const edgeDisplacements: { vA: number; vB: number; vA_out: DeckPosition; vB_out: DeckPosition }[] = [];

  for (let i = 0; i < vIds.length; i++) {
    const vA_id = vIds[i];
    const vB_id = vIds[(i + 1) % vIds.length];

    const sharedCells = vertices.c[vA_id]?.filter(c => vertices.c[vB_id]?.includes(c)) || [];
    const neighborId = sharedCells.find(c => c !== cellId);
    if (neighborId === undefined) continue;

    const isCoastalEdge = cells.h[neighborId] < 20;

    if (isCoastalEdge) {
      const vA = vertices.p[vA_id];
      const vB = vertices.p[vB_id];
      const neighborP = cells.p[neighborId];

      if (vA && vB && neighborP) {
        let nx = -(vB[1] - vA[1]);
        let ny = vB[0] - vA[0];
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= len;
        ny /= len;

        const midX = (vA[0] + vB[0]) / 2;
        const midY = (vA[1] + vB[1]) / 2;
        const dot = nx * (neighborP[0] - midX) + ny * (neighborP[1] - midY);

        if (dot < 0) {
          nx = -nx;
          ny = -ny;
        }

        const distToNeighbor = Math.sqrt((neighborP[0] - midX) ** 2 + (neighborP[1] - midY) ** 2);
        const expansion = Math.min(15, Math.max(1, distToNeighbor * 0.9));

        const vA_out: DeckPosition = [vA[0] + nx * expansion, vA[1] + ny * expansion];
        const vB_out: DeckPosition = [vB[0] + nx * expansion, vB[1] + ny * expansion];

        fringes.push([[vA[0], vA[1]], [vB[0], vB[1]], vB_out, vA_out]);
        edgeDisplacements.push({ vA: vA_id, vB: vB_id, vA_out, vB_out });
      }
    }
  }

  for (let i = 0; i < edgeDisplacements.length; i++) {
    const current = edgeDisplacements[i];
    const next = edgeDisplacements.find(e => e.vA === current.vB);
    if (next) {
      const vB = vertices.p[current.vB];
      if (vB) {
        fringes.push([[vB[0], vB[1]], current.vB_out, next.vA_out]);
      }
    }
  }

  return fringes;
}

function getGridCellPolygon(
  cells: Readonly<{ v: number[][] }>,
  vertices: Readonly<{ p: [number, number][] }>,
  cellId: number
): DeckPosition[] | null {
  const polygon = (cells.v[cellId] ?? [])
    .map(vertexId => vertices.p[vertexId])
    .filter((point): point is [number, number] => Boolean(point))
    .map(([x, y]) => [x, y] as DeckPosition);

  return polygon.length >= 3 ? polygon : null;
}

/**
 * Convert a persisted route's untrusted point array into a deck.gl-safe path.
 * A single corrupt point invalidates the route: silently removing only that point could join
 * two non-adjacent segments and visually invent a road.
 */
function getValidDeckPath(points: unknown): DeckPosition[] | null {
  if (!Array.isArray(points) || points.length < 2) return null;

  const path: DeckPosition[] = [];
  for (const point of points) {
    if (
      !Array.isArray(point) ||
      typeof point[0] !== "number" ||
      !Number.isFinite(point[0]) ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[1])
    ) {
      return null;
    }
    path.push([point[0], point[1]]);
  }

  return path;
}

function getRenderableFeatures(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  type: "lake" | "island",
  appServices: AppServices
): Array<{ feature: PackedGraphFeature; points: DeckPosition[] }> {
  const features = (
    Array.isArray(worldContext.pack.features)
      ? worldContext.pack.features
      : Object.values(worldContext.pack.features || {})
  ) as PackedGraphFeature[];

  return features
    .filter(
      feature =>
        Boolean(feature) &&
        feature.type === type &&
        (!focusScope || featureFeatureIntersectsScope(worldContext, focusScope, feature))
    )
    .map(feature => {
      const points = getFeaturePolygon(worldContext, appServices, feature);
      return points.length >= 3 ? { feature, points } : null;
    })
    .filter((feature): feature is { feature: PackedGraphFeature; points: DeckPosition[] } => Boolean(feature));
}

function featureFeatureIntersectsScope(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope,
  feature: PackedGraphFeature
): boolean {
  if (focusScope.cellIds.has(feature.firstCell)) return true;
  return worldContext.pack.cells.i.some(
    cellId => worldContext.pack.cells.f[cellId] === feature.i && focusScope.cellIds.has(cellId)
  );
}

function getFeaturePolygon(
  worldContext: Readonly<WorldContext>,
  appServices: AppServices,
  feature: PackedGraphFeature
): DeckPosition[] {
  const points = feature.vertices
    .map(vertexId => worldContext.pack.vertices.p[vertexId])
    .filter((point): point is [number, number] => Boolean(point));
  if (points.length < 3) return [];

  const simplified = _simplify(
    points.map(([x, y]) => ({ x, y })),
    0.3
  ).map(({ x, y }) => [x, y] as [number, number]);
  const clipped = clipPoly(simplified, worldContext.graphWidth, worldContext.graphHeight, 1);
  const fractalShape = fractalizeCoastline(
    worldContext,
    {} as Readonly<ViewContext>,
    appServices,
    clipped,
    feature.i,
    feature.type
  );
  return sampleCoastlineShape(fractalShape, 0.5).map(([x, y]) => [x, y] as DeckPosition);
}

function closePath(points: DeckPosition[]): DeckPosition[] {
  if (!points.length) return [];
  const first = points[0];
  const last = points.at(-1);
  if (last && first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

function getSharedEdge(
  cells: Readonly<PackedGraphCells>,
  vertices: Readonly<PackedGraphVertices>,
  fromCell: number,
  toCell: number
): [DeckPosition, DeckPosition] | null {
  const shared = (cells.v[fromCell] ?? []).filter(vertexId => vertices.c[vertexId]?.includes(toCell));
  if (shared.length < 2) return null;
  const [first, second] = shared;
  const a = vertices.p[first];
  const b = vertices.p[second];
  return a && b ? ([a, b] as [DeckPosition, DeckPosition]) : null;
}

function getRouteColor(route: Route): Color {
  if (route.group === "searoutes") return colorToRgba("#4f8fc6", "#4f8fc6", 0.8);
  if (route.group === "roads") return colorToRgba("#7b4b2a", "#7b4b2a");
  return colorToRgba("#8b6f47", "#8b6f47", 0.9);
}

function getBorderColor(): Color {
  return colorToRgba("#56566d", "#56566d", 0.8);
}

function getDivisionBoundaryColor(division: DeckDivisionBoundaryKind): Color {
  if (division === "state") return colorToRgba("#111111", "#111111", 0.72);
  if (division === "province") return colorToRgba("#222222", "#222222", 0.42);
  return colorToRgba("#ffffff", "#ffffff", 0.45);
}

function getDivisionBoundaryWidth(division: DeckDivisionBoundaryKind): number {
  if (division === "state") return 0.9;
  if (division === "province") return 0.45;
  return 0.55;
}
