import { offsetStrip } from "../../generators/freeform/wayGeometry";
import type { CityDocument, Tool } from "../../types/document";
import type { LandZone } from "../../types/freeformCity";
import type { Point } from "../../types/primitives";
import type { RenderSelection } from "../../types/selection";
import type { TerrainRiverCorridor } from "../../types/terrain";
import { renderCityElements } from "../cityElementsSvg";
import { getLandscapeGroundColor } from "../landscape";
import type { RenderContext } from "../renderContext";
import { frameScene } from "../sceneFrameSvg";
import { element, polygon } from "../svgPrimitives";
import { renderTerrainFieldOverlay } from "../terrainFieldSvg";

const ZONE_FILL: Record<LandZone["kind"], string> = {
  forest: "rgba(61, 107, 69, 0.45)",
  farm: "rgba(196, 176, 106, 0.5)",
  park: "rgba(125, 154, 106, 0.45)"
};

/** 2D view of a freeform city. Cells, edges, and ward paint are not drawn. */
export function renderFreeformCitySvg(
  document: CityDocument,
  tool: Tool,
  selection: RenderSelection,
  viewBox: string,
  zoom: number
): SVGSVGElement {
  const svg = element("svg", {
    viewBox,
    class: "ce-svg ce-svg--freeform",
    "aria-label": "City editor canvas",
    "data-freeform": "1"
  }) as SVGSVGElement;
  const ctx: RenderContext = {
    document,
    tool,
    selection,
    zoom,
    town: false,
    fixedMode: false,
    fixedGeometry: null,
    lightweight: false,
    minimal: false,
    hideBuildings: false,
    hideStreetLines: false,
    preview: false
  };
  for (const zone of document.freeform?.zones ?? []) {
    svg.appendChild(
      element("path", {
        d: polygon(zone.polygon),
        class: `ce-freeform-zone ce-freeform-zone--${zone.kind}`,
        fill: ZONE_FILL[zone.kind],
        stroke: "rgba(60, 70, 50, 0.45)",
        "stroke-width": "0.6",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none"
      })
    );
  }
  if (document.terrain?.field) svg.appendChild(renderTerrainFieldOverlay(document));
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "platform" || feature.role !== "pad" || feature.summit.kind !== "polygon") continue;
    svg.appendChild(
      element("path", {
        d: polygon(feature.summit.points),
        class: "ce-freeform-plot",
        fill: "rgba(120, 108, 90, 0.18)",
        stroke: "#5c5346",
        "stroke-width": "0.8",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none"
      })
    );
  }
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "riverCorridor") continue;
    const ring = riverRing(feature);
    if (ring.length < 3) continue;
    svg.appendChild(
      element("path", {
        d: polygon(ring),
        class: "ce-freeform-river",
        fill: "rgba(90, 140, 168, 0.85)",
        stroke: "rgba(40, 80, 110, 0.9)",
        "stroke-width": "0.6",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none"
      })
    );
  }
  renderCityElements(ctx, svg, new Set());
  svg.appendChild(element("g", { class: "ce-hover-layer", "pointer-events": "none" }));
  svg.appendChild(element("g", { class: "ce-measure-layer", "pointer-events": "none" }));
  frameScene(ctx, svg, element("g", { class: "ce-features" }) as SVGGElement, getLandscapeGroundColor(document), {
    core: true,
    regional: true
  });
  return svg;
}

function riverRing(corridor: TerrainRiverCorridor): Point[] {
  const half = Math.max(...corridor.widthsMeters) / 2;
  return offsetStrip(corridor.centerline, half);
}

/** Draft centre line or land polygon, drawn above the committed ledger. */
export function renderLedgerDraft(input: {
  kind: "river" | "zone";
  points: readonly Point[];
  widthMeters: number;
  ok: boolean;
}): SVGGElement {
  const group = element("g", { class: "ce-ledger-draft", "pointer-events": "none" }) as SVGGElement;
  const color = input.ok ? "#2e7d32" : "#c62828";
  if (input.kind === "zone" && input.points.length >= 3) {
    group.appendChild(
      element("path", {
        d: polygon([...input.points]),
        fill: color,
        "fill-opacity": "0.25",
        stroke: color,
        "stroke-width": "1.2",
        "stroke-dasharray": "2 1.5",
        "vector-effect": "non-scaling-stroke"
      })
    );
  } else if (input.kind === "river" && input.points.length >= 2) {
    const ring = offsetStrip(input.points, input.widthMeters / 2);
    if (ring.length >= 3) {
      group.appendChild(
        element("path", {
          d: polygon(ring),
          fill: color,
          "fill-opacity": "0.25",
          stroke: color,
          "stroke-width": "1.2",
          "stroke-dasharray": "2 1.5",
          "vector-effect": "non-scaling-stroke"
        })
      );
    }
  }
  return group;
}
