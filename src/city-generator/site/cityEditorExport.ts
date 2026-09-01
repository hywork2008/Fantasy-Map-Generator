// Projection of a generated city into the City Editor's native JSON format.
// Keep this structural rather than importing City Editor implementation code:
// City Generator remains usable on its own, while the emitted JSON is accepted
// by City Editor's fixed `parseDocument` contract.

import type { Cell, CityProgram, GenerationResult, Point, WardKind } from "../core/types";

type Id = string;
type EditorWard = "market" | "castle" | "merchant" | "craftsmen" | "harbor" | "park" | "empty";

interface EditorEdgeRef {
  edgeId: Id;
  forward: boolean;
}

interface EditorMesh {
  vertices: Record<Id, { id: Id; point: Point; locked: boolean }>;
  edges: Record<Id, { id: Id; a: Id; b: Id; leftFace: Id | null; rightFace: Id | null; locked: boolean }>;
  faces: Record<
    Id,
    {
      id: Id;
      boundary: EditorEdgeRef[];
      site: Point;
      properties: {
        elevation: number;
        water: "land" | "sea";
        ward: EditorWard | null;
        buildable: boolean;
        locked: boolean;
      };
    }
  >;
}

interface EditorLineStyle {
  widthMeters: number;
  color: string;
}

type EditorFeatureGroup =
  | {
      id: Id;
      kind: "road" | "wall" | "plank";
      name: string;
      segments: EditorEdgeRef[];
      style: EditorLineStyle;
      locked: boolean;
    }
  | {
      id: Id;
      kind: "river";
      name: string;
      vertices: Id[];
      source: null;
      mouth: null;
      style: EditorLineStyle;
      locked: boolean;
    };

export interface CityEditorDocumentExport {
  format: "fmg-city-editor";
  version: 1;
  frame: { extentMeters: number; cityRadiusMeters: number; blockSizeMeters: number };
  mesh: EditorMesh;
  featureGroups: EditorFeatureGroup[];
  gates: Array<{ id: Id; vertexId: Id; locked: boolean }>;
  elements: Array<{
    id: Id;
    kind: "plaza" | "citadel" | "temple" | "harbor" | "gate";
    faceIds: Id[];
    point?: Point;
    locked: boolean;
  }>;
}

/** Build a complete, editable City Editor document from Generator's final S7 plan. */
export function buildCityEditorDocument(result: GenerationResult, program: CityProgram): CityEditorDocumentExport {
  const snapshot = result.steps.at(-1);
  const cells = snapshot?.cells ?? result.cells;
  const tags = new Map(snapshot?.cells.map(cell => [cell.id, cell.tag]) ?? []);
  const wards = new Map(result.wards.map(ward => [ward.cellId, ward.kind]));
  const builder = new EditorMeshBuilder();

  for (const cell of cells) builder.addFace(cell, tags.get(cell.id) ?? "land", wards.get(cell.id));

  const featureGroups: EditorFeatureGroup[] = [];
  for (const [index, river] of result.riverPaths.entries()) {
    const vertices = builder.pathVertices(river.edgeTrack.length >= 2 ? river.edgeTrack : river.points);
    if (vertices.length < 2) continue;
    featureGroups.push({
      id: `river-${index}`,
      kind: "river",
      name: `River ${index + 1}`,
      vertices,
      source: null,
      mouth: null,
      style: { widthMeters: average(river.widths, Math.max(8, result.params.cellSizeMeters * 0.2)), color: "#4f8aad" },
      locked: false
    });
  }

  for (const [index, road] of result.streets.roads.entries()) {
    const segments = builder.pathSegments(road);
    if (!segments.length) continue;
    featureGroups.push({
      id: `road-${index}`,
      kind: "road",
      name: `Road ${index + 1}`,
      segments,
      style: { widthMeters: Math.max(5, result.params.cellSizeMeters * 0.12), color: "#735238" },
      locked: false
    });
  }

  if (program.walls) {
    for (const [index, wall] of result.borders.entries()) {
      const segments = builder.pathSegments(wall.points, true);
      if (!segments.length) continue;
      featureGroups.push({
        id: `wall-${index}`,
        kind: "wall",
        name: `Wall ${index + 1}`,
        segments,
        style: { widthMeters: Math.max(5, result.params.cellSizeMeters * 0.12), color: "#41382e" },
        locked: false
      });
    }
  }

  const wallVertices = new Set<Id>();
  for (const group of featureGroups) {
    if (group.kind !== "wall") continue;
    for (const segment of group.segments) {
      const edge = builder.mesh.edges[segment.edgeId];
      if (edge) wallVertices.add(edge.a).add(edge.b);
    }
  }
  const gates = result.gates.flatMap((gate, index) => {
    const vertexId = builder.nearestVertex(gate.point, wallVertices);
    return vertexId ? [{ id: `gate-${index}`, vertexId, locked: false }] : [];
  });

  return {
    format: "fmg-city-editor",
    version: 1,
    frame: {
      extentMeters: result.params.extentMeters,
      cityRadiusMeters: result.params.cityRadiusMeters,
      blockSizeMeters: result.params.cellSizeMeters
    },
    mesh: builder.mesh,
    featureGroups,
    gates,
    elements: []
  };
}

