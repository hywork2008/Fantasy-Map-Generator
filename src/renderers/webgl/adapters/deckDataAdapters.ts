import type { Color } from "@deck.gl/core";
import { color as parseColor } from "d3";
import _simplify from "simplify-js";
import type { AppServices } from "../../../context/appServices";
import type { FocusScope, ViewContext } from "../../../context/viewContext";
import type { WorldContext } from "../../../context/worldContext";
import { HeightThreshold } from "../../../data/constants";
import { Rivers } from "../../../generators/river-generator";
import type { IceElement, PackedGraphFeature, Route } from "../../../types/models";
import type { PackedGraphCells, PackedGraphVertices } from "../../../types/PackedGraph";
import type { WebglPickKind } from "../../../types/webglPicking";
import { clipPoly } from "../../../utils";
import { getColor, getColorScheme } from "../../../utils/colorUtils";
import { fractalizeCoastline } from "../../coastline-fractal";
import { isCellInScope, isGridCellInScope } from "../../core/focusScope";

export type DeckPosition = [number, number];

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
}

export interface DeckFeaturePolygon extends DeckCellPolygon {
  featureId: number;
  group: string;
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

export type DeckDivisionBoundaryKind = "state" | "province" | "culture" | "religion";

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

export function buildLandPolygonsBase(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  fill = "#eef6fb"
): DeckCellPolygon[] {
  return buildLandPolygons(worldContext, focusScope, "land", () => colorToRgba(fill, "#eef6fb"));
}

export function buildHeightPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  style: DeckHeightStyle = { scheme: "bright", opacity: 1, includeOcean: false }
): DeckCellPolygon[] {
  const { cells, vertices } = worldContext.grid;
  if (!cells?.i || !cells.v || !vertices?.p) return [];

  const scheme = getColorScheme(style.scheme);
  const polygons: DeckCellPolygon[] = [];
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
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack, biomesData } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "biome", cellId =>
    colorToRgba(biomesData.color[pack.cells.biome[cellId]], "#999999", 0.9)
  );
}

export function buildCulturePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "culture", cellId =>
    colorToRgba(pack.cultures[pack.cells.culture[cellId]]?.color, "#999999", 0.7)
  );
}

export function buildReligionPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "religion", cellId =>
    colorToRgba(pack.religions[pack.cells.religion[cellId]]?.color, "#999999", 0.7)
  );
}

export function buildStatePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "state", cellId =>
    colorToRgba(pack.states[pack.cells.state[cellId]]?.color, "#999999", 0.64)
  );
}

export function buildProvincePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "province", cellId =>
    colorToRgba(pack.provinces[pack.cells.province[cellId]]?.color, "#999999", 0.58)
  );
}

export function buildZonePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  const zoneByCell = new Map<number, string>();
  for (const zone of pack.zones ?? []) {
    if (!zone || zone.hidden) continue;
    for (const cellId of zone.cells ?? []) zoneByCell.set(cellId, zone.color);
  }

  return buildLandPolygons(worldContext, focusScope, "zone", cellId => {
    const color = zoneByCell.get(cellId);
    return color ? colorToRgba(color, "#999999", 0.65) : [0, 0, 0, 0];
  }).filter(polygon => (polygon.fillColor[3] ?? 255) > 0);
}

export function buildTemperaturePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { grid, pack } = worldContext;
  return buildCellPolygons(worldContext, focusScope, "temperature", cellId => {
    const temp = grid.cells.temp?.[pack.cells.g[cellId]] ?? 0;
    if (temp < -5) return colorToRgba("#3f7cc7", "#3f7cc7", 0.72);
    if (temp < 10) return colorToRgba("#8fc6da", "#8fc6da", 0.72);
    if (temp < 25) return colorToRgba("#e3d36f", "#e3d36f", 0.72);
    return colorToRgba("#c8583a", "#c8583a", 0.72);
  });
}

export function buildPrecipitationPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { grid, pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "precipitation", cellId => {
    const precipitation = grid.cells.prec?.[pack.cells.g[cellId]] ?? 0;
    const alpha = Math.min(0.75, Math.max(0.18, precipitation / 220));
    return colorToRgba("#2d7dd2", "#2d7dd2", alpha);
  });
}

