import type { Selection } from "d3";
import { curveBasisClosed, line } from "d3";
import { createLayerCanvas } from "../canvas/map-canvas";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import type { Vertices } from "../generators/voronoi";
import type { GridCells } from "../types/Grid";
import { clipPoly, P, rn, round } from "../utils";
import { ERROR, TIME } from "../utils/debug";

let cachedOceanPaths: { pathStr: string; opacity: number }[] = [];

class OceanModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  private cells: GridCells | null = null;
  private vertices: Vertices | null = null;
  private pointsN: number = 0;
  private used: Uint8Array = new Uint8Array(0);
  private lineGen = line().curve(curveBasisClosed);
  private oceanLayers: Selection<SVGGElement, unknown, null, undefined>;

  constructor(_oceanLayers: Selection<SVGGElement, unknown, null, undefined>) {
    this.oceanLayers = viewContext.oceanLayers;
  }

  randomizeOutline() {
    const limits = [];
    let odd = 0.2;
    for (let l = -9; l < 0; l++) {
      if (P(odd)) {
        odd = 0.2;
        limits.push(l);
      } else {
        odd *= 2;
      }
    }
    return limits;
  }

  // connect vertices to chain
  connectVertices(start: number, t: number) {
    const chain = []; // vertices chain to form a path
    for (let i = 0, current = start; i === 0 || (current !== start && i < 10000); i++) {
      const prev = chain[chain.length - 1]; // previous vertex in chain
      chain.push(current); // add current vertex to sequence
      const c = this.vertices!.c[current]; // cells adjacent to vertex
      c.filter((c: number) => this.cells!.t[c] === t).forEach((c: number) => {
        this.used[c] = 1;
      });
      const v = this.vertices!.v[current]; // neighboring vertices
      const c0 = !this.cells!.t[c[0]] || this.cells!.t[c[0]] === t - 1;
      const c1 = !this.cells!.t[c[1]] || this.cells!.t[c[1]] === t - 1;
      const c2 = !this.cells!.t[c[2]] || this.cells!.t[c[2]] === t - 1;
      if (v[0] !== undefined && v[0] !== prev && c0 !== c1) current = v[0];
      else if (v[1] !== undefined && v[1] !== prev && c1 !== c2) current = v[1];
      else if (v[2] !== undefined && v[2] !== prev && c0 !== c2) current = v[2];
      if (current === chain[chain.length - 1]) {
        ERROR && console.error("Next vertex is not found");
        break;
      }
    }
    chain.push(chain[0]); // push first vertex as the last one
    return chain;
  }

  // find eligible cell vertex to start path detection
  findStart(i: number, t: number) {
    if (this.cells!.b[i])
      return this.cells!.v[i].find((v: number) => this.vertices!.c[v].some((c: number) => c >= this.pointsN)); // map border cell
    return this.cells!.v[i][this.cells!.c[i].findIndex((c: number) => this.cells!.t[c] < t || !this.cells!.t[c])];
  }

  draw() {
    const { grid } = this.worldContext;
    const outline = this.oceanLayers.attr("layers");
    if (outline === "none") return;
    TIME && console.time("drawOceanLayers");
    this.oceanLayers.selectAll("path").remove();
    this.cells = grid.cells;
    this.pointsN = grid.cells.i.length;
    this.vertices = grid.vertices;
    const limits = outline === "random" ? this.randomizeOutline() : outline.split(",").map((s: string) => +s);

    const chains: [number, [number, number][]][] = [];
    const opacity = rn(0.4 / limits.length, 2);
    this.used = new Uint8Array(this.pointsN); // to detect already passed cells

    for (const i of this.cells!.i) {
      const t = this.cells!.t[i];
      if (t > 0) continue;
      if (this.used[i] || !limits.includes(t)) continue;
      const start = this.findStart(i, t);
      if (!start) continue;
      this.used[i] = 1;
      const chain = this.connectVertices(start, t); // vertices chain to form a path
      if (chain.length < 4) continue;
      const relax = 1 + t * -2; // select only n-th point
      const relaxed = chain.filter(
        (v, i) => !(i % relax) || this.vertices!.c[v].some((c: number) => c >= this.pointsN)
      );
      if (relaxed.length < 4) continue;

      const points = clipPoly(
        relaxed.map(v => this.vertices!.p[v]),
        worldContext.graphWidth,
        worldContext.graphHeight
      );
      chains.push([t, points]);
    }

    cachedOceanPaths = [];
    const ctx = createLayerCanvas(
      this.oceanLayers.node()!,
      this.worldContext.graphWidth,
      this.worldContext.graphHeight
    );
    ctx.fillStyle = "#ecf2f9";
    ctx.globalAlpha = opacity;
    for (const t of limits) {
      const layer = chains.filter(c => c[0] === t);
      const pathStr = layer.map(c => round(this.lineGen(c[1]) || "")).join("");
      if (pathStr) {
        ctx.fill(new Path2D(pathStr), "evenodd");
        cachedOceanPaths.push({ pathStr, opacity });
      }
    }
    ctx.globalAlpha = 1;

    TIME && console.timeEnd("drawOceanLayers");
  }
}

export const OceanLayers = () => new OceanModule(viewContext.oceanLayers).draw();

export function appendOceanPathsToSaveSVG(oceanLayersNode: Element | null) {
  if (!oceanLayersNode) return;
  for (const { pathStr, opacity } of cachedOceanPaths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathStr);
    path.setAttribute("fill", "#ecf2f9");
    path.setAttribute("opacity", String(opacity));
    oceanLayersNode.appendChild(path);
  }
}
