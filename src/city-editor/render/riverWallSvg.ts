import { vertexHasCrossing } from "../core/passages";
import type { CityDocument } from "../core/types";

/** Visible in checkpoint, failure preview and exported SVG alike. */
export function renderRiverWallSvg(city: CityDocument): SVGGElement {
  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  layer.setAttribute("class", "ce-river-wall-passages");
  layer.setAttribute("pointer-events", "none");
  for (const wall of city.featureGroups) {
    if (wall.kind !== "wall") continue;
    for (const id of new Set(wall.riverPassages ?? [])) {
      const point = city.mesh.vertices[id]?.point;
      if (!point || !vertexHasCrossing(city, id, "wall", "river")) continue;
      const marker = document.createElementNS(ns, "g");
      marker.setAttribute("class", "ce-water-passage");
      marker.setAttribute("data-vertex", id);
      const y = -point[1];
      const radius = Math.max(3, wall.style.widthMeters);
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", String(point[0]));
      circle.setAttribute("cy", String(y));
      circle.setAttribute("r", String(radius));
      circle.setAttribute("fill", "#4f8aad");
      circle.setAttribute("stroke", "#554a38");
      circle.setAttribute("stroke-width", "1.5");
      const water = document.createElementNS(ns, "path");
      water.setAttribute(
        "d",
        `M${point[0] - radius * 0.6},${y}q${radius * 0.3},${-radius * 0.4} ${radius * 0.6},0t${radius * 0.6},0`
      );
      water.setAttribute("fill", "none");
      water.setAttribute("stroke", "#edf7fc");
      water.setAttribute("stroke-width", "1.5");
      const title = document.createElementNS(ns, "title");
      title.textContent = `河川通過口: ${id}`;
      marker.append(title, circle, water);
      layer.append(marker);
    }
  }
  return layer;
}
