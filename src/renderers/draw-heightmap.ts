import type { CurveFactory } from "d3";
import {
  color,
  curveBasis,
  curveBasisClosed,
  curveBasisOpen,
  curveCardinal,
  curveCardinalClosed,
  curveCardinalOpen,
  curveCatmullRom,
  curveCatmullRomClosed,
  curveCatmullRomOpen,
  curveLinear,
  curveLinearClosed,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  line,
  range
} from "d3";
import { createLayerCanvas } from "../canvas/map-canvas";
import { HeightThreshold } from "../config/constants";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Vertices } from "../modules/voronoi";
import { round } from "../utils";
import { getColor, getColorScheme } from "../utils/colorUtils";
import { ERROR, TIME } from "../utils/debug";
import type { GridCells } from "../utils/graphUtils";
import type { IRenderer } from "./core/IRenderer";

const CURVE_MAP: Record<string, CurveFactory> = {
  curveBasis,
  curveBasisClosed,
  curveBasisOpen,
  curveCardinal,
  curveCardinalClosed,
  curveCardinalOpen,
  curveCatmullRom,
  curveCatmullRomClosed,
  curveCatmullRomOpen,
  curveLinear,
  curveLinearClosed,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore
};

export const HeightmapRenderer: IRenderer = {
  id: "heightmap",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("HeightmapRenderer");
    const { grid, graphWidth, graphHeight } = worldContext;
    const { terrs } = viewContext;

    const ocean = terrs.select<SVGGElement>("#oceanHeights");
    const land = terrs.select<SVGGElement>("#landHeights");

    ocean.selectAll("*").remove();
    land.selectAll("*").remove();

    const paths: (string | undefined)[] = new Array(101);
    const { cells, vertices } = grid;
    const used = new Uint8Array(cells.i.length);
    const heights = Array.from(cells.i).sort((a, b) => (cells.h[a] as number) - (cells.h[b] as number));

    // ocean cells
    const renderOceanCells = Boolean(+ocean.attr("data-render"));
    if (renderOceanCells) {
      const skip = +ocean.attr("skip") + 1 || 1;
      const relax = +ocean.attr("relax") || 0;
      const curveType = ocean.attr("curve") || "curveBasisClosed";
      const lineGen = line().curve(CURVE_MAP[curveType] ?? curveBasisClosed);

      let currentLayer = 0;
      for (const i of heights) {
        const h = cells.h[i];
        if (h > currentLayer) currentLayer += skip;
        if (h < currentLayer) continue;
        if (currentLayer >= HeightThreshold.WATER_MAX_HEIGHT) break;
        if (used[i]) continue; // already marked
        const onborder = cells.c[i].some((n: number) => cells.h[n] < h);
        if (!onborder) continue;
        const vertex = cells.v[i].find((v: number) => vertices.c[v].some((i: number) => (cells.h[i] as number) < h));
        const chain = connectVertices(cells, vertices, vertex!, h, used);
        if (chain.length < 3) continue;
        const points = simplifyLine(chain, relax).map((v: number) => vertices.p[v]);
        if (!paths[h]) paths[h] = "";
        paths[h] += round(lineGen(points) || "");
      }
    }

    // land cells
    {
      const skip = +land.attr("skip") + 1 || 1;
      const relax = +land.attr("relax") || 0;
      const curveType = land.attr("curve") || "curveBasisClosed";
      const lineGen = line().curve(CURVE_MAP[curveType] ?? curveBasisClosed);

      let currentLayer = HeightThreshold.WATER_MAX_HEIGHT;
      for (const i of heights) {
        const h = cells.h[i];
        if (h > currentLayer) currentLayer += skip;
        if (h < currentLayer) continue;
        if (currentLayer > HeightThreshold.HEIGHT_MAX) break; // no layers possible with height > 100
        if (used[i]) continue; // already marked
        const onborder = cells.c[i].some((n: number) => cells.h[n] < h);
        if (!onborder) continue;

        const startVertex = cells.v[i].find((v: number) =>
          vertices.c[v].some((i: number) => (cells.h[i] as number) < h)
        );
        const chain = connectVertices(cells, vertices, startVertex!, h, used);
        if (chain.length < 3) continue;

        const points = simplifyLine(chain, relax).map((v: number) => vertices.p[v]);
        if (!paths[h]) paths[h] = "";
        paths[h] += round(lineGen(points) || "");
      }
    }

    // render paths to canvas inside foreignObject
    // SVG masks (mask:url(#land) on #landHeights), filters, and opacity on the
    // parent <g> elements are automatically applied to the canvas by the browser.
    const oceanCtx = createLayerCanvas(ocean.node()!, graphWidth, graphHeight);
    const landCtx = createLayerCanvas(land.node()!, graphWidth, graphHeight);

    for (const height of range(HeightThreshold.HEIGHT_MIN, HeightThreshold.HEIGHT_MAX + 1)) {
      const isOcean = height < HeightThreshold.WATER_MAX_HEIGHT;
      const group = isOcean ? ocean : land;
      const ctx = isOcean ? oceanCtx : landCtx;
      const scheme = getColorScheme(group.attr("scheme"));
      const terracing = +group.attr("terracing") / 10 || 0;

      if (height === HeightThreshold.HEIGHT_MIN && renderOceanCells) {
        ctx.fillStyle = scheme(1);
        ctx.fillRect(0, 0, graphWidth, graphHeight);
      }

      if (height === HeightThreshold.WATER_MAX_HEIGHT) {
        ctx.fillStyle = scheme(0.8);
        ctx.fillRect(0, 0, graphWidth, graphHeight);
      }

      if (!paths[height] || paths[height]!.length < 10) continue;
      const fillColor = getColor(height, scheme);
      const path2d = new Path2D(paths[height]!);

      if (terracing) {
        ctx.save();
        ctx.translate(0.7, 1.4);
        ctx.fillStyle = color(fillColor)!.darker(terracing).toString();
        ctx.fill(path2d, "evenodd");
        ctx.restore();
      }
      ctx.fillStyle = fillColor;
      ctx.fill(path2d, "evenodd");
    }

    // connect vertices to chain: specific case for heightmap
    function connectVertices(
      cells: GridCells,
      vertices: Vertices,
      start: number,
      h: number,
      used: Uint8Array
    ): number[] {
      const MAX_ITERATIONS = vertices.c.length;

      const n = cells.i.length;
      const chain: number[] = []; // vertices chain to form a path
      for (let i = 0, current = start; i === 0 || (current !== start && i < MAX_ITERATIONS); i++) {
        const prev = chain[chain.length - 1]; // previous vertex in chain
        chain.push(current); // add current vertex to sequence
        const c = vertices.c[current]; // cells adjacent to vertex
        c.filter((c: number) => cells.h[c] === h).forEach((c: number) => {
          used[c] = 1;
        });
        const c0 = c[0] >= n || cells.h[c[0]] < h;
        const c1 = c[1] >= n || cells.h[c[1]] < h;
        const c2 = c[2] >= n || cells.h[c[2]] < h;
        const v = vertices.v[current]; // neighboring vertices
        if (v[0] !== prev && c0 !== c1) current = v[0];
        else if (v[1] !== prev && c1 !== c2) current = v[1];
        else if (v[2] !== prev && c0 !== c2) current = v[2];
        if (current === chain[chain.length - 1]) {
          ERROR && console.error("Next vertex is not found");
          break;
        }
      }
      return chain;
    }

    function simplifyLine(chain: number[], simplification: number): number[] {
      if (!simplification) return chain;
      const n = simplification + 1; // filter each nth element
      return chain.filter((_d, i) => i % n === 0);
    }

    TIME && console.timeEnd("HeightmapRenderer");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    const { terrs } = viewContext;
    terrs.select<SVGGElement>("#oceanHeights").selectAll("*").remove();
    terrs.select<SVGGElement>("#landHeights").selectAll("*").remove();
  }
};
