import {
  FIXED_SITE_CROSSING_BUDGETS,
  fixedCrossingsMatchFrame,
  validFixedBurgCrossings
} from "../../utils/fixedBurgCrossings";
import type { BurgSiteDescriptor } from "../core/gen/site/burgSiteDescriptor";
import { drawFixedBurgCrossings } from "./fixedBurgCrossings";

/** Read-only imported geometry preview, separate from the generated street mesh. */
export function renderFixedSitePreview(site: BurgSiteDescriptor): SVGSVGElement | null {
  if (
    !site.fixedCrossings ||
    !validFixedBurgCrossings(site.fixedCrossings, FIXED_SITE_CROSSING_BUDGETS) ||
    !fixedCrossingsMatchFrame(site.fixedCrossings, site.frame)
  )
    return null;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const group = document.createElementNS(ns, "g");
  if (!drawFixedBurgCrossings(group, site.fixedCrossings, FIXED_SITE_CROSSING_BUDGETS)) return null;
  const extent = site.frame.extentMeters;

  svg.setAttribute("viewBox", `${-extent / 2} ${-extent / 2} ${extent} ${extent}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "180");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Imported fixed river crossings");
  svg.setAttribute("overflow", "hidden");
  const title = document.createElementNS(ns, "title");
  title.textContent = "Imported fixed river crossings";
  svg.appendChild(title);
  group.setAttribute("transform", "scale(1,-1)");
  svg.appendChild(group);
  const center = document.createElementNS(ns, "circle");
  center.setAttribute("cx", "0");
  center.setAttribute("cy", "0");
  center.setAttribute("r", String(extent / 150));
  center.setAttribute("fill", "#b33939");
  svg.appendChild(center);
  return svg;
}
