import { edgeEnd } from "../generators/mesh";
import type { CityDocument, EdgeRef, Point } from "../types/document";

export const NS = "http://www.w3.org/2000/svg";

/** Shared SVG shape helpers. Pure geometry-to-string and DOM node creation only. */

export function element(name: string, attrs: Record<string, string>, content?: string): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content) node.textContent = content;
  return node;
}

export function line(points: Point[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0]} ${-point[1]}`).join(" ");
}

export function polygon(points: Point[]): string {
  return `${line(points)} Z`;
}

export function centroid(points: Point[]): Point {
  const total = points.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

export function isPoint(point: Point | undefined): point is Point {
  return point !== undefined;
}

export function edgeGroupPoints(document: CityDocument, segments: EdgeRef[]): Point[] {
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
