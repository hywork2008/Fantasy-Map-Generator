import { type Point, useOptionsState } from "../../hostCore";
import { openDialog } from "../../hostUi";
import { minmax, rn } from "../../hostUtils";

import { getApi, getMarkets, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import type { Caravan } from "../generators/marketTypes";
import { clearHighlight, highlight } from "../renderers/draw-trade-animation";
import { setTradeDetailsState } from "../store/tradeDetailsState";

let activeCaravan: Caravan | undefined;

export function open(caravan: Caravan): void {
  if (!caravan) return;

  activeCaravan = caravan;

  const markets = getMarkets();
  const { burgs } = getWorldContext().pack;
  const sellerMarket = caravan.sellerType === "market" ? markets[caravan.seller] : null;
  const buyerMarket = caravan.buyerType === "market" ? markets[caravan.buyer] : null;

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
  setTradeDetailsState({ summary: null, rows: [], distance: "", totalUnits: 0, totalValue: 0 });
  clearHighlight();
}

function tradeDetailsAddLines(): void {
  if (!activeCaravan) return;

  const caravan = activeCaravan;
  const { burgs } = getWorldContext().pack;
  const markets = getMarkets();

  const sellerMarket = caravan.sellerType === "market" ? markets[caravan.seller] : null;
  const buyerMarket = caravan.buyerType === "market" ? markets[caravan.buyer] : null;

  const from =
    caravan.sellerType === "burg" ? burgs[caravan.seller] : sellerMarket ? burgs[sellerMarket.centerBurgId] : null;

  const to = caravan.buyerType === "burg" ? burgs[caravan.buyer] : buyerMarket ? burgs[buyerMarket.centerBurgId] : null;

  const rows = (caravan.payload || []).map(item => {
    const good = Goods.get(item.goodId);
    return {
      dealId: item.dealId,
      goodId: item.goodId,
      goodName: good?.name ?? "Unknown",
      goodColor: good?.color ?? "#fff",
      goodStroke: good ? Goods.getStroke(good.color) : "#000",
      goodIcon: good?.icon ?? "",
      units: rn(item.units, 2),
      price: rn(item.value / item.units, 2),
      value: rn(item.value, 2)
    };
  });

  const distUnit = useOptionsState.getState().distanceUnit || "km";

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
    distance: `${rn(caravan.totalDistance)} ${distUnit} (progress: ${Math.round(minmax(caravan.currentDistance / caravan.totalDistance, 0, 1) * 100)}%)`,
    totalUnits: rn(caravan.units, 2),
    totalValue: caravan.value
  });
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
