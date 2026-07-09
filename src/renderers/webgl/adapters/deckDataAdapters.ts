import type { Color } from "@deck.gl/core";
import { color as parseColor } from "d3";
import type { FocusScope } from "../../../context/viewContext";
import type { WorldContext } from "../../../context/worldContext";
import { Rivers } from "../../../generators/river-generator";
import type { Route } from "../../../types/models";
import type { PackedGraphCells, PackedGraphVertices } from "../../../types/PackedGraph";
import type { WebglPickKind } from "../../../types/webglPicking";
import { isCellInScope } from "../../core/focusScope";

export type DeckPosition = [number, number];

export interface DeckCellPolygon {
  id: string;
  kind: WebglPickKind;
  cellId: number;
  polygon: DeckPosition[];
  fillColor: Color;
}

export interface DeckPath {
  id: string;
  path: DeckPosition[];
  color: Color;
  width: number;
  kind: WebglPickKind;
  cellId: number | null;
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

export function buildLandPolygonsBase(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  fill = "#eef6fb"
): DeckCellPolygon[] {
  return buildLandPolygons(worldContext, focusScope, "land", () => colorToRgba(fill, "#eef6fb"));
}

export function buildHeightPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  return buildCellPolygons(worldContext, focusScope, "height", cellId =>
    heightColor(worldContext.pack.cells.h[cellId])
  );
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
    colorToRgba(pack.cultures[pack.cells.culture[cellId]]?.color, "#999999", 0.78)
  );
}

export function buildReligionPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "religion", cellId =>
    colorToRgba(pack.religions[pack.cells.religion[cellId]]?.color, "#999999", 0.78)
  );
}

export function buildStatePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "state", cellId =>
    colorToRgba(pack.states[pack.cells.state[cellId]]?.color, "#999999", 0.72)
  );
}

export function buildProvincePolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null
): DeckCellPolygon[] {
  const { pack } = worldContext;
  return buildLandPolygons(worldContext, focusScope, "province", cellId =>
    colorToRgba(pack.provinces[pack.cells.province[cellId]]?.color, "#999999", 0.68)
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

function heightColor(height: number): Color {
  if (height < 20) return colorToRgba("#466eab", "#466eab");
  if (height < 35) return colorToRgba("#d5cf8e", "#d5cf8e");
  if (height < 55) return colorToRgba("#87a96b", "#87a96b");
  if (height < 75) return colorToRgba("#8d8a75", "#8d8a75");
  return colorToRgba("#f0f0f0", "#f0f0f0");
}

function getRouteColor(route: Route): Color {
  if (route.group === "searoutes") return colorToRgba("#4f8fc6", "#4f8fc6", 0.8);
  if (route.group === "roads") return colorToRgba("#7b4b2a", "#7b4b2a");
  return colorToRgba("#8b6f47", "#8b6f47", 0.9);
}
