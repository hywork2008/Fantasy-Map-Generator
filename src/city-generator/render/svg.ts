// GenerationResult → SVG. Pure DOM building; the UI owns pan/zoom (it transforms
// `.cg-viewport`) and which stage is visible (`showFamily` / `showGridStage` /
// `showStep`).
//
// Local frame is +Y = north; SVG y grows downward, so every y is negated here to
// render north-up.

import type { Building, GenerationResult, Overlay, Point, Precinct, SnapshotPath } from "../core/types";
import {
  BUILDING,
  BUILDING_CASTLE,
  BUILDING_TEMPLE,
  GATE,
  PALETTE,
  PRECINCT_FILL,
  QUAY,
  RIVER,
  RIVER_TRACK,
  ROAD,
  SHORELINE,
  STREET,
  TAG_FILL,
  TOWER,
  WALL,
  WARD_FILL
} from "./palette";

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

/** Metadata attached to visible SVG features for the click Inspector. */
export interface SvgPickInfo {
  layer: string;
  kind: string;
  id?: number | string;
  label: string;
  [key: string]: unknown;
}

export type SvgPickHandler = (info: SvgPickInfo | null, element: Element | null) => void;

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
      g.appendChild(
        pickable(cellPath(cell.polygon, cell.onBorder ? PALETTE.cellEdge : PALETTE.cell, half), {
          layer: "grid",
          kind: "cell",
          id: cell.id,
          label: `grid cell #${cell.id}`,
          stage: stage.label,
          site: cell.site,
          centroid: cell.centroid,
          neighbors: cell.neighbors,
          onBorder: cell.onBorder
        })
      );
    }
    if (opts.showSites) {
      for (const cell of stage.cells) {
        g.appendChild(
          pickable(el("circle", { cx: cell.site[0], cy: -cell.site[1], r: half / 260, fill: PALETTE.site }), {
            layer: "grid",
            kind: "site",
            id: cell.id,
            label: `grid site #${cell.id}`,
            stage: stage.label,
            position: cell.site
          })
        );
      }
    }
    gridWrap.appendChild(g);
  });
  // River overlay, always visible in the grid family so the Grid-evolution slider
  // can be scrubbed against it. The walk ran on the last Lloyd mesh; when a
  // river was folded back, the final "River-aligned" stage's edges sit on this
  // overlay, and the earlier stages show the offset the fold closed.
  gridWrap.appendChild(riverTrackOverlay(result, half, opts.showSites));
  viewport.appendChild(gridWrap);

  // --- drawing-process family (S0 grid → S3 urban) ---
  const stepWrap = el("g", { class: "cg-stepwrap" });
  stepWrap.style.display = opts.family === "step" ? "inline" : "none";
  result.steps.forEach((step, i) => {
    const g = el("g", { class: "cg-step", "data-step": String(i) });
    g.style.display = i === opts.stepIndex ? "inline" : "none";
    const lots = step.buildings.length > 0;
    for (const cell of step.cells) {
      const streetish = lots && (cell.tag === "urban" || cell.tag === "outskirts" || cell.tag === "shanty");
      const fill = streetish ? STREET : (cell.ward && WARD_FILL[cell.ward]) || TAG_FILL[cell.tag] || PALETTE.cell;
      const wardBit = cell.ward ? ` · ${cell.ward}` : "";
      g.appendChild(
        pickable(cellPath(cell.polygon, fill, half), {
          layer: "drawing-process",
          kind: "cell",
          id: cell.id,
          label: `${cell.tag}${wardBit} cell #${cell.id}`,
          stage: step.label,
          tag: cell.tag,
          ward: cell.ward,
          site: cell.site,
          centroid: cell.centroid,
          neighbors: cell.neighbors,
          onBorder: cell.onBorder
        })
      );
    }
    for (const [buildingIndex, building] of step.buildings.entries()) {
      g.appendChild(
        pickable(buildingNode(building, half), {
          layer: "buildings",
          kind: "building",
          id: buildingIndex,
          label: `${building.ward} building #${buildingIndex}`,
          stage: step.label,
          ward: building.ward,
          cellId: building.cellId
        })
      );
    }
    for (const precinct of step.precincts) {
      // On S7 the buildings already occupy citadel / temple / harbour cells;
      // only the plaza void still needs a precinct fill.
      if (lots && precinct.kind !== "plaza") continue;
      for (const cellId of precinct.cellIds) {
        // Use the stage's own cells: from S5 on they carry the street-folded
        // polygons, so the plaza void lines up with the straightened streets.
        const cell = step.cells.find(c => c.id === cellId);
        if (cell) {
          g.appendChild(
            pickable(precinctNode(cell.polygon, precinct, half), {
              layer: "precincts",
              kind: precinct.kind,
              id: precinct.label,
              label: precinct.label,
              stage: step.label,
              anchor: precinct.anchor,
              cellIds: precinct.cellIds
            })
          );
        }
      }
    }
    for (const [pathIndex, path] of step.paths.entries()) {
      g.appendChild(
        pickable(path.kind === "road" ? roadStroke(path, half) : bandStroke(path, half), {
          layer: "paths",
          kind: path.kind,
          id: pathIndex,
          label: `${path.kind} path #${pathIndex}`,
          stage: step.label,
          pointCount: path.points.length,
          meanWidth: mean(path.widths)
        })
      );
    }
    // Optional: the on-edge spine under the river band, so "the band follows the
    // cell edges" is checkable in the drawing-process view too.
    if (opts.showSites && step.paths.some(p => p.kind === "river")) {
      for (const [riverIndex, river] of result.riverPaths.entries()) {
        g.appendChild(
          pickable(edgeTrackLine(river.edgeTrack, half, 340, 0.5), {
            layer: "drawing-process",
            kind: "river_edge_track",
            id: riverIndex,
            label: `river #${riverIndex} raw edge track`,
            stage: step.label,
            pointCount: river.edgeTrack.length
          })
        );
      }
    }
    for (const [overlayIndex, overlay] of step.overlays.entries()) {
      g.appendChild(
        pickable(overlayNode(overlay, half), {
          layer: "overlays",
          kind: overlay.kind,
          id: overlayIndex,
          label: overlayLabel(overlay.kind, overlayIndex),
          stage: step.label,
          water: overlay.water ?? false,
          points: overlay.points
        })
      );
    }
    stepWrap.appendChild(g);
  });
  viewport.appendChild(stepWrap);

  if (opts.showRadius) {
    viewport.appendChild(
      pickable(
        el("circle", {
          cx: 0,
          cy: 0,
          r: result.params.cityRadiusMeters,
          fill: "none",
          stroke: PALETTE.radius,
          "stroke-width": half / 180,
          opacity: "0.7"
        }),
        {
          layer: "guides",
          kind: "city_radius",
          label: "city radius",
          radiusMeters: result.params.cityRadiusMeters
        }
      )
    );
  }

  return svg;
}

