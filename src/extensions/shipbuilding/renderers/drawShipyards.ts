import { color } from "d3";
import type { ShipbuildingMaterialBlockedReason } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getShipClass } from "../generators/shipClasses";
import type { ShipyardCandidate } from "../generators/shipyardCandidates";
import { getCompletedHulls, getQueueEntry } from "../generators/shipyardQueue";
import type { ShipyardQueueEntry } from "../generators/shipyardQueueTypes";
import { getShipyardsLayer, getWorldContext } from "../shipbuildingContext";

const MIN_RADIUS = 5;
const RADIUS_RANGE = 2.5;
// Same brown as the "Sloop"/"Caravel"/"Galleon" goods (goods-generator.ts), so the marker
// reads as the same maritime-timber hue used for ship icons elsewhere on the map.
const FILL = "#654321";
const STROKE = color(FILL)?.darker(2).formatHex() ?? "#2a1b0e";
const IDLE_OPACITY = 0.55;
const BLOCKED_STROKE = "#c0392b";

const BLOCKED_REASON_LABELS: Record<ShipbuildingMaterialBlockedReason, string> = {
  economyUnavailable: "economy extension disabled",
  noMarket: "no local market",
  missingGood: "goods catalogue missing entry",
  insufficientMaterials: "insufficient materials"
};

function buildTooltip(burgId: number, forestRatio: number, entry: ShipyardQueueEntry | undefined): string {
  const { pack } = getWorldContext();
  const burg = pack.burgs[burgId];
  const name = burg.name || `burg #${burgId}`;

  if (!entry) return `${name} shipyard candidate (forest ratio: ${forestRatio})`;

  const shipClass = getShipClass(entry.shipClassId);
  const ownerId = entry.owner === "state" ? burg.state : burg.i;
  const ownerLabel =
    entry.owner === "state"
      ? `${pack.states[ownerId!]?.name ?? "an unnamed state"}'s navy`
      : `${name}'s merchant fleet`;
  const progressPct = shipClass ? Math.floor((entry.progress / shipClass.buildPointsRequired) * 100) : 0;
  const completed = shipClass ? getCompletedHulls(entry.owner, ownerId!, shipClass.id) : 0;
  const blockedNote = entry.blockedReason ? ` — blocked (${BLOCKED_REASON_LABELS[entry.blockedReason]})` : "";

  return `${name} shipyard — building ${shipClass?.name ?? entry.shipClassId} (${progressPct}%) for ${ownerLabel}. Completed hulls: ${completed}${blockedNote}`;
}

/**
 * Renders a marker for each shipyard-candidate burg: a "good-ships" longship glyph (the
 * same symbol used by the Economy extension's ship goods, src/index.html defs) on a
 * timber-brown badge, instead of a flat dot. Burgs with an active build queue render at
 * full opacity; bare candidates with no queued hull are dimmed. A red ring flags a queue
 * blocked on missing materials.
 */
export function drawShipyards(candidates: ShipyardCandidate[]): void {
  const layer = getShipyardsLayer();
  if (!layer) return;

  const { pack } = getWorldContext();

  const markup = candidates
    .map(({ burgId, forestRatio }) => {
      const burg = pack.burgs[burgId];
      if (!burg) return "";

      const entry = getQueueEntry(burgId);
      const radius = MIN_RADIUS + forestRatio * RADIUS_RANGE;
      const iconSize = rn(radius * 1.6, 1);
      const iconOffset = rn(iconSize / 2, 1);
      const tooltip = buildTooltip(burgId, forestRatio, entry);
      const opacity = entry ? 1 : IDLE_OPACITY;
      const stroke = entry?.blockedReason ? BLOCKED_STROKE : STROKE;

      return (
        `<g data-burg-id="${burgId}" opacity="${opacity}">` +
        `<title>${tooltip}</title>` +
        `<circle cx="${burg.x}" cy="${burg.y}" r="${radius}" fill="${FILL}" stroke="${stroke}" stroke-width="0.6"/>` +
        `<use href="#good-ships" x="${rn(burg.x - iconOffset, 1)}" y="${rn(burg.y - iconOffset, 1)}" width="${iconSize}" height="${iconSize}"/>` +
        `</g>`
      );
    })
    .join("");

  layer.html(markup);
  layer.style("display", null);
}

export function clearShipyards(): void {
  getShipyardsLayer()?.html("").style("display", "none");
}
