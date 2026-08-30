import { edgeEnd, faceNeighbors, facePoints, faceVertices } from "../core/mesh";
import type { CityDocument, EdgeRef, FeatureGroup, Id, Point, Tool } from "../core/types";

const NS = "http://www.w3.org/2000/svg";
const REFERENCE_LABEL_EXTENT_METERS = 1200;
const REFERENCE_LABEL_FONT_SIZE = 14;

export interface RenderSelection {
  faceId: Id | null;
  edgeId: Id | null;
  vertexId: Id | null;
  groupId: Id | null;
  hoverGroupId?: Id | null;
  hoverVertexId?: Id | null;
}

export function renderEditorSvg(
  document: CityDocument,
  tool: Tool,
  selection: RenderSelection,
  viewBox: string,
  zoom: number,
  showSelectionLabels = false
): SVGSVGElement {
  const svg = element("svg", { viewBox, class: "ce-svg", "aria-label": "City editor canvas" }) as SVGSVGElement;
  if (document.referenceImage) {
    const { href, width, height } = document.referenceImage;
    svg.appendChild(
      element("image", {
        href,
        x: String(-width / 2),
        y: String(-height / 2),
        width: String(width),
        height: String(height),
        class: "ce-reference-image",
        "pointer-events": "none"
      })
    );
  }
  const cells = element("g", { class: "ce-cells" });
  for (const face of Object.values(document.mesh.faces)) {
    const selected = selection.faceId === face.id;
    cells.appendChild(
      element("path", {
        d: polygon(facePoints(document.mesh, face)),
        class: `ce-face ce-face--${face.properties.water} ce-face--ward-${face.properties.ward ?? "unassigned"}${selected ? " ce-selected" : ""}`,
        "data-face": face.id
      })
    );
  }
  svg.appendChild(cells);

  const edges = element("g", { class: "ce-edges" });
  for (const edge of Object.values(document.mesh.edges)) {
    const [a, b] = [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point];
    edges.appendChild(
      element("path", {
        d: line([a, b]),
        class: `ce-edge${selection.edgeId === edge.id ? " ce-selected" : ""}`,
        "data-edge": edge.id
      })
    );
  }
  svg.appendChild(edges);

  const features = element("g", { class: "ce-features" });
  for (const group of document.featureGroups) {
    const active = selection.groupId === group.id;
    const hovered = selection.hoverGroupId === group.id;
    const points =
      group.kind === "river"
        ? group.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint)
        : edgeGroupPoints(document, group.segments);
    if (points.length < 2) continue;
    features.appendChild(
      element("path", {
        d: line(points),
        class: `ce-feature ce-feature--${group.kind}${active ? " ce-active-group" : ""}${hovered ? " ce-hover-group" : ""}`,
        stroke: group.style.color,
        "stroke-width": String(group.style.widthMeters),
        "data-group": group.id,
        // Once selected, let the mesh edges below receive clicks so individual
        // route segments can be added and removed.
        "pointer-events": active ? "none" : "stroke"
      })
    );
  }
  svg.appendChild(features);
  svg.appendChild(element("g", { class: "ce-route-preview-layer", "pointer-events": "none" }));

  const elements = element("g", { class: "ce-elements" });
  for (const cityElement of document.elements) {
    const face = document.mesh.faces[cityElement.faceIds[0]];
    const p = cityElement.point ?? (face ? centroid(facePoints(document.mesh, face)) : null);
    if (!p) continue;
    if (cityElement.kind === "tree") {
      elements.appendChild(tree(p, cityElement.sizeMeters ?? 8, cityElement.id));
      continue;
    }
    elements.appendChild(
      element(
        "text",
        { x: String(p[0]), y: String(-p[1]), class: "ce-element", "data-element": cityElement.id },
        symbol(cityElement.kind)
      )
    );
  }
  svg.appendChild(elements);

  if (showSelectionLabels && selection.faceId) appendFaceSelectionLabels(svg, document, selection.faceId, zoom);

  const showAllVertices = tool === "vertex" || tool === "river";
  if (showAllVertices || selection.hoverVertexId) {
    const vertices = element("g", { class: "ce-vertices" });
    for (const vertex of Object.values(document.mesh.vertices)) {
      if (!showAllVertices && vertex.id !== selection.hoverVertexId) continue;
      vertices.appendChild(
        element("circle", {
          cx: String(vertex.point[0]),
          cy: String(-vertex.point[1]),
          r: String(vertexHandleRadius(zoom)),
          class: `ce-vertex${selection.hoverVertexId === vertex.id ? " ce-hover-vertex" : ""}${selection.vertexId === vertex.id ? " ce-selected" : ""}`,
          "data-vertex": vertex.id
        })
      );
    }
    svg.appendChild(vertices);
  }
  return svg;
}

