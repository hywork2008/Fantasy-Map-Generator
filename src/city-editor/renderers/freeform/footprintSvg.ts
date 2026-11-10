import type { Point } from "../../types/primitives";

/** Dual plan wireframe: the building box inside the plot margin, plus a front arrow. */
export function renderFootprintSvg(preview: {
  building: readonly Point[];
  plot: readonly Point[];
  ok: boolean;
  facingDegrees: number;
  label: string;
}): SVGGElement {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("ce-building-preview");
  group.setAttribute("pointer-events", "none");
  const color = preview.ok ? "#2e7d32" : "#c62828";
  group.append(ring(preview.plot, color), ring(preview.building, color));
  const center = centroid(preview.building);
  const radians = (preview.facingDegrees * Math.PI) / 180;
  const tip: Point = [center[0] + Math.sin(radians) * 8, center[1] + Math.cos(radians) * 8];
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "line");
  arrow.setAttribute("x1", String(center[0]));
  arrow.setAttribute("y1", String(-center[1]));
  arrow.setAttribute("x2", String(tip[0]));
  arrow.setAttribute("y2", String(-tip[1]));
  arrow.setAttribute("stroke", color);
  arrow.setAttribute("stroke-width", "2");
  arrow.setAttribute("vector-effect", "non-scaling-stroke");
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(center[0]));
  text.setAttribute("y", String(-center[1] - 2));
  text.setAttribute("fill", color);
  text.setAttribute("font-size", "3");
  text.setAttribute("text-anchor", "middle");
  text.textContent = preview.label;
  group.append(arrow, text);
  return group;
}

function ring(points: readonly Point[], color: string): SVGPolygonElement {
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", points.map(point => `${point[0]},${-point[1]}`).join(" "));
  polygon.setAttribute("fill", "none");
  polygon.setAttribute("stroke", color);
  polygon.setAttribute("stroke-width", "1.5");
  polygon.setAttribute("vector-effect", "non-scaling-stroke");
  return polygon;
}

function centroid(points: readonly Point[]): Point {
  if (!points.length) return [0, 0];
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}
