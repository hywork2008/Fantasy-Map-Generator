import type { Selection } from "d3";
import { curveBasisClosed, line } from "d3";
import Delaunator from "delaunator";
import { clipPoly, P, rn, round } from "@fmg/shared";
import { OceanRenderer, type OceanMeshData } from "@fmg/ocean";
import type { Grid } from "@fmg/types";

type OceanLayerPolygon = {layer: number; points: [number, number][]};

type OceanGeometry = {
  limits: number[];
  polygons: OceanLayerPolygon[];
  opacity: number;
};

class OceanLayersGeometryBuilder {
  private cells: Grid["cells"];
  private vertices: Grid["vertices"];
  private pointsN = 0;
  private used = new Uint8Array();

  randomizeOutline() {
    const limits: number[] = [];
    let odd = 0.2;
    for (let l = -9; l < 0; l++) {
      if (P(odd)) {
        odd = 0.2;
        limits.push(l);
      } else {
        odd *= 2;
      }
    }
    return limits;
  }

  connectVertices(start: number, t: number) {
    const chain: number[] = [];
    for (let i = 0, current = start; i === 0 || (current !== start && i < 10000); i++) {
      const prev = chain[chain.length - 1];
      chain.push(current);
      const c = this.vertices.c[current];
      c.filter((cellIndex: number) => this.cells.t[cellIndex] === t).forEach((cellIndex: number) => {
        this.used[cellIndex] = 1;
      });

      const v = this.vertices.v[current];
      const c0 = !this.cells.t[c[0]] || this.cells.t[c[0]] === t - 1;
      const c1 = !this.cells.t[c[1]] || this.cells.t[c[1]] === t - 1;
      const c2 = !this.cells.t[c[2]] || this.cells.t[c[2]] === t - 1;

      if (v[0] !== undefined && v[0] !== prev && c0 !== c1) current = v[0];
      else if (v[1] !== undefined && v[1] !== prev && c1 !== c2) current = v[1];
      else if (v[2] !== undefined && v[2] !== prev && c0 !== c2) current = v[2];

      if (current === chain[chain.length - 1]) {
        ERROR && console.error("Next vertex is not found");
        break;
      }
    }

    chain.push(chain[0]);
    return chain;
  }

  findStart(i: number, t: number) {
    if (this.cells.b[i]) {
      return this.cells.v[i].find((v: number) => this.vertices.c[v].some((c: number) => c >= this.pointsN));
    }
    return this.cells.v[i][this.cells.c[i].findIndex((c: number) => this.cells.t[c] < t || !this.cells.t[c])];
  }

  build(outline: string): OceanGeometry {
    this.cells = grid.cells;
    this.vertices = grid.vertices;
    this.pointsN = grid.cells.i.length;

    const limits = outline === "random" ? this.randomizeOutline() : outline.split(",").map((s: string) => +s);
    const opacity = rn(0.4 / Math.max(1, limits.length), 2);

    this.used = new Uint8Array(this.pointsN);

    const polygons: OceanLayerPolygon[] = [];

    for (const i of this.cells.i) {
      const t = this.cells.t[i];
      if (t > 0) continue;
      if (this.used[i] || !limits.includes(t)) continue;

      const start = this.findStart(i, t);
      if (start === undefined) continue;

      this.used[i] = 1;
      const chain = this.connectVertices(start, t);
      if (chain.length < 4) continue;

      const relax = 1 + t * -2;
      const relaxed = chain.filter((v, index) => !(index % relax) || this.vertices.c[v].some((c: number) => c >= this.pointsN));
      if (relaxed.length < 4) continue;

      const points = clipPoly(
        relaxed.map(v => this.vertices.p[v]),
        graphWidth,
        graphHeight
      ) as [number, number][];

      if (points.length < 3) continue;
      polygons.push({layer: t, points});
    }

    return {limits, polygons, opacity};
  }
}

class OceanLayersSvgFallbackRenderer {
  private readonly lineGen = line().curve(curveBasisClosed);