/** Decode the metadata written by `pickable`. Invalid or foreign SVG markup is
 * simply treated as not pickable. */
export function parsePickInfo(raw: string | null): SvgPickInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SvgPickInfo;
  } catch {
    return null;
  }
}

/** Add the click-to-inspect behaviour used by the City Generator UI. */
export function bindCityInspector(svg: SVGSVGElement, onPick: SvgPickHandler): void {
  svg.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const host = target?.closest<SVGElement>("[data-pick]");
    const selected = host && svg.contains(host) ? host : null;
    svg.querySelectorAll(".cg-is-selected").forEach(node => {
      node.classList.remove("cg-is-selected");
    });
    if (selected) selected.classList.add("cg-is-selected");
    onPick(selected ? parsePickInfo(selected.getAttribute("data-pick")) : null, selected);
  });
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

/** The river as a single wide stroke on the cell edges — no outline, so
 * confluences and the sea mouth (where it meets sea cells) read cleanly. */
function bandStroke(path: SnapshotPath, half: number): SVGElement {
  const width = Math.max(path.widths.reduce((a, b) => a + b, 0) / Math.max(path.widths.length, 1), half / 60);
  return el("path", {
    d: polylineData(path.points),
    fill: "none",
    stroke: RIVER.fill,
    "stroke-width": width,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
}

/** Extramural road — the parchment double line (dark casing under a light fill),
 * the same two-stroke technique as the river band at a smaller width. Intramural
 * streets (design §4.2 S5) are not drawn: they surface as S7 setback gaps. */
function roadStroke(path: SnapshotPath, half: number): SVGElement {
  const inner = Math.max(path.widths.reduce((a, b) => a + b, 0) / Math.max(path.widths.length, 1), half / 150);
  const g = el("g", {});
  for (const [stroke, width] of [
    [ROAD.casing, inner * 2.6],
    [ROAD.fill, inner]
  ] as [string, number][]) {
    g.appendChild(
      el("path", {
        d: polylineData(path.points),
        fill: "none",
        stroke,
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
  }
  return g;
}

/** Inspection overlay for the Grid-evolution view (design §4.3): per river, the
 * smoothed drawn centerline (dashed), the raw on-edge walk it came from, and —
 * when sites are shown — a node dot per cell-edge vertex. Plus the shoreline for
 * context. Sits on top of the bare mesh; unaffected by the stage slider. */
function riverTrackOverlay(result: GenerationResult, half: number, withNodes: boolean): SVGElement {
  const g = el("g", { class: "cg-grid-river" });
  if (result.shoreline) {
    g.appendChild(
      pickable(overlayNode({ kind: "shoreline", points: result.shoreline }, half), {
        layer: "grid-inspection",
        kind: "shoreline",
        label: "shoreline",
        points: result.shoreline
      })
    );
  }
  for (const [riverIndex, river] of result.riverPaths.entries()) {
    g.appendChild(
      pickable(
        el("path", {
          d: polylineData(river.points),
          fill: "none",
          stroke: RIVER_TRACK.smooth,
          "stroke-width": half / 320,
          "stroke-dasharray": `${half / 90} ${half / 150}`,
          "stroke-linecap": "round",
          opacity: "0.9"
        }),
        {
          layer: "grid-inspection",
          kind: "river_smooth_centerline",
          id: riverIndex,
          label: `river #${riverIndex} smoothed centerline`,
          cityBank: river.cityBank,
          pointCount: river.points.length,
          meanWidth: mean(river.widths)
        }
      )
    );
    g.appendChild(
      pickable(edgeTrackLine(river.edgeTrack, half, 240, 1), {
        layer: "grid-inspection",
        kind: "river_edge_track",
        id: riverIndex,
        label: `river #${riverIndex} raw edge track`,
        cityBank: river.cityBank,
        pointCount: river.edgeTrack.length
      })
    );
    if (withNodes) {
      for (const [nodeIndex, [x, y]] of river.edgeTrack.entries()) {
        g.appendChild(
          pickable(el("circle", { cx: x, cy: -y, r: half / 300, fill: RIVER_TRACK.node }), {
            layer: "grid-inspection",
            kind: "river_edge_node",
            id: nodeIndex,
            label: `river #${riverIndex} edge node #${nodeIndex}`,
            riverId: riverIndex,
            position: [x, y]
          })
        );
      }
    }
  }
  return g;
}

function edgeTrackLine(points: Point[], half: number, widthDivisor: number, opacity: number): SVGElement {
  return el("path", {
    d: polylineData(points),
    fill: "none",
    stroke: RIVER_TRACK.track,
    "stroke-width": half / widthDivisor,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    opacity: String(opacity)
  });
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
  if (overlay.kind === "wall" || overlay.kind === "citadelWall") {
    return el("path", {
      d: polylineData(overlay.points),
      fill: "none",
      stroke: WALL,
      "stroke-width": half / (overlay.kind === "citadelWall" ? 130 : 85),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    });
  }
  if (overlay.kind === "tower") {
    const [x, y] = overlay.points[0];
    return el("circle", {
      cx: x,
      cy: -y,
      r: half / 100,
      fill: TOWER,
      stroke: PALETTE.paper,
      "stroke-width": half / 350
    });
  }
  if (overlay.kind === "quay") {
    return el("path", {
      d: polylineData(overlay.points),
      fill: "none",
      stroke: QUAY,
      "stroke-width": half / 70,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: "0.9"
    });
  }
  if (overlay.kind === "gate") {
    const [x, y] = overlay.points[0];
    const g = el("g", {});
    const radius = half / 72;
    const colour = overlay.water ? RIVER.fill : GATE;
    g.appendChild(
      el("circle", { cx: x, cy: -y, r: radius, fill: PALETTE.paper, stroke: colour, "stroke-width": half / 210 })
    );
    g.appendChild(el("circle", { cx: x - radius * 1.5, cy: -y, r: radius * 0.45, fill: colour }));
    g.appendChild(el("circle", { cx: x + radius * 1.5, cy: -y, r: radius * 0.45, fill: colour }));
    return g;
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

function buildingNode(building: Building, half: number): SVGElement {
  const paint =
    building.ward === "castle" ? BUILDING_CASTLE : building.ward === "cathedral" ? BUILDING_TEMPLE : BUILDING;
  const strokeW = building.ward === "castle" ? 150 : building.ward === "cathedral" ? 200 : 280;
  return el("path", {
    d: polygonData(building.polygon),
    fill: paint.fill,
    stroke: paint.stroke,
    "stroke-width": half / strokeW,
    "stroke-linejoin": "round"
  });
}

function precinctNode(poly: Point[], precinct: Precinct, half: number): SVGElement {
  const attrs: Record<string, string | number> = {
    d: polygonData(poly),
    fill: PRECINCT_FILL[precinct.kind],
    opacity: precinct.kind === "plaza" ? "0.9" : "0.85",
    stroke: precinct.kind === "citadel" || precinct.kind === "harbor" ? WALL : PALETTE.cellStroke,
    "stroke-width": half / (precinct.kind === "citadel" ? 150 : 360),
    "stroke-linejoin": "round"
  };
  return el("path", attrs);
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

function pickable<T extends SVGElement>(node: T, info: SvgPickInfo): T {
  node.classList.add("cg-pickable");
  node.setAttribute("data-pick", encodeURIComponent(JSON.stringify(info)));
  node.style.cursor = "pointer";
  return node;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function overlayLabel(kind: Overlay["kind"], index: number): string {
  return `${kind.replace(/([A-Z])/g, " $1").toLowerCase()} #${index}`;
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}
