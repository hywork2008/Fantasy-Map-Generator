import { closeDialog, openDialog } from "../../hostUi";
import { getShipClass } from "../generators/shipClasses";
import { getHulls } from "../generators/shipyardQueue";
import type { ShipHull } from "../generators/shipyardQueueTypes";
import { getWorldContext } from "../shipbuildingContext";
import {
  emptySummary,
  setVesselAssetsOverviewState,
  useVesselAssetsOverviewState,
  type VesselAssetsOverviewRow,
  type VesselAssetsSummary
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

interface CaravanCargoSnapshot {
  label: string;
}

interface CaravanCargoRequest {
  caravanIds: number[];
  result?: Record<number, CaravanCargoSnapshot>;
}

function requestMerchantOperators(hulls: { id: number; burgId: number }[]): Record<number, MerchantOperatorSnapshot> {
  const detail: MerchantOperatorRequest = { hulls };
  document.dispatchEvent(new CustomEvent("fmg:economy-merchant-operator-snapshot-request", { detail }));
  return detail.result ?? {};
}

function requestCaravanCargoLabels(caravanIds: number[]): Record<number, CaravanCargoSnapshot> {
  if (!caravanIds.length) return {};
  const detail: CaravanCargoRequest = { caravanIds };
  document.dispatchEvent(new CustomEvent("fmg:economy-caravan-cargo-snapshot-request", { detail }));
  return detail.result ?? {};
}

function burgName(burgId: number | null | undefined): string {
  if (burgId == null || burgId <= 0) return "—";
  const { pack } = getWorldContext();
  return pack.burgs[burgId]?.name ?? `Burg #${burgId}`;
}

function statusLabelFor(hull: ShipHull): { label: string; sort: number } {
  if (hull.status === "maintenance") return { label: "Maintenance", sort: 4 };
  if (hull.status === "cargo") {
    if (hull.duty === "loading") return { label: "Loading", sort: 2 };
    return { label: "At sea", sort: 3 };
  }
  if (hull.status === "voyage" || hull.duty === "patrol") return { label: "Patrol", sort: 1 };
  return { label: "Idle", sort: 0 };
}

function locationLabelFor(hull: ShipHull): string {
  if (hull.status === "maintenance") {
    const port = hull.currentBurgId ?? hull.homeBurgId;
    return `Repairing at ${burgName(port)}`;
  }
  if (hull.status === "cargo") {
    if (hull.duty === "loading" && hull.currentBurgId != null) {
      return burgName(hull.currentBurgId);
    }
    const pct = Math.round(Math.max(0, Math.min(1, hull.routeProgress ?? 0)) * 100);
    const dest = hull.nextBurgId != null ? burgName(hull.nextBurgId) : "destination";
    return `At sea (${pct}% → ${dest})`;
  }
  if (hull.status === "voyage" || hull.duty === "patrol") {
    return "On patrol";
  }
  return burgName(hull.currentBurgId ?? hull.homeBurgId);
}

function buildRows(): { rows: VesselAssetsOverviewRow[]; summary: VesselAssetsSummary } {
  const { pack } = getWorldContext();
  const hulls = getHulls();
  const operators = requestMerchantOperators(
    hulls.filter(hull => hull.owner === "market").map(hull => ({ id: hull.id, burgId: hull.ownerId }))
  );
  const caravanIds = [
    ...new Set(hulls.map(h => h.caravanId).filter((id): id is number => typeof id === "number" && id > 0))
  ];
  const caravanCargo = requestCaravanCargoLabels(caravanIds);

  const summary = emptySummary();
  const rows: VesselAssetsOverviewRow[] = [];

  for (const hull of hulls) {
    const shipClass = getShipClass(hull.shipClassId);
    if (!shipClass) continue;

    summary.total++;
    if (hull.status === "docked") summary.docked++;
    else if (hull.status === "voyage") summary.voyage++;
    else if (hull.status === "cargo") summary.cargo++;
    else if (hull.status === "maintenance") summary.maintenance++;

    const isStateHull = hull.owner === "state";
    const merchant = isStateHull ? undefined : operators[hull.id];
    const ownerLabel = isStateHull
      ? (pack.states[hull.ownerId]?.name ?? "Unnamed state")
      : (merchant?.ownerLabel ?? pack.burgs[hull.ownerId]?.name ?? "Unnamed market");
    const operatorLabel = isStateHull
      ? "State navy"
      : [merchant?.organizationName, ...(merchant?.merchantNames ?? [])].filter(Boolean).join(" · ") ||
        "Market merchant fleet";

    const status = statusLabelFor(hull);
    const locationLabel = locationLabelFor(hull);
    const nextPortLabel =
      hull.nextBurgId != null && (hull.status === "cargo" || hull.duty === "loading" || hull.duty === "cargo")
        ? burgName(hull.nextBurgId)
        : "—";

    let cargoLabel = "—";
    if (hull.caravanId != null && hull.caravanId > 0) {
      const cargo = caravanCargo[hull.caravanId];
      cargoLabel = cargo?.label ? `Caravan #${hull.caravanId} · ${cargo.label}` : `Caravan #${hull.caravanId}`;
    }

    const navalCrew = isStateHull && hull.status !== "maintenance" ? shipClass.navalCrewCapacity : 0;
    summary.navalCrewCapacity += navalCrew;

    rows.push({
      key: `hull-${hull.id}`,
      hullId: hull.id,
      ownerLabel,
      operatorLabel,
      homePort: pack.burgs[hull.homeBurgId]?.name ?? "Unknown port",
      shipClassName: shipClass.name,
      statusLabel: status.label,
      locationLabel,
      nextPortLabel,
      cargoLabel,
      statusSort: status.sort,
      locationSort: locationLabel,
      nextPortSort: nextPortLabel,
      cargoSort: cargoLabel,
      navalCrewCapacity: navalCrew
    });
  }

  return { rows, summary };
}

export function openVesselAssetsOverview(): void {
  const { rows, summary } = buildRows();
  setVesselAssetsOverviewState({ isOpen: true, rows, summary });
  openDialog("VesselAssetsOverviewDialog");
}

export function refreshVesselAssetsOverviewIfOpen(): void {
  if (!useVesselAssetsOverviewState.getState().isOpen) return;
  const { rows, summary } = buildRows();
  setVesselAssetsOverviewState({ rows, summary });
}

export function closeVesselAssetsOverview(): void {
  setVesselAssetsOverviewState({ isOpen: false, rows: [], summary: emptySummary() });
  closeDialog("VesselAssetsOverviewDialog");
}