  render(oceanLayersSelection: Selection<SVGGElement, unknown, null, undefined>, geometry: OceanGeometry): void {
    oceanLayersSelection.selectAll("path").remove();

    for (const t of geometry.limits) {
      const layer = geometry.polygons.filter(polygon => polygon.layer === t);
      const path = layer.map(polygon => round(this.lineGen(polygon.points) || "")).join("");

      if (path) {
        oceanLayersSelection
          .append("path")
          .attr("d", path)
          .attr("fill", "#ecf2f9")
          .attr("fill-opacity", geometry.opacity);
      }
    }
  }
}

type OceanLayersSvgRenderOptions = {
  removeWebglHost?: boolean;
};

class OceanLayersWebGlRenderer {
  private renderer: OceanRenderer | null = null;
  private rendererCanvas: HTMLCanvasElement | null = null;
  private available = true;

  render(oceanLayersSelection: Selection<SVGGElement, unknown, null, undefined>, mesh: OceanMeshData, opacity: number): boolean {
    if (!this.available) return false;

    const host = this.ensureHost(oceanLayersSelection);
    if (!host) {
      this.available = false;
      return false;
    }

    const {canvas, width, height} = host;

    // The map load flow replaces the whole SVG tree. Recreate WebGL renderer
    // when host canvas changes to avoid rendering into a detached canvas.
    if (this.renderer && this.rendererCanvas !== canvas) {
      this.renderer.dispose();
      this.renderer = null;
      this.rendererCanvas = null;
    }

    if (!this.renderer) {
      this.renderer = new OceanRenderer({canvas, antialias: true, alpha: true});
      if (!this.renderer.supported) {
        this.available = false;
        this.renderer = null;
        this.rendererCanvas = null;
        return false;
      }
      this.rendererCanvas = canvas;
    }

    this.renderer.resize(width, height);
    this.renderer.setMapSize(mesh.mapWidth, mesh.mapHeight);
    this.renderer.setProjectionViewMatrices(OceanRenderer.createOrthographicProjection(mesh.mapWidth, mesh.mapHeight));
    this.renderer.setStyle({opacity});
    this.renderer.setMeshData(mesh);
    this.renderer.render(performance.now() / 1000);

    oceanLayersSelection.selectAll("path").remove();
    return true;
  }

  clear(oceanLayersSelection: Selection<SVGGElement, unknown, null, undefined>): void {
    oceanLayersSelection.selectAll("path").remove();
    oceanLayersSelection.select("#oceanLayersWebglHost").remove();
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
    this.rendererCanvas = null;
  }

  private ensureHost(oceanLayersSelection: Selection<SVGGElement, unknown, null, undefined>) {
    let host = oceanLayersSelection.select<SVGForeignObjectElement>("#oceanLayersWebglHost");
    if (host.empty()) {
      host = oceanLayersSelection
        .append("foreignObject")
        .attr("id", "oceanLayersWebglHost")
        .style("pointer-events", "none");
    }

    host.attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);

    let canvasSelection = host.select("canvas#oceanLayersWebglCanvas");
    if (canvasSelection.empty()) {
      canvasSelection = host
        .append("xhtml:canvas")
        .attr("id", "oceanLayersWebglCanvas")
        .style("display", "block")
        .style("width", "100%")
        .style("height", "100%")
        .style("pointer-events", "none");
    }

    const canvas = canvasSelection.node() as HTMLCanvasElement | null;
    if (!canvas) return null;

    return {canvas, width: graphWidth, height: graphHeight};
  }
}

const geometryBuilder = new OceanLayersGeometryBuilder();
const svgFallbackRenderer = new OceanLayersSvgFallbackRenderer();
const webglRenderer = new OceanLayersWebGlRenderer();

const almostEqual = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const triangleAreaAbs = (a: [number, number], b: [number, number], c: [number, number]) => {
  return Math.abs(cross(a[0], a[1], b[0], b[1], c[0], c[1])) * 0.5;
};

