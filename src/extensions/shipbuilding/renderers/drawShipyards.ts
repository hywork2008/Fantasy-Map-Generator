import type { ShipyardCandidate } from "../generators/shipyardCandidates";
import { getShipyardsLayer, getWorldContext } from "../shipbuildingContext";

const MIN_RADIUS = 4;
const RADIUS_RANGE = 3;
const FILL = "#8b5a2b";
const STROKE = "#3e2412";

/** Renders a simple marker for each shipyard-candidate burg. Phase 1: display only, no interaction. */
export function drawShipyards(candidates: ShipyardCandidate[]): void {
  const layer = getShipyardsLayer();
  if (!layer) return;

  const { pack } = getWorldContext();

  const markup = candidates
    .map(({ burgId, forestRatio }) => {
      const burg = pack.burgs[burgId];
      if (!burg) return "";
      const radius = MIN_RADIUS + forestRatio * RADIUS_RANGE;
      return `<circle data-burg-id="${burgId}" cx="${burg.x}" cy="${burg.y}" r="${radius}" fill="${FILL}" stroke="${STROKE}" stroke-width="0.5"><title>Shipyard candidate (forest ratio: ${forestRatio})</title></circle>`;
    })
    .join("");

  layer.html(markup);
  layer.style("display", null);
}

export function clearShipyards(): void {
  getShipyardsLayer()?.html("").style("display", "none");
}
