// GenerationResult → SVG. Pure DOM building; the UI owns pan/zoom (it transforms
// `.cg-viewport`) and which stage is visible (`showFamily` / `showGridStage` /
// `showStep`).
//
// Local frame is +Y = north; SVG y grows downward, so every y is negated here to
// render north-up.

import type { GenerationResult, Overlay, Point, SnapshotPath } from "../core/types";
import { GATE, PALETTE, RIVER, SHORELINE, TAG_FILL } from "./palette";

const NS = "http://www.w3.org/2000/svg";

export interface RenderOptions {
  /** Which family of `<g>` groups is visible. */
  family: "grid" | "step";
  /** Grid stage to show (index into result.gridStages); < 0 hides the grid family. */
  gridIndex: number;
  /** Drawing-process step to show (index into result.steps). */
  stepIndex: number;
  showSites: boolean;
  showRadius: boolean;
}

export function renderCity(result: GenerationResult, opts: RenderOptions): SVGSVGElement {
  const { extentMeters } = result.params;
  const half = extentMeters / 2;
  const svg = el("svg", {
    xmlns: NS,
    viewBox: `${-half} ${-half} ${extentMeters} ${extentMeters}`,
    preserveAspectRatio: "xMidYMid meet"
  }) as SVGSVGElement;
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";

  const viewport = el("g", { class: "cg-viewport" });
  svg.appendChild(viewport);

  viewport.appendChild(
    el("rect", {
      x: -half,
      y: -half,
      width: extentMeters,
      height: extentMeters,
      fill: "none",
      stroke: PALETTE.cellStroke,
      "stroke-width": half / 220,
      "stroke-dasharray": `${half / 40} ${half / 40}`,
      opacity: "0.5"
    })
  );

  // --- grid-evolution family (S0 sub-stages) ---
  const gridWrap = el("g", { class: "cg-gridwrap" });
  gridWrap.style.display = opts.family === "grid" ? "inline" : "none";
  result.gridStages.forEach((stage, i) => {
    const g = el("g", { class: "cg-stage", "data-stage": String(i) });
    g.style.display = i === opts.gridIndex ? "inline" : "none";
    for (const cell of stage.cells) {
      g.appendChild(cellPath(cell.polygon, cell.onBorder ? PALETTE.cellEdge : PALETTE.cell, half));
    }
    if (opts.showSites) {
      for (const cell of stage.cells) {
        g.appendChild(el("circle", { cx: cell.site[0], cy: -cell.site[1], r: half / 260, fill: PALETTE.site }));
      }
    }
    gridWrap.appendChild(g);
  });
  viewport.appendChild(gridWrap);

  // --- drawing-process family (S0 grid → S3 urban) ---
  const stepWrap = el("g", { class: "cg-stepwrap" });
  stepWrap.style.display = opts.family === "step" ? "inline" : "none";
  result.steps.forEach((step, i) => {
    const g = el("g", { class: "cg-step", "data-step": String(i) });
    g.style.display = i === opts.stepIndex ? "inline" : "none";
    for (const cell of step.cells) {
      g.appendChild(cellPath(cell.polygon, TAG_FILL[cell.tag] ?? PALETTE.cell, half));
    }
    for (const path of step.paths) {
      for (const stroke of bandStrokes(path, half)) g.appendChild(stroke);
    }
    for (const overlay of step.overlays) g.appendChild(overlayNode(overlay, half));
    stepWrap.appendChild(g);
  });
  viewport.appendChild(stepWrap);

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

export function showFamily(svg: SVGSVGElement, family: "grid" | "step"): void {
  setDisplay(svg.querySelector(".cg-gridwrap"), family === "grid");
  setDisplay(svg.querySelector(".cg-stepwrap"), family === "step");
}

export function showGridStage(svg: SVGSVGElement, gridIndex: number): void {
  for (const g of svg.querySelectorAll<SVGGElement>(".cg-stage")) {
    g.style.display = g.dataset.stage === String(gridIndex) ? "inline" : "none";
  }
}

export function showStep(svg: SVGSVGElement, stepIndex: number): void {
  for (const g of svg.querySelectorAll<SVGGElement>(".cg-step")) {
    g.style.display = g.dataset.step === String(stepIndex) ? "inline" : "none";
  }
}

function cellPath(poly: Point[], fill: string, half: number): SVGElement {
  return el("path", {
    d: polygonData(poly),
    fill,
    stroke: PALETTE.cellStroke,
    "stroke-width": half / 400,
    "stroke-linejoin": "round"
  });
}

/** A wide path drawn as two stacked strokes (dark outline + lighter fill). */
function bandStrokes(path: SnapshotPath, half: number): [SVGElement, SVGElement] {
  const width = Math.max(path.widths.reduce((a, b) => a + b, 0) / Math.max(path.widths.length, 1), half / 60);
  const d = polylineData(path.points);
  const common = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
  return [
    el("path", { ...common, stroke: RIVER.outline, "stroke-width": width + half / 90 }),
    el("path", { ...common, stroke: RIVER.fill, "stroke-width": width })
  ];
}

function overlayNode(overlay: Overlay, half: number): SVGElement {
  if (overlay.kind === "shoreline") {
    return el("path", {
      d: polylineData(overlay.points),
      fill: "none",
      stroke: SHORELINE,
      "stroke-width": half / 300,
      "stroke-dasharray": `${half / 45} ${half / 90}`,
      opacity: "0.8"
    });
  }
  return el("path", {
    d: polylineData(overlay.points),
    fill: "none",
    stroke: GATE,
    "stroke-width": half / 160,
    "stroke-linecap": "round",
    opacity: "0.85"
  });
}

function polygonData(poly: Point[]): string {
  return `${poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(-y)}`).join(" ")}Z`;
}

function polylineData(poly: Point[]): string {
  return poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(-y)}`).join(" ");
}

function setDisplay(node: Element | null, on: boolean): void {
  if (node instanceof SVGElement || node instanceof HTMLElement) node.style.display = on ? "inline" : "none";
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}