const sanitizePolygonPoints = (points: [number, number][]) => {
  if (points.length < 3) return points;

  const prepared: [number, number][] = [];
  for (const point of points) {
    const prev = prepared[prepared.length - 1];
    if (!prev || !almostEqual(prev[0], point[0]) || !almostEqual(prev[1], point[1])) {
      prepared.push(point);
    }
  }

  if (prepared.length > 2) {
    const first = prepared[0];
    const last = prepared[prepared.length - 1];
    if (almostEqual(first[0], last[0]) && almostEqual(first[1], last[1])) prepared.pop();
  }

  if (prepared.length < 3) return prepared;

  const reduced: [number, number][] = [];
  for (let i = 0; i < prepared.length; i++) {
    const prev = prepared[(i - 1 + prepared.length) % prepared.length];
    const curr = prepared[i];
    const next = prepared[(i + 1) % prepared.length];
    if (triangleAreaAbs(prev, curr, next) > 1e-6) reduced.push(curr);
  }

  return reduced.length >= 3 ? reduced : prepared;
};

const smoothClosedPolygon = (points: [number, number][], iterations = 1) => {
  let current = points;
  for (let i = 0; i < iterations; i++) {
    if (current.length < 3) break;

    const next: [number, number][] = [];
    for (let j = 0; j < current.length; j++) {
      const p0 = current[j];
      const p1 = current[(j + 1) % current.length];

      next.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
      next.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
    }

    current = next;
  }

  return current;
};

const signedArea = (points: [number, number][]) => {
  let area = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
};

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
};

const pointInTriangle = (
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number]
) => {
  const c1 = cross(a[0], a[1], b[0], b[1], p[0], p[1]);
  const c2 = cross(b[0], b[1], c[0], c[1], p[0], p[1]);
  const c3 = cross(c[0], c[1], a[0], a[1], p[0], p[1]);
  const hasNeg = c1 < -1e-9 || c2 < -1e-9 || c3 < -1e-9;
  const hasPos = c1 > 1e-9 || c2 > 1e-9 || c3 > 1e-9;
  return !(hasNeg && hasPos);
};

const pointInPolygon = (point: [number, number], polygon: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const triangulateWithDelaunay = (points: [number, number][]) => {
  if (points.length < 3) return [] as [number, number, number][];

  const delaunay = Delaunator.from(points);
  const triangles: [number, number, number][] = [];

  for (let i = 0; i < delaunay.triangles.length; i += 3) {
    const a = delaunay.triangles[i];
    const b = delaunay.triangles[i + 1];
    const c = delaunay.triangles[i + 2];

    const p0 = points[a];
    const p1 = points[b];
    const p2 = points[c];
    if (triangleAreaAbs(p0, p1, p2) <= 1e-6) continue;

    const centroid: [number, number] = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3];
    if (pointInPolygon(centroid, points)) triangles.push([a, b, c]);
  }

  return triangles;
};

const triangulatePolygon = (rawPoints: [number, number][]) => {
  const normalized = sanitizePolygonPoints(rawPoints);
  const points = normalized.length >= 6 ? smoothClosedPolygon(normalized, 1) : normalized;
  const n = points.length;
  if (n < 3) return null;

  const ccw = signedArea(points) > 0;
  const indices = Array.from({length: n}, (_, i) => i);
  if (!ccw) indices.reverse();

  const triangles: [number, number, number][] = [];
  let guard = 0;

  while (indices.length > 3 && guard < n * n) {
    guard += 1;
    let earFound = false;

    for (let i = 0; i < indices.length; i++) {
      const prev = indices[(i - 1 + indices.length) % indices.length];
      const curr = indices[i];
      const next = indices[(i + 1) % indices.length];

      const a = points[prev];
      const b = points[curr];
      const c = points[next];

      if (cross(a[0], a[1], b[0], b[1], c[0], c[1]) <= 1e-9) continue;

      let containsVertex = false;
      for (let j = 0; j < indices.length; j++) {
        const pIndex = indices[j];
        if (pIndex === prev || pIndex === curr || pIndex === next) continue;
        if (pointInTriangle(points[pIndex], a, b, c)) {
          containsVertex = true;
          break;
        }
      }

      if (containsVertex) continue;

      triangles.push([prev, curr, next]);
      indices.splice(i, 1);
      earFound = true;
      break;
    }

    if (!earFound) return null;
  }

  if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);
  if (triangles.length) return {points, triangles};

  const fallbackTriangles = triangulateWithDelaunay(points);
  if (!fallbackTriangles.length) return null;
  return {points, triangles: fallbackTriangles};
};

