import type { BaseType, Selection } from "d3";
import { curveBundle, line, max, min } from "d3";
import { viewContext } from "../context/viewContext";
import { C_12, getColorScheme } from "./colorUtils";
import type { Grid } from "./graphUtils";
import { getGridPolygon } from "./graphUtils";
import { normalize } from "./numberUtils";
import { round } from "./stringUtils";

/**
 * Drawing cell values and polygons for debugging purposes
 * @param {unknown[]} data - Array of data values corresponding to each cell
 * @param {{ cells: { p: number[][] } }} packedGraph - The packed graph object containing cell positions
 */
export const drawCellsValue = (data: unknown[], packedGraph: { cells: { p: number[][] } }): void => {
  viewContext.debug.selectAll("text").remove();
  viewContext.debug
    .selectAll("text")
    .data(data)
    .enter()
    .append("text")
    .attr("x", (_d: unknown, i: number) => packedGraph.cells.p[i][0])
    .attr("y", (_d: unknown, i: number) => packedGraph.cells.p[i][1])
    .text((d: unknown) => String(d));
};
/**
 * Drawing polygons colored according to data values for debugging purposes
 * @param {number[]} data - Array of numerical values corresponding to each cell
 * @param {Selection<BaseType, unknown, HTMLElement, unknown>} terrs - The SVG group element where the polygons will be drawn
 * @param {Grid} grid - The grid object
 */
export const drawPolygons = (
  data: number[],
  _terrs: Selection<BaseType, unknown, HTMLElement, unknown>,
  grid: Grid
): void => {
  const maximum: number = max(data) as number;
  const minimum: number = min(data) as number;
  const scheme = getColorScheme(viewContext.terrs.select("#landHeights").attr("scheme"));

  data = data.map(d => 1 - normalize(d, minimum, maximum));
  viewContext.debug.selectAll("polygon").remove();
  viewContext.debug
    .selectAll("polygon")
    .data(data)
    .enter()
    .append("polygon")
    .attr("points", (_d: number, i: number) => getGridPolygon(i, grid).join(" "))
    .attr("fill", (d: number) => scheme(d))
    .attr("stroke", (d: number) => scheme(d));
};

/**
 * Drawing route connections for debugging purposes
 * @param {{ cells: { p: number[][], routes: Record<number, Record<number, number>> } }} packedGraph - The packed graph object containing cell positions and routes
 */
export const drawRouteConnections = (packedGraph: {
  cells: { p: number[][]; routes: Record<number, Record<number, number>> };
}): void => {
  viewContext.debug.select("#connections").remove();
  const routes = viewContext.debug.append("g").attr("id", "connections").attr("stroke-width", 0.8);

  const points = packedGraph.cells.p;
  const links = packedGraph.cells.routes;

  for (const from in links) {
    for (const to in links[from]) {
      const [x1, y1] = points[from];
      const [x3, y3] = points[to];
      const [x2, y2] = [(x1 + x3) / 2, (y1 + y3) / 2];
      const routeId = links[from][to];

      routes
        .append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("data-id", routeId)
        .attr("stroke", C_12[routeId % 12]);
    }
  }
};

/**
 * Drawing a point for debugging purposes
 * @param {[number, number]} point - The [x, y] coordinates of the point to draw
 * @param {Object} options - Options for drawing the point
 * @param {string} options.color - Color of the point
 * @param {number} options.radius - Radius of the point
 */
export const drawPoint = ([x, y]: [number, number], { color = "red", radius = 0.5 }): void => {
  viewContext.debug.append("circle").attr("cx", x).attr("cy", y).attr("r", radius).attr("fill", color);
};

/**
 * Drawing a path for debugging purposes
 * @param {[number, number][]} points - Array of [x, y] coordinates representing the path
 * @param {Object} options - Options for drawing the path
 * @param {string} options.color - Color of the path
 * @param {number} options.width - Stroke width of the path
 */
export const drawPath = (points: [number, number][], { color = "red", width = 0.5 }): void => {
  const lineGen = line().curve(curveBundle);
  viewContext.debug
    .append("path")
    .attr("d", round(lineGen(points) as string))
    .attr("stroke", color)
    .attr("stroke-width", width)
    .attr("fill", "none");
};