export function buildDangerPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "danger", cellId => {
    const danger = pack.cells.danger?.[cellId] ?? 0;
    if (!danger) return [0, 0, 0, 0];
    return colorToRgba("#d0240f", "#d0240f", Math.min(0.75, Math.max(0.15, danger / 100)));
  }).filter(polygon => (polygon.fillColor[3] ?? 255) > 0);
}

export function buildPopulationPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "population", cellId => {
    const population = pack.cells.pop[cellId] ?? 0;
    if (!population) return [0, 0, 0, 0];
    return colorToRgba("#8f3fb5", "#8f3fb5", Math.min(0.72, Math.max(0.18, population / 40)));
  }).filter(polygon => (polygon.fillColor[3] ?? 255) > 0);
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

export function buildBorderPaths(worldContext: Readonly<WorldContext>, focusScope: FocusScope | null): DeckPath[] {
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
      paths.push({
        id: `border-${key}`,
        path: edge,
        color: colorToRgba("#111111", "#111111", isStateBorder ? 0.95 : 0.6),
        width: isStateBorder ? 1.1 : 0.45,
        kind: "border",
        cellId
      });
    }
  }

  return paths;
}

export function buildDivisionBoundaryPaths(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  division: DeckDivisionBoundaryKind
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
      paths.push({
        id: `${division}-boundary-${cellId}-${neighborId}`,
        path: edge,
        color: getDivisionBoundaryColor(division),
        width: getDivisionBoundaryWidth(division),
        kind: "border",
        cellId
      });
    }
  }

  return paths;
}

export function buildRiverPaths(worldContext: Readonly<WorldContext>, focusScope: FocusScope | null): DeckPath[] {
  return (worldContext.pack.rivers ?? [])
    .filter(
      river => river.cells?.length >= 2 && (!focusScope || river.cells.some(cell => isCellInScope(focusScope, cell)))
    )
    .map(river => {
      const resolvedPoints = river.points && river.points.length === river.cells.length ? river.points : null;
      const path = Rivers.addMeandering(river.cells, resolvedPoints).map(([x, y]) => [x, y] as DeckPosition);
      return {
        id: `river-${river.i}`,
        path,
        color: colorToRgba("#3f75a2", "#3f75a2"),
        width: Math.max(0.6, river.sourceWidth + river.widthFactor),
        kind: "river" as const,
        cellId: river.cells[0] ?? null
      };
    });
}

export function buildRoutePaths(worldContext: Readonly<WorldContext>, focusScope: FocusScope | null): DeckPath[] {
  return (worldContext.pack.routes ?? [])
    .filter(
      route =>
        route.points?.length >= 2 && (!focusScope || (route.cells ?? []).some(cell => isCellInScope(focusScope, cell)))
    )
    .map(route => ({
      id: `route-${route.i}`,
      path: route.points.map(point => [point[0], point[1]] as DeckPosition),
      color: getRouteColor(route),
      width: route.group === "searoutes" ? 0.7 : route.group === "roads" ? 1.1 : 0.65,
      kind: "route" as const,
      cellId: route.cells?.[0] ?? null
    }));
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
      cellId: feature.feature.firstCell
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
      cellId: feature.feature.firstCell
    };
  });
}

function applyOffset(points: [number, number][], offset: [number, number] | undefined): DeckPosition[] {
  if (!offset) return points.map(([x, y]) => [x, y]);
  return points.map(([x, y]) => [x + offset[0], y + offset[1]]);
}

function buildLandPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  kind: WebglPickKind,
  getFillColor: (cellId: number) => Color
): DeckCellPolygon[] {
  return buildCellPolygons(
    worldContext,
    focusScope,
    kind,
    getFillColor,
    cellId => worldContext.pack.cells.h[cellId] >= 20
  );
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
  return fractalizeCoastline(
    worldContext,
    {} as Readonly<ViewContext>,
    appServices,
    clipped,
    feature.i,
    feature.type
  ).points.map(([x, y]) => [x, y] as DeckPosition);
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
