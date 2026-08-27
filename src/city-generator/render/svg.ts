// GenerationResult → SVG. Pure DOM building; the UI owns pan/zoom (it transforms
// `.cg-viewport`) and stage visibility (`showStage`).
//
// Local frame is +Y = north; SVG y grows downward, so every y is negated here to
// render north-up.

import type { GenerationResult, Point } from "../core/types";
import { PALETTE } from "./palette";

const NS = "http://www.w3.org/2000/svg";

export interface RenderOptions {
  /** Grid stage to show initially (index into result.gridStages). */
  stageIndex: number;
  showSites: boolean;
  showRadius: boolean;
}

export function renderCity(result: GenerationResult, opts: RenderOptions): SVGSVGElement {
  const half = result.params.extentMeters / 2;
  const svg = el("svg", {
    xmlns: NS,
    viewBox: `${-half} ${-half} ${result.params.extentMeters} ${result.params.extentMeters}`,
    preserveAspectRatio: "xMidYMid meet"
  }) as SVGSVGElement;
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";

  const viewport = el("g", { class: "cg-viewport" });
  svg.appendChild(viewport);

  // Window outline.
  viewport.appendChild(
    el("rect", {
      x: -half,
      y: -half,
      width: result.params.extentMeters,
      height: result.params.extentMeters,
      fill: "none",
      stroke: PALETTE.cellStroke,
      "stroke-width": half / 220,
      "stroke-dasharray": `${half / 40} ${half / 40}`,
      opacity: "0.5"
    })
  );

  // One <g> per stage; the UI flips `display`.
  result.gridStages.forEach((stage, i) => {
    const g = el("g", { "data-stage": String(i), class: "cg-stage" });
    g.style.display = i === opts.stageIndex ? "inline" : "none";

    for (const cell of stage.cells) {
      g.appendChild(
        el("path", {
          d: pathData(cell.polygon),
          fill: cell.onBorder ? PALETTE.cellEdge : PALETTE.cell,
          stroke: PALETTE.cellStroke,
          "stroke-width": half / 400,
          "stroke-linejoin": "round"
        })
      );
    }

    if (opts.showSites) {
      for (const cell of stage.cells) {
        g.appendChild(el("circle", { cx: cell.site[0], cy: -cell.site[1], r: half / 260, fill: PALETTE.site }));
      }
    }

    viewport.appendChild(g);
  });

  if (opts.showRadius) {
    viewport.appendChild(
      el("circle", {
        cx: 0,
        cy: 0,
        r: result.params.cityRadiusMeters,
        fill: "none",
        stroke: PALETTE.radius,
        "stroke-width": half / 180,
        opacity: "0.7"
      })
    );
  }

  return svg;
}

/** Toggle which stage <g> is visible. */
export function showStage(svg: SVGSVGElement, stageIndex: number): void {
  for (const g of svg.querySelectorAll<SVGGElement>(".cg-stage")) {
    g.style.display = g.dataset.stage === String(stageIndex) ? "inline" : "none";
  }
}

function pathData(poly: Point[]): string {
  return `${poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(-y)}`).join(" ")}Z`;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}