const buildTriangleMesh = (polygons: OceanLayerPolygon[]): OceanMeshData | null => {
  const prepared = polygons
    .map(polygon => ({layer: polygon.layer, triangulated: triangulatePolygon(polygon.points)}))
    .filter(entry => !!entry.triangulated) as {layer: number; triangulated: {points: [number, number][]; triangles: [number, number, number][]}}[];

  if (!prepared.length) return null;

  let vertexCount = 0;
  for (const entry of prepared) {
    const triangleCount = entry.triangulated?.triangles.length || 0;
    vertexCount += triangleCount * 3;
  }

  if (!vertexCount) return null;

  const positions = new Float32Array(vertexCount * 2);
  const layerDepths = new Float32Array(vertexCount);

  let positionOffset = 0;
  let depthOffset = 0;

  for (const entry of prepared) {
    const triangulated = entry.triangulated;
    if (!triangulated) continue;

    const {points, triangles} = triangulated;
    for (const [a, b, c] of triangles) {
      const p0 = points[a];
      const p1 = points[b];
      const p2 = points[c];

      positions[positionOffset++] = p0[0];
      positions[positionOffset++] = p0[1];
      positions[positionOffset++] = p1[0];
      positions[positionOffset++] = p1[1];
      positions[positionOffset++] = p2[0];
      positions[positionOffset++] = p2[1];

      layerDepths[depthOffset++] = entry.layer;
      layerDepths[depthOffset++] = entry.layer;
      layerDepths[depthOffset++] = entry.layer;
    }
  }

  return {
    positions,
    layerDepths,
    vertexCount,
    mapWidth: graphWidth,
    mapHeight: graphHeight
  };
};

export const drawOceanLayers = () => {
  const outline = oceanLayers.attr("layers");
  if (outline === "none") {
    webglRenderer.clear(oceanLayers);
    return;
  }

  TIME && console.time("drawOceanLayers");

  const geometry = geometryBuilder.build(outline || "");
  if (!geometry.polygons.length) {
    webglRenderer.clear(oceanLayers);
    TIME && console.timeEnd("drawOceanLayers");
    return;
  }

  const mesh = buildTriangleMesh(geometry.polygons);
  const renderedWithWebGl = !!mesh && mesh.vertexCount > 0 && webglRenderer.render(oceanLayers, mesh, geometry.opacity);

  if (!renderedWithWebGl) {
    svgFallbackRenderer.render(oceanLayers, geometry);
  } else {
    oceanLayers.selectAll("path").remove();
  }

  TIME && console.timeEnd("drawOceanLayers");
};

export const renderOceanLayersSvgForExport = (
  oceanLayersSelection: Selection<SVGGElement, unknown, null, undefined>,
  options: OceanLayersSvgRenderOptions = {}
) => {
  const outline = oceanLayersSelection.attr("layers");
  if (outline === "none") {
    oceanLayersSelection.selectAll("path").remove();
    if (options.removeWebglHost) oceanLayersSelection.select("#oceanLayersWebglHost").remove();
    return;
  }

  const geometry = geometryBuilder.build(outline || "");
  if (!geometry.polygons.length) {
    oceanLayersSelection.selectAll("path").remove();
    if (options.removeWebglHost) oceanLayersSelection.select("#oceanLayersWebglHost").remove();
    return;
  }

  svgFallbackRenderer.render(oceanLayersSelection, geometry);
  if (options.removeWebglHost) oceanLayersSelection.select("#oceanLayersWebglHost").remove();
};
