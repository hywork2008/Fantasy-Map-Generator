import {
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingProcurementStatus,
  type ShipbuildingProcurementStatusRequest
} from "../../hostTypes";
import { closeDialog, openDialog } from "../../hostUi";
import type { PortCapacity } from "../generators/portCapacity";
import { getShipClass, getShipSizeTier, type ShipSizeTier } from "../generators/shipClasses";
import type { ShipyardCandidate } from "../generators/shipyardCandidates";
import { getCompletedHulls, getHullsAtBurg, getQueueEntry } from "../generators/shipyardQueue";
import { getShipyardMaterialObservations } from "../generators/strategicMaterialObservations";
import { getWorldContext } from "../shipbuildingContext";
import {
  type ShipyardOverviewRow,
  setShipyardsOverviewState,
  useShipyardsOverviewState
} from "../store/shipyardsOverviewState";

const SIZE_ORDER: ShipSizeTier[] = ["small", "medium", "large"];

// Economy's `goods`/`markets` no longer augment PackedGraph's type (see
// src/extensions/economy/types.ts); read them structurally like
// strategicMaterialObservations.ts already does, without importing Economy.
type EconomyGoodSnapshot = Readonly<{ i: number; name: string }>;
type EconomyMarketSnapshot = Readonly<{
  i: number;
  goods: Readonly<Record<number, Readonly<{ stock: number; price: number }> | undefined>>;
}>;

function getEconomyGoodsAndMarkets(pack: unknown): {
  goods: readonly EconomyGoodSnapshot[];
  markets: readonly EconomyMarketSnapshot[];
} {
  const record = pack as Record<string, unknown>;
  return {
    goods: Array.isArray(record.goods) ? (record.goods as EconomyGoodSnapshot[]) : [],
    markets: Array.isArray(record.markets) ? (record.markets as EconomyMarketSnapshot[]) : []
  };
}

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

function getProcurementStatuses(
  stateId: number | undefined,
  destinationMarketId: number | undefined
): ShipbuildingProcurementStatus[] {
  if (!stateId || !destinationMarketId) return [];
  const detail: ShipbuildingProcurementStatusRequest = { stateId, destinationMarketId };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-strategic-procurement-status-request", { detail }));
  return detail.result ?? [];
}

function getStrategicMaterialSummary(
  shipClassId: string,
  marketId: number | undefined,
  procurementStatuses: readonly ShipbuildingProcurementStatus[]
): string {
  const { pack } = getWorldContext();
  const shipClass = getShipClass(shipClassId);
  if (!shipClass) return "Unavailable";

  const { goods, markets } = getEconomyGoodsAndMarkets(pack);
  const market = marketId === undefined ? undefined : markets.find(candidate => candidate.i === marketId);
  return getShipyardMaterialObservations(shipClass, goods, market?.goods, procurementStatuses)
    .map(observation => {
      const stock = observation.stock === null ? "—" : observation.stock.toFixed(2);
      const source = observation.sourceStateId
        ? `→${pack.states[observation.sourceStateId]?.name ?? "Unknown state"}`
        : "";
      const inTransit = observation.inTransit > 0 ? ` +${observation.inTransit.toFixed(2)} transit${source}` : "";
      return `${observation.material} ${stock}/${observation.annualDemand.toFixed(2)}/${observation.targetReserve.toFixed(2)}${inTransit}`;
    })
    .join(" · ");
}

function getProcurementStatusLabel(
  owner: "state" | "market",
  procurementStatuses: readonly ShipbuildingProcurementStatus[]
): string {
  if (owner === "market") return "Merchant queue";
  const transit = procurementStatuses
    .filter(status => status.inTransit > 0)
    .map(status => `${status.material} ${status.inTransit.toFixed(2)} in transit`);
  const blocked = procurementStatuses
    .filter(status => status.blockedReason)
    .map(status => `${status.material}: ${status.blockedReason}`);
  if (transit.length) return transit.join(", ");
  if (blocked.length) return `Blocked: ${blocked.join(", ")}`;
  return "No active order";
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
    const procurementStatuses = getProcurementStatuses(entry.owner === "state" ? burg.state : undefined, burg.market);

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
      strategicMaterialSummary: getStrategicMaterialSummary(shipClass.id, burg.market, procurementStatuses),
      procurementStatus: getProcurementStatusLabel(entry.owner, procurementStatuses),
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
