import type { CityDocument } from "../types/document";
import { element, polygon } from "./svgPrimitives";

/** Area metadata stays visible and editable even while its temporary stalls are packed away. */
export function renderMarketAreas(document: CityDocument): SVGGElement {
  const group = element("g", { class: "ce-market-areas", "pointer-events": "none" }) as SVGGElement;
  for (const market of document.markets ?? []) {
    const closed = market.activity === "closed";
    const outline = element("path", {
      d: polygon(market.boundary),
      class: "ce-market-area",
      "data-market-id": market.id,
      fill: closed ? "rgba(100,90,75,0.07)" : "rgba(175,125,55,0.06)",
      stroke: closed ? "#777064" : "#9a713e",
      "stroke-width": "0.7",
      "stroke-dasharray": "4 2",
      "vector-effect": "non-scaling-stroke"
    });
    group.appendChild(outline);
  }
  return group;
}
