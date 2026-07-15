import { closeDialog, openDialog } from "../../../ui/dialogs/dialogService";
import { SHIPBUILDING_MATERIAL_IDS } from "../../hostTypes";
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

function getMaterialStatusLabel(burgId: number): string {
  const entry = getQueueEntry(burgId);
  if (!entry?.blockedReason) return "Supplied";
  if (entry.blockedReason === "economyUnavailable") return "Waiting: Economy disabled";
  if (entry.blockedReason === "noMarket") return "Waiting: no market";
  if (entry.blockedReason === "missingGood") return "Waiting: material Good unavailable";

  const missing = SHIPBUILDING_MATERIAL_IDS.flatMap(material => {
    const amount = entry.missingMaterials?.[material] ?? 0;
    return amount > 0 ? [`${material} ${amount.toFixed(2)}`] : [];
  });
  return missing.length ? `Waiting: ${missing.join(", ")}` : "Waiting: materials";
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
      materialStatus: getMaterialStatusLabel(burgId),
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
