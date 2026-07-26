import type { CurveFactory } from "d3";
import {
  color,
  curveBasis,
  curveBasisClosed,
  curveBasisOpen,
  curveCardinal,
  curveCardinalClosed,
  curveCardinalOpen,
  curveCatmullRom,
  curveCatmullRomClosed,
  curveCatmullRomOpen,
  curveLinear,
  curveLinearClosed,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  leastIndex,
  line,
  range
} from "d3";
import { createLayerCanvas } from "../canvas/map-canvas";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, SvgGroup, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { HeightThreshold } from "../data/constants";
import type { Point, Vertices } from "../generators/voronoi";
import { useOptionsState } from "../store/optionsState";
import type { GridCells } from "../types/Grid";
import { rn, round } from "../utils";
import { getColor, getColorScheme } from "../utils/colorUtils";
import { ERROR, TIME } from "../utils/debug";
import { isGridCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

const CURVE_MAP: Record<string, CurveFactory> = {
  curveBasis,
  curveBasisClosed,
  curveBasisOpen,
  curveCardinal,
  curveCardinalClosed,
  curveCardinalOpen,
  curveCatmullRom,
  curveCatmullRomClosed,
  curveCatmullRomOpen,
  curveLinear,
  curveLinearClosed,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore
};

type ContourType = "index" | "primary" | "firstSupplementary" | "secondSupplementary";

type ContourLabelCandidate = {
  x: number;
  y: number;
  elevation: number;
  contourType: ContourType;
};

type CachedLabeledContour = {
  id: string;
  elevation: number;
  contourType: ContourType;
  path: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  labelCandidates: ContourLabelCandidate[];
};

type CachedLabeledContourGroup = {
  contours: CachedLabeledContour[];
};

type InterpolatedContourChain = {
  points: Point[];
  closed: boolean;
};

type InterpolatedContourGeometry = {
  trianglesByElevation: Map<number, number[][]>;
  chainsByElevation: Map<number, InterpolatedContourChain[]>;
};

type LabelSpatialIndex = {
  cellSize: number;
  candidatesByCell: Map<string, ContourLabelCandidate[]>;
};

type ActiveLabeledContours = {
  ocean: { group: SvgGroup; contours: CachedLabeledContour[]; labelIndex: LabelSpatialIndex } | null;
  land: { group: SvgGroup; contours: CachedLabeledContour[]; labelIndex: LabelSpatialIndex } | null;
};

const labeledContourCache = new Map<string, CachedLabeledContourGroup>();
const interpolatedContourGeometryCache = new Map<string, InterpolatedContourGeometry>();
let cachedMapId: number | null = null;
let activeLabeledContours: ActiveLabeledContours | null = null;

/** Labeled contours keep the overview density at every zoom level. */
export function getLabeledContourDetailLevel(_scale: number): 0 {
  return 0;
}

/** Repositions only the visible, non-overlapping elevation labels after pan or zoom. */
export function refreshLabeledContourLabels(viewContext: Readonly<ViewState>): void {
  if (!activeLabeledContours) return;
  renderVisibleLabels(activeLabeledContours.ocean, viewContext);
  renderVisibleLabels(activeLabeledContours.land, viewContext);
}

/** Swaps SVG paths at the viewport edge while retaining cached contour geometry for later pans. */
export function refreshVisibleLabeledContourPaths(viewContext: Readonly<ViewState>): void {
  if (!activeLabeledContours) return;
  renderLabeledContourPaths(activeLabeledContours.ocean, viewContext);
  renderLabeledContourPaths(activeLabeledContours.land, viewContext);
}

function renderLabeledContourPaths(activeGroup: ActiveLabeledContours["land"], viewContext: Readonly<ViewState>): void {
  if (!activeGroup) return;

  const { group, contours } = activeGroup;
  let pathsGroup = group.select<SVGGElement>("g.heightmap-contour-paths");
  if (pathsGroup.empty()) {
    pathsGroup = group.insert("g", "g.heightmap-contour-labels").attr("class", "heightmap-contour-paths");
  }

  const visibleContours = contours.filter(contour => isContourInViewport(contour, viewContext));
  const paths = pathsGroup
    .selectAll<SVGPathElement, CachedLabeledContour>("path.heightmap-contour-line")
    .data(visibleContours, contour => contour.id);
  paths.exit().remove();

  const updatedPaths = paths.enter().append("path").merge(paths);
  updatedPaths
    .attr("class", contour => `heightmap-contour-line heightmap-contour-${contour.contourType}`)
    .attr("d", contour => contour.path)
    .attr("fill", "none")
    .attr("stroke", "#000")
    .attr("stroke-width", contour => getContourStyle(contour.contourType).width)
    .attr("stroke-opacity", contour => getContourStyle(contour.contourType).opacity)
    .attr("stroke-dasharray", contour => getContourStyle(contour.contourType).dasharray)
    .attr("vector-effect", "non-scaling-stroke");
}

function isContourInViewport(contour: CachedLabeledContour, viewContext: Readonly<ViewState>): boolean {
  const margin = 64 / viewContext.scale;
  const minX = (-viewContext.viewX - margin) / viewContext.scale;
  const maxX = (viewContext.svgWidth - viewContext.viewX + margin) / viewContext.scale;
  const minY = (-viewContext.viewY - margin) / viewContext.scale;
  const maxY = (viewContext.svgHeight - viewContext.viewY + margin) / viewContext.scale;
  const { bounds } = contour;
  return bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY;
}

function getContourBounds(points: Point[]): CachedLabeledContour["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function renderVisibleLabels(activeGroup: ActiveLabeledContours["land"], viewContext: Readonly<ViewState>): void {
  if (!activeGroup) return;

  const { group, labelIndex } = activeGroup;
  group.selectAll("g.heightmap-contour-labels").remove();

  const scale = viewContext.scale;
  const detailLevel = getLabeledContourDetailLevel(scale);
  const candidates = getViewportLabelCandidates(labelIndex, viewContext)
    .filter(candidate => getLabelMinimumDetail(candidate.contourType) <= detailLevel)
    .filter(candidate => isCandidateInViewport(candidate, viewContext))
    .sort((a, b) => getLabelPriority(a.contourType) - getLabelPriority(b.contourType));
  const visibleLabels = removeOverlappingLabels(candidates, viewContext);
  if (!visibleLabels.length) return;

  const labelGroup = group
    .append("g")
    .attr("class", "heightmap-contour-labels")
    .attr("fill", "#000")
    .attr("font-size", 8 / scale)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central");

  labelGroup
    .selectAll("text")
    .data(visibleLabels)
    .enter()
    .append("text")
    .attr("x", label => label.x)
    .attr("y", label => label.y)
    .text(label => formatElevationInMeters(label.elevation));
}

function getLabelMinimumDetail(contourType: ContourType): 0 | 1 | 2 {
  if (contourType === "index" || contourType === "primary") return 0;
  if (contourType === "firstSupplementary") return 1;
  return 2;
}

function getLabelPriority(contourType: ContourType): number {
  if (contourType === "index") return 0;
  if (contourType === "primary") return 1;
  if (contourType === "firstSupplementary") return 2;
  return 3;
}

function isCandidateInViewport(candidate: ContourLabelCandidate, viewContext: Readonly<ViewState>): boolean {
  const screenX = candidate.x * viewContext.scale + viewContext.viewX;
  const screenY = candidate.y * viewContext.scale + viewContext.viewY;
  const margin = 12;
  return (
    screenX >= margin &&
    screenX <= viewContext.svgWidth - margin &&
    screenY >= margin &&
    screenY <= viewContext.svgHeight - margin
  );
}

function getViewportLabelCandidates(
  labelIndex: LabelSpatialIndex,
  viewContext: Readonly<ViewState>
): ContourLabelCandidate[] {
  const margin = 12;
  const minX = (margin - viewContext.viewX) / viewContext.scale;
  const maxX = (viewContext.svgWidth - margin - viewContext.viewX) / viewContext.scale;
  const minY = (margin - viewContext.viewY) / viewContext.scale;
  const maxY = (viewContext.svgHeight - margin - viewContext.viewY) / viewContext.scale;
  const minColumn = Math.floor(minX / labelIndex.cellSize);
  const maxColumn = Math.floor(maxX / labelIndex.cellSize);
  const minRow = Math.floor(minY / labelIndex.cellSize);
  const maxRow = Math.floor(maxY / labelIndex.cellSize);
  const candidates: ContourLabelCandidate[] = [];

  for (let column = minColumn; column <= maxColumn; column++) {
    for (let row = minRow; row <= maxRow; row++) {
      const candidatesInCell = labelIndex.candidatesByCell.get(`${column}:${row}`);
      if (candidatesInCell) candidates.push(...candidatesInCell);
    }
  }

  return candidates;
}

function removeOverlappingLabels(
  candidates: ContourLabelCandidate[],
  viewContext: Readonly<ViewState>
): ContourLabelCandidate[] {
  const CELL_SIZE = 16;
  const occupiedCells = new Set<string>();
  const labels: ContourLabelCandidate[] = [];

  for (const candidate of candidates) {
    const text = formatElevationInMeters(candidate.elevation);
    const x = candidate.x * viewContext.scale + viewContext.viewX;
    const y = candidate.y * viewContext.scale + viewContext.viewY;
    const halfWidth = Math.max(10, (text.length * 4.5) / 2);
    const halfHeight = 6;
    const minColumn = Math.floor((x - halfWidth) / CELL_SIZE);
    const maxColumn = Math.floor((x + halfWidth) / CELL_SIZE);
    const minRow = Math.floor((y - halfHeight) / CELL_SIZE);
    const maxRow = Math.floor((y + halfHeight) / CELL_SIZE);
    const cells: string[] = [];

    for (let column = minColumn; column <= maxColumn; column++) {
      for (let row = minRow; row <= maxRow; row++) {
        const cell = `${column}:${row}`;
        if (occupiedCells.has(cell)) {
          cells.length = 0;
          break;
        }
        cells.push(cell);
      }
      if (!cells.length) break;
    }
    if (!cells.length) continue;

    cells.forEach(cell => {
      occupiedCells.add(cell);
    });
    labels.push(candidate);
  }

  return labels;
}

function getContourStyle(contourType: ContourType): { width: number; opacity: number; dasharray: string | null } {
  switch (contourType) {
    case "index":
      return { width: 1.25, opacity: 1, dasharray: null };
    case "primary":
      return { width: 0.8, opacity: 0.95, dasharray: null };
    case "firstSupplementary":
      return { width: 0.55, opacity: 0.8, dasharray: "2 1" };
    case "secondSupplementary":
      return { width: 0.35, opacity: 0.65, dasharray: "1 1" };
  }
}

function setActiveLabeledContourGroup(
  group: SvgGroup,
  contours: CachedLabeledContour[]
): NonNullable<ActiveLabeledContours["land"]> {
  if (!activeLabeledContours) activeLabeledContours = { ocean: null, land: null };
  const activeGroup = { group, contours, labelIndex: buildLabelSpatialIndex(contours) };
  if (group.attr("id") === "oceanHeights") activeLabeledContours.ocean = activeGroup;
  else activeLabeledContours.land = activeGroup;
  return activeGroup;
}

function buildLabelSpatialIndex(contours: CachedLabeledContour[]): LabelSpatialIndex {
  const cellSize = 200;
  const candidatesByCell = new Map<string, ContourLabelCandidate[]>();

  for (const contour of contours) {
    for (const candidate of contour.labelCandidates) {
      const column = Math.floor(candidate.x / cellSize);
      const row = Math.floor(candidate.y / cellSize);
      const key = `${column}:${row}`;
      const candidates = candidatesByCell.get(key);
      if (candidates) candidates.push(candidate);
      else candidatesByCell.set(key, [candidate]);
    }
  }

  return { cellSize, candidatesByCell };
}

function setCachedLabeledContours(key: string, value: CachedLabeledContourGroup): void {
  labeledContourCache.set(key, value);
  while (labeledContourCache.size > 8) {
    const oldestKey = labeledContourCache.keys().next().value;
    if (oldestKey === undefined) return;
    labeledContourCache.delete(oldestKey);
  }
}

function setCachedInterpolatedContourGeometry(key: string, value: InterpolatedContourGeometry): void {
  interpolatedContourGeometryCache.set(key, value);
  while (interpolatedContourGeometryCache.size > 4) {
    const oldestKey = interpolatedContourGeometryCache.keys().next().value;
    if (oldestKey === undefined) return;
    interpolatedContourGeometryCache.delete(oldestKey);
  }
}

function formatElevationInMeters(elevation: number): string {
  const { heightExponent } = useOptionsState.getState();
  const meters =
    elevation >= HeightThreshold.WATER_MAX_HEIGHT
      ? (elevation - 18) ** heightExponent
      : ((elevation - HeightThreshold.WATER_MAX_HEIGHT) / elevation) * 50;
  return `${rn(meters)} m`;
}

export const HeightmapRenderer: IRenderer = {
  id: "heightmap",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & FocusFields & ViewState>,
    _appServices: AppServices
  ): void {
    TIME && console.time("HeightmapRenderer");
    const { grid, graphWidth, graphHeight } = worldContext;
    const { terrs } = viewContext;

    const ocean = terrs.select<SVGGElement>("#oceanHeights");
    const land = terrs.select<SVGGElement>("#landHeights");

    ocean.selectAll("*").remove();
    land.selectAll("*").remove();

    const heightmapRenderingMode = useOptionsState.getState().heightmapRenderingMode;
    if (heightmapRenderingMode === "contours" || heightmapRenderingMode === "labeledContours") {
      activeLabeledContours = heightmapRenderingMode === "labeledContours" ? { ocean: null, land: null } : null;
      renderContours(heightmapRenderingMode === "labeledContours", getLabeledContourDetailLevel(viewContext.scale));
      TIME && console.timeEnd("HeightmapRenderer");
      return;
    }

    activeLabeledContours = null;

    const paths: (string | undefined)[] = new Array(101);
    const { cells, vertices } = grid;
    const used = new Uint8Array(cells.i.length);
    const heights = Array.from(cells.i).sort((a, b) => (cells.h[a] as number) - (cells.h[b] as number));

    // ocean cells
    const renderOceanCells = Boolean(+ocean.attr("data-render"));
    if (renderOceanCells) {
      const skip = +ocean.attr("skip") + 1 || 1;
      const relax = +ocean.attr("relax") || 0;
      const curveType = ocean.attr("curve") || "curveBasisClosed";
      const lineGen = line().curve(CURVE_MAP[curveType] ?? curveBasisClosed);

      let currentLayer = 0;
      for (const i of heights) {
        const h = cells.h[i];
        if (h > currentLayer) currentLayer += skip;
        if (h < currentLayer) continue;
        if (currentLayer >= HeightThreshold.WATER_MAX_HEIGHT) break;
        if (used[i]) continue; // already marked
        const onborder = cells.c[i].some((n: number) => cells.h[n] < h);
        if (!onborder) continue;
        const vertex = cells.v[i].find((v: number) => vertices.c[v].some((i: number) => (cells.h[i] as number) < h));
        const chain = connectVertices(cells, vertices, vertex!, h, used);
        if (chain.length < 3) continue;
        const points = simplifyLine(chain, relax).map((v: number) => vertices.p[v]);
        if (!paths[h]) paths[h] = "";
        paths[h] += round(lineGen(points) || "");
      }
    }

    // land cells
    {
      const skip = +land.attr("skip") + 1 || 1;
      const relax = +land.attr("relax") || 0;
      const curveType = land.attr("curve") || "curveBasisClosed";
      const lineGen = line().curve(CURVE_MAP[curveType] ?? curveBasisClosed);

      let currentLayer = HeightThreshold.WATER_MAX_HEIGHT;
      for (const i of heights) {
        const h = cells.h[i];
        if (h > currentLayer) currentLayer += skip;
        if (h < currentLayer) continue;
        if (currentLayer > HeightThreshold.HEIGHT_MAX) break; // no layers possible with height > 100
        if (used[i]) continue; // already marked
        const onborder = cells.c[i].some((n: number) => cells.h[n] < h);
        if (!onborder) continue;

        const startVertex = cells.v[i].find((v: number) =>
          vertices.c[v].some((i: number) => (cells.h[i] as number) < h)
        );
        const chain = connectVertices(cells, vertices, startVertex!, h, used);
        if (chain.length < 3) continue;

        const points = simplifyLine(chain, relax).map((v: number) => vertices.p[v]);
        if (!paths[h]) paths[h] = "";
        paths[h] += round(lineGen(points) || "");
      }
    }

    // render paths to canvas inside foreignObject
    // SVG masks (mask:url(#land) on #landHeights), filters, and opacity on the
    // parent <g> elements are automatically applied to the canvas by the browser.
    const oceanCtx = createLayerCanvas(ocean.node()!, graphWidth, graphHeight);
    const landCtx = createLayerCanvas(land.node()!, graphWidth, graphHeight);

    for (const height of range(HeightThreshold.HEIGHT_MIN, HeightThreshold.HEIGHT_MAX + 1)) {
      const isOcean = height < HeightThreshold.WATER_MAX_HEIGHT;
      const group = isOcean ? ocean : land;
      const ctx = isOcean ? oceanCtx : landCtx;
      const scheme = getColorScheme(group.attr("scheme"));
      const terracing = +group.attr("terracing") / 10 || 0;

      if (height === HeightThreshold.HEIGHT_MIN && renderOceanCells) {
        ctx.fillStyle = scheme(1);
        ctx.fillRect(0, 0, graphWidth, graphHeight);
      }

      if (height === HeightThreshold.WATER_MAX_HEIGHT) {
        ctx.fillStyle = scheme(0.8);
        ctx.fillRect(0, 0, graphWidth, graphHeight);
      }

      if (!paths[height] || paths[height]!.length < 10) continue;
      const fillColor = getColor(height, scheme);
      const path2d = new Path2D(paths[height]!);

      if (terracing) {
        ctx.save();
        ctx.translate(0.7, 1.4);
        ctx.fillStyle = color(fillColor)!.darker(terracing).toString();
        ctx.fill(path2d, "evenodd");
        ctx.restore();
      }
      ctx.fillStyle = fillColor;
      ctx.fill(path2d, "evenodd");
    }

    // connect vertices to chain: specific case for heightmap
    function connectVertices(
      cells: GridCells,
      vertices: Vertices,
      start: number,
      h: number,
      used: Uint8Array
    ): number[] {
      const MAX_ITERATIONS = vertices.c.length;

      const n = cells.i.length;
      const chain: number[] = []; // vertices chain to form a path
      for (let i = 0, current = start; i === 0 || (current !== start && i < MAX_ITERATIONS); i++) {
        const prev = chain[chain.length - 1]; // previous vertex in chain
        chain.push(current); // add current vertex to sequence
        const c = vertices.c[current]; // cells adjacent to vertex
        c.filter((c: number) => cells.h[c] === h).forEach((c: number) => {
          used[c] = 1;
        });
        const c0 = c[0] >= n || cells.h[c[0]] < h;
        const c1 = c[1] >= n || cells.h[c[1]] < h;
        const c2 = c[2] >= n || cells.h[c[2]] < h;
        const v = vertices.v[current]; // neighboring vertices
        if (v[0] !== prev && c0 !== c1) current = v[0];
        else if (v[1] !== prev && c1 !== c2) current = v[1];
        else if (v[2] !== prev && c0 !== c2) current = v[2];
        if (current === chain[chain.length - 1]) {
          ERROR && console.error("Next vertex is not found");
          break;
        }
      }
      return chain;
    }

    function simplifyLine(chain: number[], simplification: number): number[] {
      if (!simplification) return chain;
      const n = simplification + 1; // filter each nth element
      return chain.filter((_d, i) => i % n === 0);
    }

    TIME && console.timeEnd("HeightmapRenderer");

    /**
     * SVG counterpart to the temperature layer's isoline renderer. Unlike the
     * canvas heatmap path above, each elevation band is a real SVG path, so
     * contour edges remain sharp at any zoom level.
     */
    function renderContours(withElevationLabels: boolean, detailLevel: 0 | 1 | 2): void {
      const { cells, vertices } = grid;
      const n = cells.i.length;
      const interpolatedGeometryKey = withElevationLabels ? getInterpolatedGeometryCacheKey() : "";
      const interpolatedGeometry = withElevationLabels
        ? getOrCreateInterpolatedContourGeometry(interpolatedGeometryKey)
        : null;

      renderElevationRange({
        group: ocean,
        minHeight: HeightThreshold.HEIGHT_MIN,
        maxHeight: HeightThreshold.WATER_MAX_HEIGHT,
        renderBase: Boolean(+ocean.attr("data-render"))
      });
      renderElevationRange({
        group: land,
        minHeight: HeightThreshold.WATER_MAX_HEIGHT,
        maxHeight: HeightThreshold.HEIGHT_MAX,
        renderBase: true
      });
      if (withElevationLabels) refreshLabeledContourLabels(viewContext);

      function renderElevationRange({
        group,
        minHeight,
        maxHeight,
        renderBase
      }: {
        group: typeof ocean;
        minHeight: number;
        maxHeight: number;
        renderBase: boolean;
      }): void {
        if (!renderBase) return;

        const scheme = getColorScheme(group.attr("scheme"));
        const primaryInterval = Math.max(Number(group.attr("skip")) + 1 || 1, 1);
        const firstSupplementaryInterval = Math.max(1, Math.round(primaryInterval / 2));
        const step = getContourInterval(primaryInterval, detailLevel);
        const relaxInterval = Math.max(Number(group.attr("relax")) + 1 || 1, 1);

        if (!withElevationLabels) {
          group
            .append("path")
            .attr("class", "heightmap-contour-base")
            .attr("d", `M0,0 h${graphWidth} v${graphHeight} h${-graphWidth} Z`)
            .attr("fill", getColor(minHeight, scheme))
            .attr("stroke", "none");
        }

        const cacheKey = withElevationLabels
          ? getLabeledContourCacheKey({
              group,
              minHeight,
              maxHeight,
              primaryInterval,
              relaxInterval,
              detailLevel,
              interpolatedGeometryKey
            })
          : "";
        const cachedContours = withElevationLabels ? labeledContourCache.get(cacheKey)?.contours : undefined;
        const contours = cachedContours ?? [];

        if (!cachedContours && interpolatedGeometry) {
          const curveName = group.attr("curve") ?? "curveBasisClosed";
          for (const elevation of range(minHeight + step, maxHeight, step)) {
            const contourType = getContourType(elevation, minHeight, primaryInterval, firstSupplementaryInterval);
            for (const [chainIndex, { points, closed }] of getInterpolatedContourChains(
              elevation,
              interpolatedGeometry
            ).entries()) {
              const renderedPoints = simplifyInterpolatedContour(points, closed, relaxInterval);
              if (renderedPoints.length < (closed ? 3 : 2)) continue;

              const curve = closed
                ? (CURVE_MAP[curveName] ?? curveBasisClosed)
                : (getOpenCurve(curveName) ?? curveBasis);
              const path = line<Point>().curve(curve)(renderedPoints);
              if (!path) continue;

              contours.push({
                id: `${elevation}:${chainIndex}`,
                elevation,
                contourType,
                path: round(path),
                bounds: getContourBounds(renderedPoints),
                labelCandidates: getLabelCandidates(renderedPoints, elevation, contourType)
              });
            }
          }
          setCachedLabeledContours(cacheKey, { contours });
        }

        if (!withElevationLabels) {
          for (const elevation of range(minHeight + step, maxHeight, step)) {
            const checkedCells = new Uint8Array(n);
            const paths: string[] = [];

            for (const cellId of cells.i) {
              if (
                checkedCells[cellId] ||
                cells.h[cellId] < elevation ||
                !isGridCellInScope(viewContext.focusScope, cellId)
              ) {
                continue;
              }

              const startingVertex = findStart(cellId, elevation);
              if (startingVertex === undefined) continue;

              const chain = connectContourVertices(startingVertex, elevation, checkedCells);
              const points = chain
                .filter((vertex, index) => index % relaxInterval === 0 || vertices.c[vertex].some(cell => cell >= n))
                .map(vertex => vertices.p[vertex]);
              if (points.length < 3) continue;

              const path = line().curve(CURVE_MAP[group.attr("curve") ?? ""] ?? curveBasisClosed)(points);
              if (path) paths.push(round(path));
            }

            if (!paths.length) continue;
            const path = paths.join("");
            const fill = getColor(elevation, scheme);
            const stroke = color(fill)?.darker(0.2).toString() ?? fill;
            group.append("path").attr("d", path).attr("fill", fill).attr("stroke", stroke);
          }
        }

        if (!withElevationLabels) return;
        const activeGroup = setActiveLabeledContourGroup(group, contours);
        renderLabeledContourPaths(activeGroup, viewContext);
      }

      function findStart(cellId: number, elevation: number): number | undefined {
        if (cells.b[cellId]) return cells.v[cellId].find(vertex => vertices.c[vertex].some(cell => cell >= n));
        return cells.v[cellId].find(vertex => vertices.c[vertex].some(cell => cell >= n || cells.h[cell] < elevation));
      }

      function getContourInterval(primaryInterval: number, zoomDetail: 0 | 1 | 2): number {
        if (zoomDetail === 2) return 1; // second supplementary contours
        if (zoomDetail === 1) return Math.max(1, Math.round(primaryInterval / 3));
        return Math.max(1, Math.round(primaryInterval / 2)); // first supplementary contours
      }

      function getContourType(
        elevation: number,
        minimumElevation: number,
        primaryInterval: number,
        firstSupplementaryInterval: number
      ): "index" | "primary" | "firstSupplementary" | "secondSupplementary" {
        const offset = elevation - minimumElevation;
        if (offset % (primaryInterval * 5) === 0) return "index";
        if (offset % primaryInterval === 0) return "primary";
        if (offset % firstSupplementaryInterval === 0) return "firstSupplementary";
        return "secondSupplementary";
      }

      /**
       * Builds an isocontour over Delaunay triangles whose vertices are the Voronoi cell centers.
       * The half-unit shift puts an integer contour between its discrete height band and the one below it.
       */
      function getOrCreateInterpolatedContourGeometry(cacheKey: string): InterpolatedContourGeometry {
        const cachedGeometry = interpolatedContourGeometryCache.get(cacheKey);
        if (cachedGeometry) return cachedGeometry;

        const trianglesByElevation = new Map<number, number[][]>();
        const isInScope = (cellId: number) => isGridCellInScope(viewContext.focusScope, cellId);
        for (const triangleCells of vertices.c) {
          if (triangleCells.length !== 3 || triangleCells.some(cell => cell >= n || !isInScope(cell))) continue;

          const [firstCell, secondCell, thirdCell] = triangleCells;
          const minimumHeight = Math.min(cells.h[firstCell], cells.h[secondCell], cells.h[thirdCell]);
          const maximumHeight = Math.max(cells.h[firstCell], cells.h[secondCell], cells.h[thirdCell]);
          const firstElevation = Math.max(minimumHeight + 1, HeightThreshold.HEIGHT_MIN + 1);
          const lastElevation = Math.min(maximumHeight, HeightThreshold.HEIGHT_MAX - 1);

          for (let elevation = firstElevation; elevation <= lastElevation; elevation++) {
            const bucket = trianglesByElevation.get(elevation);
            if (bucket) bucket.push(triangleCells);
            else trianglesByElevation.set(elevation, [triangleCells]);
          }
        }

        const geometry = { trianglesByElevation, chainsByElevation: new Map<number, InterpolatedContourChain[]>() };
        setCachedInterpolatedContourGeometry(cacheKey, geometry);
        return geometry;
      }

      function getInterpolatedContourChains(
        elevation: number,
        geometry: InterpolatedContourGeometry
      ): InterpolatedContourChain[] {
        const cachedChains = geometry.chainsByElevation.get(elevation);
        if (cachedChains) return cachedChains;

        const intersections = new Map<string, Point>();
        const adjacentSegments = new Map<string, number[]>();
        const segments: [string, string][] = [];

        for (const triangleCells of geometry.trianglesByElevation.get(elevation) ?? []) {
          const crossings = getTriangleCrossings(triangleCells, elevation);
          if (crossings.length !== 2) continue;

          const [start, end] = crossings;
          const segmentId = segments.push([start, end]) - 1;
          addSegment(start, segmentId);
          addSegment(end, segmentId);
        }

        const usedSegments = new Uint8Array(segments.length);
        const chains: InterpolatedContourChain[] = [];
        for (const [edge, segmentIds] of adjacentSegments) {
          if (segmentIds.length === 1) {
            const chain = traceChain(edge);
            if (chain) chains.push(chain);
          }
        }
        for (let segmentId = 0; segmentId < segments.length; segmentId++) {
          if (usedSegments[segmentId]) continue;
          const chain = traceChain(segments[segmentId][0]);
          if (chain) chains.push(chain);
        }

        geometry.chainsByElevation.set(elevation, chains);
        return chains;

        function getTriangleCrossings(triangleCells: number[], level: number): string[] {
          const crossings: string[] = [];
          addCrossing(triangleCells[0], triangleCells[1]);
          addCrossing(triangleCells[1], triangleCells[2]);
          addCrossing(triangleCells[2], triangleCells[0]);
          return crossings;

          function addCrossing(firstCell: number, secondCell: number): void {
            const firstHeight = cells.h[firstCell];
            const secondHeight = cells.h[secondCell];
            const firstIsHigh = firstHeight >= level;
            if (firstIsHigh === secondHeight >= level) return;

            const edge = getEdgeKey(firstCell, secondCell);
            if (!intersections.has(edge)) {
              const [firstX, firstY] = grid.points[firstCell];
              const [secondX, secondY] = grid.points[secondCell];
              const ratio = (level - 0.5 - firstHeight) / (secondHeight - firstHeight);
              intersections.set(edge, [firstX + (secondX - firstX) * ratio, firstY + (secondY - firstY) * ratio]);
            }
            crossings.push(edge);
          }
        }

        function addSegment(edge: string, segmentId: number): void {
          const segmentIds = adjacentSegments.get(edge);
          if (segmentIds) segmentIds.push(segmentId);
          else adjacentSegments.set(edge, [segmentId]);
        }

        function traceChain(startEdge: string): InterpolatedContourChain | null {
          const points: Point[] = [];
          let currentEdge = startEdge;
          let closed = false;

          for (let index = 0; index <= segments.length; index++) {
            const point = intersections.get(currentEdge);
            if (!point) return null;
            points.push(point);

            const segmentId = adjacentSegments.get(currentEdge)?.find(id => !usedSegments[id]);
            if (segmentId === undefined) break;
            usedSegments[segmentId] = 1;

            const [firstEdge, secondEdge] = segments[segmentId];
            currentEdge = currentEdge === firstEdge ? secondEdge : firstEdge;
            if (currentEdge === startEdge) {
              closed = true;
              break;
            }
          }

          return points.length > 1 ? { points, closed } : null;
        }
      }

      function getOpenCurve(curveName: string): CurveFactory | undefined {
        const openCurveNames: Record<string, keyof typeof CURVE_MAP> = {
          curveBasisClosed: "curveBasis",
          curveCardinalClosed: "curveCardinal",
          curveCatmullRomClosed: "curveCatmullRom"
        };
        return CURVE_MAP[openCurveNames[curveName] ?? curveName];
      }

      function simplifyInterpolatedContour(points: Point[], closed: boolean, interval: number): Point[] {
        if (interval <= 1) return points;

        const simplified = points.filter((_point, index) => index % interval === 0);
        const lastPoint = points.at(-1);
        if (!closed && lastPoint && simplified.at(-1) !== lastPoint) simplified.push(lastPoint);
        return closed && simplified.length < 3 ? points : simplified;
      }

      function getEdgeKey(firstCell: number, secondCell: number): string {
        return firstCell < secondCell ? `${firstCell}:${secondCell}` : `${secondCell}:${firstCell}`;
      }

      function connectContourVertices(start: number, elevation: number, checkedCells: Uint8Array): number[] {
        const MAX_ITERATIONS = vertices.c.length;
        const chain: number[] = [];

        for (let index = 0, current = start; index === 0 || (current !== start && index < MAX_ITERATIONS); index++) {
          const previous = chain.at(-1);
          chain.push(current);

          const adjacentCells = vertices.c[current];
          adjacentCells.forEach(cell => {
            if (cell < n && cells.h[cell] >= elevation) checkedCells[cell] = 1;
          });

          const [first, second, third] = adjacentCells.map(cell => cell < n && cells.h[cell] >= elevation);
          const [firstVertex, secondVertex, thirdVertex] = vertices.v[current];
          if (firstVertex !== previous && first !== second) current = firstVertex;
          else if (secondVertex !== previous && second !== third) current = secondVertex;
          else if (thirdVertex !== previous && first !== third) current = thirdVertex;
          else break;
        }

        return chain;
      }

      function getLabelCandidates(
        points: [number, number][],
        elevation: number,
        contourType: ContourType
      ): ContourLabelCandidate[] {
        const candidates: ContourLabelCandidate[] = [];
        const xCenter = graphWidth / 2;
        const topCenterIndex = leastIndex(
          points,
          (a: [number, number], b: [number, number]) =>
            a[1] - b[1] + (Math.abs(a[0] - xCenter) - Math.abs(b[0] - xCenter)) / 2
        );
        const topCenter = points[topCenterIndex!];
        candidates.push({ x: topCenter[0], y: topCenter[1], elevation, contourType });

        if (points.length <= 20) return candidates;
        const bottomCenterIndex = leastIndex(
          points,
          (a: [number, number], b: [number, number]) =>
            b[1] - a[1] + (Math.abs(a[0] - xCenter) - Math.abs(b[0] - xCenter)) / 2
        );
        const bottomCenter = points[bottomCenterIndex!];
        const distanceSquared = (topCenter[1] - bottomCenter[1]) ** 2 + (topCenter[0] - bottomCenter[0]) ** 2;
        if (distanceSquared > 100) candidates.push({ x: bottomCenter[0], y: bottomCenter[1], elevation, contourType });
        return candidates;
      }

      function getLabeledContourCacheKey({
        group,
        minHeight,
        maxHeight,
        primaryInterval,
        relaxInterval,
        detailLevel,
        interpolatedGeometryKey
      }: {
        group: SvgGroup;
        minHeight: number;
        maxHeight: number;
        primaryInterval: number;
        relaxInterval: number;
        detailLevel: 0 | 1 | 2;
        interpolatedGeometryKey: string;
      }): string {
        return [
          interpolatedGeometryKey,
          group.attr("id"),
          minHeight,
          maxHeight,
          primaryInterval,
          relaxInterval,
          group.attr("curve"),
          detailLevel
        ].join("|");
      }

      function getInterpolatedGeometryCacheKey(): string {
        const mapId = worldContext.mapId;
        if (cachedMapId !== mapId) {
          labeledContourCache.clear();
          interpolatedContourGeometryCache.clear();
          cachedMapId = mapId;
        }

        let heightHash = 2166136261;
        for (const cellId of cells.i) {
          heightHash ^= cells.h[cellId];
          heightHash = Math.imul(heightHash, 16777619);
        }

        const focusSignature = viewContext.focusScope
          ? `${viewContext.focusScope.kind}:${viewContext.focusScope.id}:${viewContext.focusScope.gridCellIds.size}`
          : "all";
        return [mapId, heightHash >>> 0, graphWidth, graphHeight, "interpolated-centers-v2", focusSignature].join("|");
      }
    }
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    activeLabeledContours = null;
    const { terrs } = viewContext;
    terrs.select<SVGGElement>("#oceanHeights").selectAll("*").remove();
    terrs.select<SVGGElement>("#landHeights").selectAll("*").remove();
  }
};
