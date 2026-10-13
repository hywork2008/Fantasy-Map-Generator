import { editorText } from "../../i18n/editorMessages";
import { riverRibbons } from "../generators/bridgeDeck";
import { riverWallPassagePath } from "../generators/riverWallPassage";
import type { CityDocument } from "../types/document";

/** Visible in checkpoint, failure preview and exported SVG alike. */
export function renderRiverWallSvg(city: CityDocument): SVGGElement {
  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  layer.setAttribute("class", "ce-river-wall-passages");
  layer.setAttribute("pointer-events", "none");
  const rivers = riverRibbons(city);
  for (const wall of city.featureGroups) {
    if (wall.kind !== "wall") continue;
    for (const id of new Set(wall.riverPassages ?? [])) {
      const points = riverWallPassagePath(city, wall, id, rivers);
      if (!points) continue;
      const marker = document.createElementNS(ns, "g");
      marker.setAttribute("class", "ce-water-passage");
      marker.setAttribute("data-vertex", id);
      const grate = document.createElementNS(ns, "path");
      grate.setAttribute("d", points.map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`).join(""));
      grate.setAttribute("fill", "none");
      grate.setAttribute("stroke", wall.wallMaterial === "wood" ? "#634327" : "#000");
      grate.setAttribute("stroke-width", "1.2");
      grate.setAttribute("stroke-dasharray", "1 2");
      grate.setAttribute("stroke-linecap", "butt");
      grate.setAttribute("stroke-linejoin", "round");
      const title = document.createElementNS(ns, "title");
      title.textContent = editorText("cityEditor.messages.riverPassage", { value0: id });
      marker.append(title, grate);
      layer.append(marker);
    }
  }
  return layer;
}
