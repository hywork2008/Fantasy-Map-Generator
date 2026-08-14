import { type Point, useOptionsState } from "../../hostCore";
import { openDialog } from "../../hostUi";
import { minmax, rn } from "../../hostUtils";

import { getApi, getMarketById, getMerchantOrganizations, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import type { Caravan, TradeRouteSegment } from "../generators/marketTypes";
import { MerchantTransportAssets } from "../generators/merchantTransportAssets";
import { getGoodCargoSlotsPerUnit } from "../generators/tradeCargo";
import { formatSailDecisionReason } from "../generators/tradeSailSchedule";
import { clearHighlight, highlight } from "../renderers/draw-trade-animation";
import { setTradeDetailsState } from "../store/tradeDetailsState";

let activeCaravan: Caravan | undefined;

export function open(caravan: Caravan): void {
  if (!caravan) return;

  activeCaravan = caravan;

  const { burgs } = getWorldContext().pack;
  const sellerMarket = caravan.sellerType === "market" ? getMarketById(caravan.seller) : null;
  const buyerMarket = caravan.buyerType === "market" ? getMarketById(caravan.buyer) : null;

  const startBurg =
    caravan.sellerType === "burg" ? burgs[caravan.seller] : sellerMarket ? burgs[sellerMarket.centerBurgId] : null;

  const endBurg =
    caravan.buyerType === "burg" ? burgs[caravan.buyer] : buyerMarket ? burgs[buyerMarket.centerBurgId] : null;

  if (!startBurg || !endBurg) return;

  const points = caravan.routeSegments
    .flatMap((s, idx) => (idx === 0 ? s.points : s.points.slice(1)))
    .map(p => [p[0], p[1]] as Point);

  tradeDetailsAddLines();
  highlight(points);
  openDialog("tradeDetails");
}

export function closeTradeDetails(): void {
  activeCaravan = undefined;
  setTradeDetailsState({
    summary: null,
    rows: [],
    distance: "",
    totalUnits: 0,
    totalValue: 0,
    transportSummaries: [],
    routeLegs: []
  });
  clearHighlight();
}

function tradeDetailsAddLines(): void {
  if (!activeCaravan) return;

  const caravan = activeCaravan;
  const { burgs } = getWorldContext().pack;
  const sellerMarket = caravan.sellerType === "market" ? getMarketById(caravan.seller) : null;
  const buyerMarket = caravan.buyerType === "market" ? getMarketById(caravan.buyer) : null;

  const from =
    caravan.sellerType === "burg" ? burgs[caravan.seller] : sellerMarket ? burgs[sellerMarket.centerBurgId] : null;

  const to = caravan.buyerType === "burg" ? burgs[caravan.buyer] : buyerMarket ? burgs[buyerMarket.centerBurgId] : null;

  const rows = (caravan.payload || []).map(item => {
    const good = Goods.get(item.goodId);
    const cargoSlotsPerUnit = item.cargoSlotsPerUnit ?? (good ? getGoodCargoSlotsPerUnit(good) : 0);
    return {
      dealId: item.dealId,
      goodId: item.goodId,
      goodName: good?.name ?? "Unknown",
      goodColor: good?.color ?? "#fff",
      goodStroke: good ? Goods.getStroke(good.color) : "#000",
      goodIcon: good?.icon ?? "",
      units: rn(item.units, 2),
      price: rn(item.value / item.units, 2),
      value: rn(item.value, 2),
      cargoSlotsPerUnit: rn(cargoSlotsPerUnit, 2),
      occupiedSlots: rn(item.units * cargoSlotsPerUnit, 2)
    };
  });
  const reservation = MerchantTransportAssets.getReservation(caravan.transportReservationId);
  const dispatcherMarket = reservation ? getMarketById(reservation.dispatcherMarketId) : undefined;
  const routeProgressPct =
    caravan.state === "transit" && caravan.totalDistance > 0
      ? Math.round(minmax(caravan.currentDistance / caravan.totalDistance, 0, 1) * 100)
      : null;
  const transportSummaries = (caravan.transportAllocations ?? []).map(allocation => {
    const hullLabels = (allocation.shipHullIds ?? []).map(hullId => {
      if (caravan.state === "loading") {
        return `Hull #${hullId} · loading at ${from?.name ?? "origin"}`;
      }
      if (routeProgressPct != null) {
        return `Hull #${hullId} · at sea ${routeProgressPct}% · bound for ${to?.name ?? "destination"}`;
      }
      return `Hull #${hullId}`;
    });
    return {
      mode: allocation.mode,
      transportName: allocation.transportName,
      unitCount: allocation.unitCount,
      usedSlots: rn(allocation.usedSlots, 2),
      capacitySlots: rn(allocation.capacitySlots, 2),
      freeSlots: rn(Math.max(0, allocation.capacitySlots - allocation.usedSlots), 2),
      utilization: allocation.capacitySlots > 0 ? allocation.usedSlots / allocation.capacitySlots : 0,
      assetSource:
        reservation && (allocation.mode === "land" || allocation.mode === "river" || allocation.shipHullIds?.length)
          ? [
              dispatcherMarket?.name ?? `Market ${reservation.dispatcherMarketId}`,
              ...(allocation.mode === "river"
                ? [`Transfers to ${buyerMarket?.name ?? to?.name ?? "destination"}`]
                : []),
              ...hullLabels
            ].join(" — ")
          : allocation.mode === "water"
            ? "Abstract allocation (no Shipbuilding hull)"
            : "Abstract allocation",
      reservationState:
        reservation && (allocation.mode === "land" || allocation.mode === "river" || allocation.shipHullIds?.length)
          ? reservation.state
          : undefined
    };
  });

  const distUnit = useOptionsState.getState().distanceUnit || "km";

  // Prefer planned loading capacity when the shipment is still accumulating at origin.
  const loadingCapacity = caravan.loading?.plannedCapacitySlots;
  if (caravan.state === "loading" && loadingCapacity && loadingCapacity > 0) {
    const usedSlots = rows.reduce((sum, row) => sum + row.occupiedSlots, 0);
    for (const summary of transportSummaries) {
      summary.capacitySlots = rn(loadingCapacity, 2);
      summary.usedSlots = rn(usedSlots, 2);
      summary.freeSlots = rn(Math.max(0, loadingCapacity - usedSlots), 2);
      summary.utilization = usedSlots / loadingCapacity;
      summary.assetSource = summary.assetSource ?? "Loading — assets reserved at departure";
    }
  }

  const organization = caravan.merchantOrganizationId
    ? getMerchantOrganizations().find(org => org.i === caravan.merchantOrganizationId)
    : undefined;
  const orgLabel = organization?.name ? ` · ${organization.name}` : "";
  const reasonLabel = caravan.departReason ? ` · ${formatSailDecisionReason(caravan.departReason)}` : "";

  const distanceLabel =
    caravan.state === "loading" && caravan.loading
      ? `${rn(caravan.totalDistance)} ${distUnit}${orgLabel}${reasonLabel} (loading day ${rn(caravan.loading.waitedDays, 1)}/${caravan.loading.maxWaitDays}, target ${Math.round(caravan.loading.targetUtilization * 100)}%, sail days ${(caravan.loading.sailScheduleDays ?? []).join("/") || "—"}${caravan.loading.nextSailDay ? `, next ${caravan.loading.nextSailDay}` : ""})`
      : `${rn(caravan.totalDistance)} ${distUnit}${orgLabel}${reasonLabel} (progress: ${Math.round(minmax(caravan.currentDistance / caravan.totalDistance, 0, 1) * 100)}%)`;

  setTradeDetailsState({
    summary: {
      sellerName: from?.name ?? "",
      sellerType: caravan.sellerType,
      buyerName: to?.name ?? "",
      buyerType: caravan.buyerType,
      onZoomSeller: () => {
        if (from) getApi().zoomTo(from.x, from.y, 8, 1500);
      },
      onZoomBuyer: () => {
        if (to) getApi().zoomTo(to.x, to.y, 8, 1500);
      }
    },
    rows,
    distance: distanceLabel,
    totalUnits: rn(caravan.units, 2),
    totalValue: caravan.value,
    transportSummaries,
    routeLegs: caravan.routeSegments.map(segment => ({
      mode: segment.type,
      distance: rn(getSegmentDistance(segment) * getWorldContext().distanceScale, 1)
    }))
  });
}

function getSegmentDistance(segment: TradeRouteSegment): number {
  let distance = 0;
  for (let index = 0; index < segment.points.length - 1; index++) {
    const [x1, y1] = segment.points[index];
    const [x2, y2] = segment.points[index + 1];
    distance += Math.hypot(x2 - x1, y2 - y1);
  }
  return distance;
}

document.addEventListener("trade:showDetails", (e: Event) => {
  const caravan = (e as CustomEvent<{ caravan: Caravan }>).detail.caravan;
  open(caravan);
});

// Keep the open dialog's rows/progress in sync with the caravan it's showing (the same
// object instance is mutated in place by Caravans.tick() every advanceTime() call) — the
// dialog otherwise has no way to learn that time has passed while it stayed open.
document.addEventListener("fmg:time-advanced", () => {
  if (!activeCaravan) return;
  if (!getApi().isDialogOpen("tradeDetails")) return;
  tradeDetailsAddLines();
});
