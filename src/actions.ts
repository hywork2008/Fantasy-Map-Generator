import * as d3 from "d3";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";

export function resetZoom(d = 1000) {
  const { svg, zoom } = viewContext;
  svg.transition().duration(d).call(zoom.transform, d3.zoomIdentity);
}

export function zoomTo(x: number, y: number, z = 8, d = 2000) {
  const { svg, zoom, svgWidth, svgHeight } = viewContext;
  const transform = d3.zoomIdentity.translate(x * -z + svgWidth / 2, y * -z + svgHeight / 2).scale(z);
  svg.transition().duration(d).call(zoom.transform, transform);
}

export function getWorldState() {
  const { pack, grid, seed, options, nameBases, biomesData, notes, style } = worldContext;
  return { pack, grid, seed, options, nameBases, biomesData, notes, style };
}
