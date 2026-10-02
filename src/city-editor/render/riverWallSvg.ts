import { clipPolylineOutsideRivers, type RiverRibbon, riverRibbons } from "../core/bridgeDeck";
import { featureGroupVertices } from "../core/features";
import { vertexHasCrossing } from "../core/passages";
import type { CityDocument, Id, Point } from "../core/types";

/** Follow each wall arm to the first visible bank, including short mesh edges
 * inside the channel. The grate keeps both banks' actual wall directions. */
function bankArm(
  city: CityDocument,
  ring: Id[],
  index: number,
  step: number,
  closed: boolean,
  rivers: RiverRibbon[]
): Point[] | null {
  const points = [city.mesh.vertices[ring[index]].point];
  for (let offset = 1; offset < ring.length; offset++) {
    const nextIndex = index + offset * step;
    if (!closed && (nextIndex < 0 || nextIndex >= ring.length)) break;
    const point = city.mesh.vertices[ring[(nextIndex + ring.length) % ring.length]]?.point;
    if (!point) return null;
    const dry = clipPolylineOutsideRivers([points.at(-1)!, point], rivers);
    if (dry.length) return [...points, dry[0][0]];
    points.push(point);
  }
  return null;
}

/** Visible in checkpoint, failure preview and exported SVG alike. */
export function renderRiverWallSvg(city: CityDocument): SVGGElement {
  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  layer.setAttribute("class", "ce-river-wall-passages");
  layer.setAttribute("pointer-events", "none");
  const rivers = riverRibbons(city);
  for (const wall of city.featureGroups) {
    if (wall.kind !== "wall") continue;
    const vertices = featureGroupVertices(city, wall);
    const closed = vertices.length > 2 && vertices[0] === vertices.at(-1);
    const ring = closed ? vertices.slice(0, -1) : vertices;
    for (const id of new Set(wall.riverPassages ?? [])) {
      if (!city.mesh.vertices[id] || !vertexHasCrossing(city, id, "wall", "river")) continue;
      const index = ring.indexOf(id);
      if (index < 0) continue;
      const left = bankArm(city, ring, index, -1, closed, rivers);
      const right = bankArm(city, ring, index, 1, closed, rivers);
      if (!left || !right) continue;
      const points = [...left.reverse(), ...right.slice(1)];
      const marker = document.createElementNS(ns, "g");
      marker.setAttribute("class", "ce-water-passage");
      marker.setAttribute("data-vertex", id);
      const grate = document.createElementNS(ns, "path");
      grate.setAttribute("d", points.map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`).join(""));
      grate.setAttribute("fill", "none");
      grate.setAttribute("stroke", "#000");
      grate.setAttribute("stroke-width", "1.2");
      grate.setAttribute("stroke-dasharray", "1 2");
      grate.setAttribute("stroke-linecap", "butt");
      grate.setAttribute("stroke-linejoin", "round");
      const title = document.createElementNS(ns, "title");
      title.textContent = `河川通過口: ${id}`;
      marker.append(title, grate);
      layer.append(marker);
    }
  }
  return layer;
}
