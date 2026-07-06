import { getShipClass } from "../generators/shipClasses";
import type { ShipyardCandidate } from "../generators/shipyardCandidates";
import { getCompletedHulls, getQueueEntry } from "../generators/shipyardQueue";
import { getShipyardsLayer, getWorldContext } from "../shipbuildingContext";

const MIN_RADIUS = 4;
const RADIUS_RANGE = 3;
const FILL = "#8b5a2b";
const STROKE = "#3e2412";

function buildTooltip(burgId: number, forestRatio: number): string {
  const { pack } = getWorldContext();
  const burg = pack.burgs[burgId];
  const name = burg.name || `burg #${burgId}`;

  const entry = getQueueEntry(burgId);
  if (!entry) return `${name} shipyard candidate (forest ratio: ${forestRatio})`;

  const shipClass = getShipClass(entry.shipClassId);
  const ownerId = entry.owner === "state" ? burg.state : burg.i;
  const ownerLabel =
    entry.owner === "state"
      ? `${pack.states[ownerId!]?.name ?? "an unnamed state"}'s navy`
      : `${name}'s merchant fleet`;
  const progressPct = shipClass ? Math.floor((entry.progress / shipClass.buildPointsRequired) * 100) : 0;
  const completed = shipClass ? getCompletedHulls(entry.owner, ownerId!, shipClass.id) : 0;

  return `${name} shipyard — building ${shipClass?.name ?? entry.shipClassId} (${progressPct}%) for ${ownerLabel}. Completed hulls: ${completed}`;
}

/** Renders a marker for each shipyard-candidate burg, with a hover tooltip showing build progress. */
export function drawShipyards(candidates: ShipyardCandidate[]): void {
  const layer = getShipyardsLayer();
  if (!layer) return;

  const { pack } = getWorldContext();

  const markup = candidates
    .map(({ burgId, forestRatio }) => {
      const burg = pack.burgs[burgId];
      if (!burg) return "";
      const radius = MIN_RADIUS + forestRatio * RADIUS_RANGE;
      const tooltip = buildTooltip(burgId, forestRatio);
      return `<circle data-burg-id="${burgId}" cx="${burg.x}" cy="${burg.y}" r="${radius}" fill="${FILL}" stroke="${STROKE}" stroke-width="0.5"><title>${tooltip}</title></circle>`;
    })
    .join("");

  layer.html(markup);
  layer.style("display", null);
}

export function clearShipyards(): void {
  getShipyardsLayer()?.html("").style("display", "none");
}