/** Show the IDs used by the face-editing controls while a cell is selected. */
function appendFaceSelectionLabels(svg: SVGSVGElement, document: CityDocument, faceId: Id, zoom: number): void {
  const selectedFace = document.mesh.faces[faceId];
  if (!selectedFace) return;
  const labels = element("g", { class: "ce-selection-labels", "pointer-events": "none" });
  const fontSize = selectionLabelFontSize(document.frame.extentMeters, zoom);

  for (const vertexId of faceVertices(document.mesh, selectedFace)) {
    const vertex = document.mesh.vertices[vertexId];
    if (!vertex) continue;
    const point = vertexLabelPoint(vertex.id, document, fontSize);
    labels.appendChild(
      element(
        "text",
        {
          x: String(point[0]),
          y: String(-point[1]),
          "font-size": String(fontSize),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          class: "ce-selection-label ce-selection-vertex-label"
        },
        vertex.id
      )
    );
  }

  for (const nearbyFaceId of [selectedFace.id, ...faceNeighbors(document.mesh, selectedFace.id)]) {
    const face = document.mesh.faces[nearbyFaceId];
    if (!face) continue;
    const point = centroid(facePoints(document.mesh, face));
    labels.appendChild(
      element(
        "text",
        {
          x: String(point[0]),
          y: String(-point[1]),
          "font-size": String(fontSize),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          class: "ce-selection-label ce-selection-face-label"
        },
        face.id
      )
    );
  }
  svg.appendChild(labels);
}

/**
 * Label text is expressed in SVG map units. Scale it with the map extent so a
 * freshly opened large/imported map has the same screen size as a new small
 * (1200 m) map; compensate for the current zoom afterwards.
 */
export function selectionLabelFontSize(extentMeters: number, zoom: number): number {
  return (REFERENCE_LABEL_FONT_SIZE * Math.max(1, extentMeters)) / (REFERENCE_LABEL_EXTENT_METERS * Math.max(1, zoom));
}

/**
 * Keep a vertex label directly on its point unless it would cover a nearby
 * vertex. In that case, shift it away from the closest point just far enough
 * for the text to clear it.
 */
function vertexLabelPoint(vertexId: Id, document: CityDocument, fontSize: number): Point {
  const vertex = document.mesh.vertices[vertexId];
  if (!vertex) return [0, 0];
  let closest: Point | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.values(document.mesh.vertices)) {
    if (candidate.id === vertexId) continue;
    const distance = Math.hypot(candidate.point[0] - vertex.point[0], candidate.point[1] - vertex.point[1]);
    if (distance < closestDistance) {
      closest = candidate.point;
      closestDistance = distance;
    }
  }

  // Approximate half the label width, with a small amount of clearance.
  const labelRadius = Math.max(fontSize * 1.25, vertexId.length * fontSize * 0.38);
  if (!closest || closestDistance > labelRadius * 1.5) return vertex.point;
  const dx = vertex.point[0] - closest[0];
  const dy = vertex.point[1] - closest[1];
  const distance = Math.hypot(dx, dy) || 1;
  const displacement = labelRadius + fontSize * 0.3;
  return [vertex.point[0] + (dx / distance) * displacement, vertex.point[1] + (dy / distance) * displacement];
}

/** Vertex handles retain a precise, constant map-space radius at every zoom. */
export function vertexHandleRadius(_zoom: number): number {
  return 2;
}

/** Create a lightweight overlay path for an uncommitted route preview. */
export function renderRoutePreview(document: CityDocument, group: FeatureGroup, vertices: Id[]): SVGPathElement | null {
  const points = vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint);
  if (points.length < 2) return null;
  return element("path", {
    d: line(points),
    class: `ce-feature ce-route-preview ce-feature--${group.kind}`,
    stroke: "#ffd75c",
    "stroke-width": String(group.style.widthMeters),
    "pointer-events": "none"
  }) as SVGPathElement;
}

function edgeGroupPoints(document: CityDocument, segments: EdgeRef[]): Point[] {
  if (!segments.length) return [];
  const first = segments[0];
  const edge = document.mesh.edges[first.edgeId];
  if (!edge) return [];
  const start = first.forward ? edge.a : edge.b;
  return [
    document.mesh.vertices[start].point,
    ...segments.map(segment => document.mesh.vertices[edgeEnd(document.mesh, segment)].point)
  ];
}

function polygon(points: Point[]): string {
  return `${line(points)} Z`;
}

function line(points: Point[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0]} ${-point[1]}`).join(" ");
}

function centroid(points: Point[]): Point {
  const total = points.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function element(name: string, attrs: Record<string, string>, content?: string): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content) node.textContent = content;
  return node;
}

function isPoint(point: Point | undefined): point is Point {
  return point !== undefined;
}

function symbol(kind: string): string {
  return { plaza: "□", citadel: "♜", temple: "✦", harbor: "⚓", gate: "⌑", tower: "●", tree: "♣" }[kind] ?? "•";
}

function tree(point: Point, radius: number, id: Id): SVGElement {
  const [x, y] = [point[0], -point[1]];
  const crown = element("g", { class: "ce-tree", "data-element": id, "pointer-events": "none" });
  crown.append(
    element("path", {
      d: `M${x} ${y + radius} L${x} ${y - radius * 0.15}`,
      class: "ce-tree-trunk",
      "stroke-width": String(Math.max(1, radius * 0.22))
    }),
    element("circle", {
      cx: String(x - radius * 0.36),
      cy: String(y - radius * 0.18),
      r: String(radius * 0.48),
      class: "ce-tree-crown"
    }),
    element("circle", {
      cx: String(x + radius * 0.36),
      cy: String(y - radius * 0.18),
      r: String(radius * 0.48),
      class: "ce-tree-crown"
    }),
    element("circle", {
      cx: String(x),
      cy: String(y - radius * 0.58),
      r: String(radius * 0.52),
      class: "ce-tree-crown"
    })
  );
  return crown;
}
