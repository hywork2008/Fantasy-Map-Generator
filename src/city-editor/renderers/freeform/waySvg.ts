import { offsetStrip, slicePolyline } from "../../generators/freeform/wayGeometry";
import type { Point } from "../../types/primitives";
import type { FreeformWay } from "../../types/terrain";

const NS = "http://www.w3.org/2000/svg";

/** Committed ways, plus the line still being drawn. Clicks pass through to the map. */
export function renderWayOverlay(input: {
  ways: readonly FreeformWay[];
  draft: { centerline: readonly Point[]; widthMeters: number; ok: boolean } | null;
}): SVGGElement {
  const group = document.createElementNS(NS, "g");
  group.classList.add("ce-way-overlay");
  group.setAttribute("pointer-events", "none");
  for (const way of input.ways) {
    group.append(strip(way.centerline, way.widthMeters / 2, "#6b5e4e", 0.35));
    group.append(line(way.centerline, "#3e342c", "2.5"));
    for (const flight of way.flights ?? []) {
      const run = flight.toMeters - flight.fromMeters;
      if (!(run > 0)) continue;
      group.append(line(slicePolyline(way.centerline, flight.fromMeters, flight.toMeters), "#1f4e79", "2", "1.2 1.6"));
    }
  }
  if (input.draft && input.draft.centerline.length >= 2) {
    const color = input.draft.ok ? "#2e7d32" : "#c62828";
    group.append(strip(input.draft.centerline, input.draft.widthMeters / 2, color, 0.2));
    group.append(line(input.draft.centerline, color, "2", "2 1.5"));
  }
  return group;
}

function strip(line: readonly Point[], halfWidth: number, color: string, opacity: number): SVGPolygonElement {
  const polygon = document.createElementNS(NS, "polygon");
  polygon.setAttribute(
    "points",
    offsetStrip(line, halfWidth)
      .map(point => `${point[0]},${-point[1]}`)
      .join(" ")
  );
  polygon.setAttribute("fill", color);
  polygon.setAttribute("fill-opacity", String(opacity));
  polygon.setAttribute("stroke", "none");
  return polygon;
}

function line(points: readonly Point[], color: string, width: string, dash?: string): SVGPolylineElement {
  const node = document.createElementNS(NS, "polyline");
  node.setAttribute("points", points.map(point => `${point[0]},${-point[1]}`).join(" "));
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", color);
  node.setAttribute("stroke-width", width);
  node.setAttribute("stroke-linejoin", "round");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("vector-effect", "non-scaling-stroke");
  if (dash) node.setAttribute("stroke-dasharray", dash);
  return node;
}
