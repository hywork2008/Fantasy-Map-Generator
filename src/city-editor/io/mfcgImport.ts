import { validate } from "../core/mesh";
import type { CityDocument, EdgeRef, FaceProperties, Id, Point } from "../core/types";

type JsonRecord = Record<string, unknown>;
type Geometry = { type: string; coordinates?: unknown; geometries?: unknown };

const LAND: FaceProperties = { elevation: 1, water: "land", ward: null, buildable: true, locked: false };
const WATER: FaceProperties = { elevation: 0, water: "openWater", ward: null, buildable: false, locked: false };
const FIELD: FaceProperties = { elevation: 1, water: "land", ward: "empty", buildable: false, locked: false };

/** Convert the GeoJSON export produced by Medieval Fantasy City Generator into an editable city map. */
export function importMfcgJson(value: unknown): CityDocument | null {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) return null;
  const features = value.features.filter(isRecord);
  const settings = features.find(feature => feature.id === "values");
  if (settings?.generator !== "mfcg") return null;

  const byId = (id: string) => features.find(feature => feature.id === id);
  const points = collectPoints(features);
  const bounds = getBounds(points);
  if (!bounds) return null;
  const center: Point = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
  const extentMeters = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  // MFCG GeoJSON already uses a north-positive Cartesian Y axis. The editor
  // renderer converts that axis to SVG's down-positive Y axis, so only centre
  // the imported coordinates here; do not invert Y a second time.
  const state = new MeshBuilder(point => [point[0] - center[0], point[1] - center[1]]);

  for (const polygon of polygons(byId("water"))) state.addFace(polygon, WATER);
  for (const polygon of polygons(byId("fields"))) state.addFace(polygon, FIELD);
  const squareFaces = polygons(byId("squares")).map(polygon => state.addFace(polygon, { ...LAND, ward: "market" }));
  for (const polygon of polygons(byId("buildings"))) state.addFace(polygon, LAND);

  const roadWidth = finiteNumber(settings.roadWidth, 8);
  const wallWidth = finiteNumber(settings.wallThickness, 8);
  const riverWidth = finiteNumber(settings.riverWidth, 18);
  for (const line of lines(byId("roads"))) state.addEdgeGroup("road", line, roadWidth, "#735238", false);
  for (const ring of polygonRings(byId("walls"))) state.addEdgeGroup("wall", ring, wallWidth, "#41382e", true);
  for (const line of lines(byId("rivers"))) state.addRiver(line, riverWidth);
  for (const line of lines(byId("planks")))
    state.addEdgeGroup("plank", line, Math.max(2, roadWidth / 2), "#d8d0c0", false);

  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters, cityRadiusMeters: extentMeters / 3, blockSizeMeters: 50 },
    mesh: { vertices: state.vertices, edges: state.edges, faces: state.faces },
    featureGroups: state.featureGroups,
    elements: squareFaces.flatMap((faceId, index) =>
      faceId ? [{ id: `plaza-${index}`, kind: "plaza" as const, faceIds: [faceId], locked: false }] : []
    )
  };
  return validate(document).length === 0 ? document : null;
}

/** Import an MFCG SVG as a non-editable image reference. SVG has no editable layer metadata. */
export function importMfcgSvg(svg: string): CityDocument | null {
  const dimensions = svgDimensions(svg);
  if (!dimensions) return null;
  const [width, height] = dimensions;
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: {
      extentMeters: Math.max(width, height),
      cityRadiusMeters: Math.min(width, height) / 3,
      blockSizeMeters: 50
    },
    referenceImage: { href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width, height },
    mesh: { vertices: {}, edges: {}, faces: {} },
    featureGroups: [],
    elements: []
  };
}

class MeshBuilder {
  readonly vertices: CityDocument["mesh"]["vertices"] = {};
  readonly edges: CityDocument["mesh"]["edges"] = {};
  readonly faces: CityDocument["mesh"]["faces"] = {};
  readonly featureGroups: CityDocument["featureGroups"] = [];
  private readonly verticesByPoint = new Map<string, Id>();
  private readonly edgesByEnds = new Map<string, Id>();
  private vertexNumber = 0;
  private edgeNumber = 0;
  private faceNumber = 0;
  private groupNumber = 0;

  constructor(private readonly transform: (point: Point) => Point) {}

  addFace(points: Point[], properties: FaceProperties): Id | null {
    const ids = this.pointIds(points);
    if (ids.length < 3 || new Set(ids).size < 3) return null;
    const id = `f${this.faceNumber++}`;
    const boundary = ids.map((from, index) => this.edgeRef(from, ids[(index + 1) % ids.length], id));
    this.faces[id] = { id, boundary, site: centroid(ids.map(vertexId => this.vertices[vertexId].point)), properties };
    return id;
  }

  addEdgeGroup(
    kind: "road" | "wall" | "plank",
    points: Point[],
    widthMeters: number,
    color: string,
    closed: boolean
  ): void {
    const ids = this.pointIds(points);
    if (ids.length < 2) return;
    const segments: EdgeRef[] = [];
    for (let index = 1; index < ids.length; index++) segments.push(this.edgeRef(ids[index - 1], ids[index]));
    if (closed) segments.push(this.edgeRef(ids.at(-1)!, ids[0]));
    if (!segments.length) return;
    const id = `${kind}-${this.groupNumber++}`;
    this.featureGroups.push({ id, kind, name: id, segments, style: { widthMeters, color }, locked: false });
  }

