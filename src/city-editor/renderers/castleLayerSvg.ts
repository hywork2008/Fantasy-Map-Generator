import type { CityDocument } from "../types/document";
import { renderCastle } from "./castleSvg";
import { element } from "./svgPrimitives";
export function renderCastles(document: CityDocument, inspectedId?: string | number | null): SVGGElement {
  const layer = element("g", { class: "ce-castles" }) as SVGGElement;
  for (const castle of document.castles ?? []) {
    if (document.fortSite?.castleId === castle.id) continue;
    const circuit = document.defenseCircuits?.find(c => c.id === castle.circuitId);
    if (!circuit && !castle.siteFaceIds?.length) continue;
    layer.appendChild(renderCastle(document, castle, inspectedId));
  }
  return layer;
}
