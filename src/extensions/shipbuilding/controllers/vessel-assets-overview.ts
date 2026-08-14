import { closeDialog, openDialog } from "../../hostUi";
import { getShipClass } from "../generators/shipClasses";
import { getHulls } from "../generators/shipyardQueue";
import { getWorldContext } from "../shipbuildingContext";
import {
  setVesselAssetsOverviewState,
  useVesselAssetsOverviewState,
  type VesselAssetsOverviewRow
} from "../store/vesselAssetsOverviewState";

interface MerchantOperatorSnapshot {
  ownerLabel: string;
  organizationName?: string;
  merchantNames: string[];
}

interface MerchantOperatorRequest {
  hulls: { id: number; burgId: number }[];
  result?: Record<number, MerchantOperatorSnapshot>;
}

function requestMerchantOperators(hulls: { id: number; burgId: number }[]): Record<number, MerchantOperatorSnapshot> {
  const detail: MerchantOperatorRequest = { hulls };
  document.dispatchEvent(new CustomEvent("fmg:economy-merchant-operator-snapshot-request", { detail }));
  return detail.result ?? {};
}

function buildRows(): VesselAssetsOverviewRow[] {
  const { pack } = getWorldContext();
  const hulls = getHulls();
  const operators = requestMerchantOperators(
    hulls.filter(hull => hull.owner === "market").map(hull => ({ id: hull.id, burgId: hull.ownerId }))
  );
  const grouped = new Map<string, VesselAssetsOverviewRow>();

  for (const hull of hulls) {
    const shipClass = getShipClass(hull.shipClassId);
    if (!shipClass) continue;
    const homePort = pack.burgs[hull.homeBurgId]?.name ?? "Unknown port";
    const isStateHull = hull.owner === "state";
    const merchant = isStateHull ? undefined : operators[hull.id];
    const ownerLabel = isStateHull
      ? (pack.states[hull.ownerId]?.name ?? "Unnamed state")
      : (merchant?.ownerLabel ?? pack.burgs[hull.ownerId]?.name ?? "Unnamed market");
    const operatorLabel = isStateHull
      ? "State navy"
      : [merchant?.organizationName, ...(merchant?.merchantNames ?? [])].filter(Boolean).join(" · ") ||
        "Market merchant fleet";
    const key = [hull.owner, hull.ownerId, hull.homeBurgId, hull.shipClassId].join(":");
    const row = grouped.get(key) ?? {
      key,
      ownerLabel,
      operatorLabel,
      homePort,
      shipClassName: shipClass.name,
      docked: 0,
      voyage: 0,
      cargo: 0,
      maintenance: 0,
      total: 0,
      navalCrewCapacity: 0
    };
    row[hull.status]++;
    row.total++;
    if (isStateHull && hull.status !== "maintenance") row.navalCrewCapacity += shipClass.navalCrewCapacity;
    grouped.set(key, row);
  }

  return Array.from(grouped.values());
}

export function openVesselAssetsOverview(): void {
  setVesselAssetsOverviewState({ isOpen: true, rows: buildRows() });
  openDialog("VesselAssetsOverviewDialog");
}

export function refreshVesselAssetsOverviewIfOpen(): void {
  if (!useVesselAssetsOverviewState.getState().isOpen) return;
  setVesselAssetsOverviewState({ rows: buildRows() });
}

export function closeVesselAssetsOverview(): void {
  setVesselAssetsOverviewState({ isOpen: false });
  closeDialog("VesselAssetsOverviewDialog");
}
