import { edgeEnd, facePoints } from "../core/mesh";
import type { CityDocument, EdgeRef, Id, Point, Tool } from "../core/types";

const NS = "http://www.w3.org/2000/svg";

export interface RenderSelection {
  faceId: Id | null;
  edgeId: Id | null;
  vertexId: Id | null;
  groupId: Id | null;
}

export function renderEditorSvg(
  document: CityDocument,
  tool: Tool,
  selection: RenderSelection,
  viewBox: string,
  zoom: number
): SVGSVGElement {
  const svg = element("svg", { viewBox, class: "ce-svg", "aria-label": "City editor canvas" }) as SVGSVGElement;
  const cells = element("g", { class: "ce-cells" });
  for (const face of Object.values(document.mesh.faces)) {
    const selected = selection.faceId === face.id;
    cells.appendChild(
      element("path", {
        d: polygon(facePoints(document.mesh, face)),
        class: `ce-face ce-face--${face.properties.water}${selected ? " ce-selected" : ""}`,
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
    const points =
      group.kind === "river"
        ? group.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint)
        : edgeGroupPoints(document, group.segments);
    if (points.length < 2) continue;
    features.appendChild(
      element("path", {
        d: line(points),
        class: `ce-feature ce-feature--${group.kind}${active ? " ce-active-group" : ""}`,
        stroke: group.style.color,
        "stroke-width": String(group.style.widthMeters),
        "data-group": group.id,
        "pointer-events": "stroke"
      })
    );
  }
  svg.appendChild(features);

  const elements = element("g", { class: "ce-elements" });
  for (const cityElement of document.elements) {
    const face = document.mesh.faces[cityElement.faceIds[0]];
    if (!face) continue;
    const p = centroid(facePoints(document.mesh, face));
    elements.appendChild(
      element(
        "text",
        { x: String(p[0]), y: String(-p[1]), class: "ce-element", "data-element": cityElement.id },
        symbol(cityElement.kind)
      )
    );
  }
  svg.appendChild(elements);

  if (tool === "vertex" || tool === "river") {
    const vertices = element("g", { class: "ce-vertices" });
    for (const vertex of Object.values(document.mesh.vertices)) {
      vertices.appendChild(
        element("circle", {
          cx: String(vertex.point[0]),
          cy: String(-vertex.point[1]),
          r: String(vertexHandleRadius(zoom)),
          class: `ce-vertex${selection.vertexId === vertex.id ? " ce-selected" : ""}`,
          "data-vertex": vertex.id
        })
      );
    }
    svg.appendChild(vertices);
  }
  return svg;
}

/** FMG-style zoom range: a large handle at ×1, reducing to r=2 at ×20. */
export function vertexHandleRadius(zoom: number): number {
  const clamped = Math.min(20, Math.max(1, zoom));
  return 8 - ((clamped - 1) / 19) * 6;
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
  return { plaza: "□", citadel: "♜", temple: "✦", harbor: "⚓", gate: "⌑", tower: "●" }[kind] ?? "•";
}