class EditorMeshBuilder {
  readonly mesh: EditorMesh = { vertices: {}, edges: {}, faces: {} };
  private readonly vertexBins = new Map<string, Id[]>();
  private readonly edgeByEnds = new Map<string, Id>();
  private vertexNo = 0;
  private edgeNo = 0;

  addFace(cell: Cell, tag: string, ward: WardKind | undefined): void {
    const vertexIds = withoutAdjacentDuplicates(cell.polygon.map(point => this.vertex(point)));
    if (vertexIds.length < 3 || new Set(vertexIds).size < 3) return;
    const id = `f${cell.id}`;
    const boundary = vertexIds.map((from, index) => this.edge(from, vertexIds[(index + 1) % vertexIds.length], id));
    const sea = tag === "sea";
    this.mesh.faces[id] = {
      id,
      boundary,
      site: copyPoint(cell.site),
      properties: {
        elevation: sea ? 0 : 1,
        water: sea ? "sea" : "land",
        ward: editorWard(ward),
        buildable: !sea && tag !== "rural",
        locked: false
      }
    };
  }

  pathVertices(points: Point[]): Id[] {
    const vertices = withoutAdjacentDuplicates(points.map(point => this.vertex(point)));
    for (let index = 1; index < vertices.length; index++) this.edge(vertices[index - 1], vertices[index]);
    return vertices;
  }

  pathSegments(points: Point[], closed = false): EditorEdgeRef[] {
    const vertices = this.pathVertices(points);
    if (vertices.length < 2) return [];
    const segments = vertices.slice(1).map((to, index) => this.edge(vertices[index], to));
    if (closed) segments.push(this.edge(vertices.at(-1)!, vertices[0]));
    return segments;
  }

  nearestVertex(point: Point, candidates?: ReadonlySet<Id>): Id | null {
    let nearest: Id | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const vertex of Object.values(this.mesh.vertices)) {
      if (candidates && !candidates.has(vertex.id)) continue;
      const candidate = Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]);
      if (candidate < distance) {
        nearest = vertex.id;
        distance = candidate;
      }
    }
    return nearest;
  }

  private vertex(point: Point): Id {
    const gx = Math.floor(point[0]);
    const gy = Math.floor(point[1]);
    for (let y = gy - 1; y <= gy + 1; y++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        for (const id of this.vertexBins.get(`${x},${y}`) ?? []) {
          const existing = this.mesh.vertices[id].point;
          if (Math.hypot(existing[0] - point[0], existing[1] - point[1]) < 1) return id;
        }
      }
    }
    const id = `v${this.vertexNo++}`;
    this.mesh.vertices[id] = { id, point: copyPoint(point), locked: false };
    const key = `${gx},${gy}`;
    this.vertexBins.set(key, [...(this.vertexBins.get(key) ?? []), id]);
    return id;
  }

  private edge(from: Id, to: Id, faceId?: Id): EditorEdgeRef {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    let id = this.edgeByEnds.get(key);
    if (!id) {
      id = `e${this.edgeNo++}`;
      this.edgeByEnds.set(key, id);
      const forward = from < to;
      this.mesh.edges[id] = {
        id,
        a: forward ? from : to,
        b: forward ? to : from,
        leftFace: null,
        rightFace: null,
        locked: false
      };
    }
    const edge = this.mesh.edges[id];
    const forward = edge.a === from && edge.b === to;
    if (faceId) {
      if (forward) edge.leftFace = faceId;
      else edge.rightFace = faceId;
    }
    return { edgeId: id, forward };
  }
}

function editorWard(ward: WardKind | undefined): EditorWard | null {
  switch (ward) {
    case "market":
    case "castle":
    case "merchant":
    case "craftsmen":
    case "harbor":
    case "park":
    case "empty":
      return ward;
    case "farm":
      return "empty";
    default:
      return null;
  }
}

function withoutAdjacentDuplicates(ids: Id[]): Id[] {
  const result = ids.filter((id, index) => index === 0 || id !== ids[index - 1]);
  if (result.length > 1 && result[0] === result.at(-1)) result.pop();
  return result;
}

function copyPoint(point: Point): Point {
  return [point[0], point[1]];
}

function average(values: number[], fallback: number): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}
