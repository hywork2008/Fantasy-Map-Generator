import { type FixedCrossingBudgets, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";

const namespace = "http://www.w3.org/2000/svg";
/** Dedicated opt-in local-metre preview. The parent must map CE north-up coordinates
 * to the screen; no pixel minimum width, join smoothing or bank extension is applied. */
export function drawFixedBurgCrossings(group: SVGGElement, payload: unknown, budgets: FixedCrossingBudgets): boolean {
  group.replaceChildren();
  if (!validFixedBurgCrossings(payload, budgets)) return false;
  const fragment = group.ownerDocument.createDocumentFragment();
  for (const river of [...payload.rivers, ...(payload.obstacles ?? [])]) {
    const path = group.ownerDocument.createElementNS(namespace, "path");
    path.setAttribute("d", river.rings.map(ring => `M${ring.map(p => `${p[0]},${p[1]}`).join("L")}Z`).join(""));
    path.setAttribute("fill", "#79b7d1");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("data-river-id", String(river.id));
    fragment.appendChild(path);
  }
  for (const c of payload.crossings) {
    for (const [start, end] of [
      [c.approachA, c.deckA],
      [c.deckB, c.approachB]
    ]) {
      const approach = group.ownerDocument.createElementNS(namespace, "path");
      approach.setAttribute("d", `M${start[0]},${start[1]}L${end[0]},${end[1]}`);
      approach.setAttribute("fill", "none");
      approach.setAttribute("stroke", "#b6ac99");
      approach.setAttribute("stroke-width", String(payload.roadWidthMeters));
      approach.setAttribute("stroke-linecap", "butt");
      approach.setAttribute("data-crossing-approach", String(c.id));
      fragment.appendChild(approach);
    }
    const path = group.ownerDocument.createElementNS(namespace, "path");
    path.setAttribute("d", `M${c.deckA[0]},${c.deckA[1]}L${c.deckB[0]},${c.deckB[1]}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#d5cfbf");
    path.setAttribute("stroke-width", String(payload.roadWidthMeters));
    path.setAttribute("stroke-linecap", "butt");
    path.setAttribute("data-facility-id", String(c.id));
    path.setAttribute("data-geometry-version", String(c.geometryVersion));
    fragment.appendChild(path);
  }
  group.appendChild(fragment);
  return true;
}
