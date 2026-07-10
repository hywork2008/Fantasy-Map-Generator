import { closeDialog, openDialog } from "../../../ui/dialogs/dialogService";
import type { PortCapacity } from "../generators/portCapacity";
import { getShipClass, getShipSizeTier, type ShipSizeTier } from "../generators/shipClasses";
import type { ShipyardCandidate } from "../generators/shipyardCandidates";
import { getCompletedHulls, getHullsAtBurg, getQueueEntry } from "../generators/shipyardQueue";
import { getWorldContext } from "../shipbuildingContext";
import {
  type ShipyardOverviewRow,
  setShipyardsOverviewState,
  useShipyardsOverviewState
} from "../store/shipyardsOverviewState";

const SIZE_ORDER: ShipSizeTier[] = ["small", "medium", "large"];

function buildPortOccupancyLabel(
  burgId: number,
  portCapacity: ReadonlyMap<number, PortCapacity>
): {
  label: string;
  atSeaCount: number;
} {
  const hulls = getHullsAtBurg(burgId);
  const dockedBySize: Record<ShipSizeTier, number> = { small: 0, medium: 0, large: 0 };
  let atSeaCount = 0;

  for (const hull of hulls) {
    const shipClass = getShipClass(hull.shipClassId);
    if (!shipClass) continue;
    if (hull.status === "voyage") {
      atSeaCount++;
      continue;
    }
    dockedBySize[getShipSizeTier(shipClass)]++;
  }

  const capacity = portCapacity.get(burgId);
  const label = SIZE_ORDER.map(size => `${dockedBySize[size]}/${capacity?.[size] ?? 0} ${size}`).join(", ");

  return { label, atSeaCount };
}

function buildRows(
  candidates: readonly ShipyardCandidate[],
  portCapacity: ReadonlyMap<number, PortCapacity>
): ShipyardOverviewRow[] {
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

    const { label: portOccupancyLabel, atSeaCount } = buildPortOccupancyLabel(burgId, portCapacity);

    rows.push({
      burgId,
      burgName: burg.name || `Burg #${burgId}`,
      x: burg.x,
      y: burg.y,
      owner: entry.owner,
      ownerLabel,
      shipClassName: shipClass.name,
      progressPct: Math.floor((entry.progress / shipClass.buildPointsRequired) * 100),
      completedHulls: getCompletedHulls(entry.owner, ownerId!, shipClass.id),
      portOccupancyLabel,
      atSeaCount
    });
  }

  return rows;
}

export function openShipyardsOverview(
  candidates: readonly ShipyardCandidate[],
  portCapacity: ReadonlyMap<number, PortCapacity>,
  onZoom: (x: number, y: number) => void
): void {
  setShipyardsOverviewState({ isOpen: true, rows: buildRows(candidates, portCapacity), onZoom });
  openDialog("ShipyardsOverviewDialog");
}

/** Called after every simulation tick so an already-open dialog reflects live build progress. */
export function refreshShipyardsOverviewIfOpen(
  candidates: readonly ShipyardCandidate[],
  portCapacity: ReadonlyMap<number, PortCapacity>
): void {
  if (!useShipyardsOverviewState.getState().isOpen) return;
  setShipyardsOverviewState({ rows: buildRows(candidates, portCapacity) });
}

export function closeShipyardsOverview(): void {
  setShipyardsOverviewState({ isOpen: false });
  closeDialog("ShipyardsOverviewDialog");
}
