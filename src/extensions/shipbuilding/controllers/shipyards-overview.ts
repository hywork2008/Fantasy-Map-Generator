import { closeDialog, openDialog } from "../../../ui/dialogs/dialogService";
import { getShipClass } from "../generators/shipClasses";
import type { ShipyardCandidate } from "../generators/shipyardCandidates";
import { getCompletedHulls, getQueueEntry } from "../generators/shipyardQueue";
import { getWorldContext } from "../shipbuildingContext";
import {
  type ShipyardOverviewRow,
  setShipyardsOverviewState,
  useShipyardsOverviewState
} from "../store/shipyardsOverviewState";

function buildRows(candidates: readonly ShipyardCandidate[]): ShipyardOverviewRow[] {
  const { pack } = getWorldContext();
  const rows: ShipyardOverviewRow[] = [];

  for (const { burgId } of candidates) {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) continue;

    const entry = getQueueEntry(burgId);
    if (!entry) continue;

    const shipClass = getShipClass(entry.shipClassId);
    if (!shipClass) continue;

    const ownerId = entry.owner === "state" ? burg.state : burg.i;
    const ownerLabel =
      entry.owner === "state" ? (pack.states[ownerId!]?.name ?? "Unnamed state") : `${burg.name} (merchant)`;

    rows.push({
      burgId,
      burgName: burg.name || `Burg #${burgId}`,
      x: burg.x,
      y: burg.y,
      owner: entry.owner,
      ownerLabel,
      shipClassName: shipClass.name,
      progressPct: Math.floor((entry.progress / shipClass.buildPointsRequired) * 100),
      completedHulls: getCompletedHulls(entry.owner, ownerId!, shipClass.id)
    });
  }

  return rows;
}

export function openShipyardsOverview(
  candidates: readonly ShipyardCandidate[],
  onZoom: (x: number, y: number) => void
): void {
  setShipyardsOverviewState({ isOpen: true, rows: buildRows(candidates), onZoom });
  openDialog("ShipyardsOverviewDialog");
}

/** Called after every simulation tick so an already-open dialog reflects live build progress. */
export function refreshShipyardsOverviewIfOpen(candidates: readonly ShipyardCandidate[]): void {
  if (!useShipyardsOverviewState.getState().isOpen) return;
  setShipyardsOverviewState({ rows: buildRows(candidates) });
}

export function closeShipyardsOverview(): void {
  setShipyardsOverviewState({ isOpen: false });
  closeDialog("ShipyardsOverviewDialog");
}
