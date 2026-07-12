import { type Point, useOptionsState } from "../../hostCore";
import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";

import { getApi, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import type { Caravan } from "../generators/marketTypes";
import { clearHighlight, highlight } from "../renderers/draw-trade-animation";
import { setTradeDetailsState } from "../store/tradeDetailsState";

let activeCaravan: Caravan | undefined;

export function open(caravan: Caravan): void {
  if (!caravan) return;

  activeCaravan = caravan;

  const { markets, burgs } = getWorldContext().pack;
  const sellerMarket = markets[caravan.seller];
  const buyerMarket = markets[caravan.buyer];
  if (!sellerMarket || !buyerMarket) return;
  const startBurg = burgs[sellerMarket.centerBurgId];
  const endBurg = burgs[buyerMarket.centerBurgId];
  if (!startBurg || !endBurg) return;

  const points = caravan.routeSegments
    .flatMap((s, idx) => (idx === 0 ? s.points : s.points.slice(1)))
    .map(p => [p[0], p[1]] as Point);

  tradeDetailsAddLines(points);
  highlight(points);
  openDialog("tradeDetails");
}

export function closeTradeDetails(): void {
  setTradeDetailsState({ summary: null, rows: [], distance: "", totalUnits: 0, totalValue: 0 });
  clearHighlight();
}

function tradeDetailsAddLines(_points: Point[]): void {
  if (!activeCaravan) return;

  const caravan = activeCaravan;
  const { burgs, markets } = getWorldContext().pack;
  const sellerMarket = markets[caravan.seller];
  const buyerMarket = markets[caravan.buyer];
  const from = burgs[sellerMarket.centerBurgId];
  const to = burgs[buyerMarket.centerBurgId];

  const rows = (caravan.payload || []).map(item => {
    const good = Goods.get(item.goodId);
    return {
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
      sellerType: "market",
      buyerName: to?.name ?? "",
      buyerType: "market",
      onZoomSeller: () => {
        if (from) getApi().zoomTo(from.x, from.y, 8, 1500);
      },
      onZoomBuyer: () => {
        if (to) getApi().zoomTo(to.x, to.y, 8, 1500);
      }
    },
    rows,
    distance: `${rn(caravan.totalDistance)} ${distUnit} (progress: ${Math.round((caravan.currentDistance / caravan.totalDistance) * 100)}%)`,
    totalUnits: rn(caravan.units, 2),
    totalValue: caravan.value
  });
}

document.addEventListener("trade:showDetails", (e: Event) => {
  const caravan = (e as CustomEvent<{ caravan: Caravan }>).detail.caravan;
  open(caravan);
});