  addRiver(points: Point[], widthMeters: number): void {
    const ids = this.pointIds(points);
    if (ids.length < 2) return;
    for (let index = 1; index < ids.length; index++) this.edgeRef(ids[index - 1], ids[index]);
    const id = `river-${this.groupNumber++}`;
    this.featureGroups.push({
      id,
      kind: "river",
      name: id,
      vertices: ids,
      source: null,
      mouth: null,
      style: { widthMeters, color: "#4f8aad" },
      locked: false
    });
  }

  private pointIds(points: Point[]): Id[] {
    const ids = points.map(point => this.vertexId(point));
    const result = ids.filter((id, index) => {
      if (index === 0) return true;
      const previous = ids[index - 1];
      return id !== previous && distance(this.vertices[previous].point, this.vertices[id].point) >= 1;
    });
    if (result.length > 1 && distance(this.vertices[result[0]].point, this.vertices[result.at(-1)!].point) < 1)
      result.pop();
    return result;
  }

  private vertexId(source: Point): Id {
    const point = this.transform(source);
    const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
    const existing = this.verticesByPoint.get(key);
    if (existing) return existing;
    const id = `v${this.vertexNumber++}`;
    this.verticesByPoint.set(key, id);
    this.vertices[id] = { id, point, locked: false };
    return id;
  }

  private edgeRef(from: Id, to: Id, faceId?: Id): EdgeRef {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    let edgeId = this.edgesByEnds.get(key);
    if (!edgeId) {
      edgeId = `e${this.edgeNumber++}`;
      this.edgesByEnds.set(key, edgeId);
      const forward = from < to;
      this.edges[edgeId] = {
        id: edgeId,
        a: forward ? from : to,
        b: forward ? to : from,
        leftFace: null,
        rightFace: null,
        locked: false
      };
    }
    const edge = this.edges[edgeId];
    const forward = edge.a === from && edge.b === to;
    if (faceId) {
      if (forward) edge.leftFace = faceId;
      else edge.rightFace = faceId;
    }
    return { edgeId, forward };
  }
}

function polygons(feature: JsonRecord | undefined): Point[][] {
  if (feature?.type !== "MultiPolygon") return [];
  return asArray(feature.coordinates).flatMap(polygon => {
    const ring = asArray(polygon)[0];
    const points = pointsFrom(ring);
    return points.length >= 3 ? [points] : [];
  });
}

function polygonRings(feature: JsonRecord | undefined): Point[][] {
  if (feature?.type !== "GeometryCollection") return [];
  return asArray(feature.geometries).flatMap(geometry => {
    if (!isGeometry(geometry) || geometry.type !== "Polygon") return [];
    const points = pointsFrom(asArray(geometry.coordinates)[0]);
    return points.length >= 3 ? [points] : [];
  });
}

function lines(feature: JsonRecord | undefined): Point[][] {
  if (feature?.type !== "GeometryCollection") return [];
  return asArray(feature.geometries).flatMap(geometry => {
    if (!isGeometry(geometry) || geometry.type !== "LineString") return [];
    const points = pointsFrom(geometry.coordinates);
    return points.length >= 2 ? [points] : [];
  });
}

function collectPoints(features: JsonRecord[]): Point[] {
  const result: Point[] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    const point = toPoint(value);
    if (point) result.push(point);
    else value.forEach(visit);
  };
  features.forEach(feature => {
    visit(feature.coordinates ?? feature.geometries);
  });
  return result;
}

function getBounds(points: Point[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (!points.length) return null;
  return points.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y)
    }),
    { minX: points[0][0], maxX: points[0][0], minY: points[0][1], maxY: points[0][1] }
  );
}

function pointsFrom(value: unknown): Point[] {
  return asArray(value).flatMap(point => {
    const parsed = toPoint(point);
    return parsed ? [parsed] : [];
  });
}

function toPoint(value: unknown): Point | null {
  if (!Array.isArray(value) || value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]))
    return null;
  return [value[0], value[1]];
}

function isGeometry(value: unknown): value is Geometry {
  return isRecord(value) && typeof value.type === "string";
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function centroid(points: Point[]): Point {
  return points.reduce<Point>(
    (sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length],
    [0, 0]
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function svgDimensions(svg: string): [number, number] | null {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return null;
  const dimension = (name: string) => Number(root.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9.]+)`, "i"))?.[1]);
  const width = dimension("width");
  const height = dimension("height");
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return [width, height];
  const viewBox = root
    .match(/\bviewBox\s*=\s*["']([^"']+)/i)?.[1]
    ?.trim()
    .split(/[ ,]+/)
    .map(Number);
  return viewBox?.length === 4 && viewBox.slice(2).every(value => Number.isFinite(value) && value > 0)
    ? [viewBox[2], viewBox[3]]
    : null;
}
