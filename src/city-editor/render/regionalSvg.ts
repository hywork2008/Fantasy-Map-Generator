import { pointInPolygon } from "../core/gen/geom";
import type { CityDocument } from "../core/types";

/** Reference-only geographic symbols, never editable mesh cells or dwelling data. */
export function renderRegionalSettlements(city: CityDocument): SVGGElement {
  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  layer.setAttribute("class", "ce-regional-settlements");
  const scene = city.sceneRegions;
  if (!scene) return layer;
  for (const settlement of scene.regionalContext.settlements) {
    if (pointInPolygon(settlement.center, scene.coreBoundary)) continue;
    const group = document.createElementNS(ns, "g");
    group.setAttribute("data-regional-burg", String(settlement.burgId));
    group.setAttribute("data-representation", settlement.representation);
    group.setAttribute(
      "data-pick",
      encodeURIComponent(
        JSON.stringify({
          layer: "regional",
          kind: "settlement",
          id: `regional-${settlement.burgId}`,
          label: settlement.name,
          representation: settlement.representation
        })
      )
    );
    const shape = document.createElementNS(ns, "path");
    const [x, y] = settlement.center;
    const r = settlement.radiusMeters ?? 1;
    shape.setAttribute(
      "d",
      settlement.outline
        ? `${settlement.outline.map((p, i) => `${i ? "L" : "M"}${p[0]} ${-p[1]}`).join(" ")} Z`
        : `M${x - r} ${-y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`
    );
    shape.setAttribute("fill", "#c9bea8");
    shape.setAttribute("stroke", "#685e4e");
    shape.setAttribute("stroke-width", "2");
    if (settlement.representation === "estimated") shape.setAttribute("stroke-dasharray", "6 4");
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(-y - r - 8));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "16");
    label.setAttribute("fill", "#3f392e");
    label.textContent = settlement.name;
    group.append(shape, label);
    layer.append(group);
  }
  return layer;
}
