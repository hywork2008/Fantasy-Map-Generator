import type { Point } from "../../../generators/voronoi";
import { useOptionsState } from "../../../store/optionsState";
import type { Burg } from "../../../types/models";
import { openDialog } from "../../../ui/dialogs/dialogService";
import { rn } from "../../../utils";
import { getApi, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import type { Deal } from "../generators/markets-generator";
import { TradeAnimation, type TradeBatch } from "../generators/trade-animation";
import { clearHighlight, highlight } from "../renderers/draw-trade-animation";
import { setTradeDetailsState } from "../store/tradeDetailsState";

let activeBatch: TradeBatch | undefined;

export function open(batch: TradeBatch): void {
  if (!batch?.deals.length) return;

  activeBatch = batch;

  const { burgs } = getWorldContext().pack;
  const startBurg = burgs[batch.startBurgId];
  const endBurg = burgs[batch.endBurgId];
  if (!startBurg || !endBurg) return;
  const path = TradeAnimation.findRoutePath(startBurg.cell, endBurg.cell);
  if (!path) return;

  tradeDetailsAddLines(path.points);
  highlight(path.points);
  openDialog("tradeDetails");
}

export function closeTradeDetails(): void {
  setTradeDetailsState({ summary: null, rows: [], distance: "", totalUnits: 0, totalValue: 0 });
  clearHighlight();
}

function tradeDetailsAddLines(points: Point[]): void {
  if (!activeBatch) return;

  const batch = activeBatch;
  const { burgs } = getWorldContext().pack;
  const from = burgs[batch.startBurgId];
  const to = burgs[batch.endBurgId];
  const fromType = getClientType(batch.deals[0], from, "from");
  const toType = getClientType(batch.deals[0], to, "to");

  let totalUnits = 0;
  let totalValue = 0;
  const combined = new Map<number, { units: number; value: number }>();
  for (const deal of batch.deals) {
    const entry = combined.get(deal.good) ?? { units: 0, value: 0 };
    entry.units += deal.units;
    entry.value += deal.units * deal.price;
    combined.set(deal.good, entry);
    totalUnits += deal.units;
    totalValue += deal.units * deal.price;
  }

  const rows = Array.from(combined, ([goodId, { units, value }]) => {
    const good = Goods.get(goodId);
    if (!good) return null;
    const price = units ? value / units : 0;
    return {
      goodId,
      goodName: good.name,
      goodColor: good.color,
      goodStroke: Goods.getStroke(good.color),
      goodIcon: good.icon,
      units: rn(units, 2),
      price: rn(price, 2),
      value: rn(value, 2)
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  const length = rn(
    points.reduce((sum, p, i) => {
      if (i === 0) return 0;
      const prev = points[i - 1];
      return sum + Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    }, 0),
    2
  );

  const distUnit = useOptionsState.getState().distanceUnit || "km";

  setTradeDetailsState({
    summary: {
      sellerName: from?.name ?? "",
      sellerType: fromType,
      buyerName: to?.name ?? "",
      buyerType: toType,
      onZoomSeller: () => {
        const burg = getWorldContext().pack.burgs[batch.startBurgId];
        if (burg) getApi().zoomTo(burg.x, burg.y, 8, 1500);
      },
      onZoomBuyer: () => {
        const burg = getWorldContext().pack.burgs[batch.endBurgId];
        if (burg) getApi().zoomTo(burg.x, burg.y, 8, 1500);
      }
    },
    rows,
    distance: `${rn(length * getWorldContext().distanceScale)} ${distUnit}`,
    totalUnits: rn(totalUnits, 2),
    totalValue
  });
}

function getClientType(deal: Deal, burg: Burg, direction: "from" | "to"): string {
  const type = direction === "from" ? deal.sellerType : deal.buyerType;
  if (type === "market") return "market";
  return burg.group || "burg";
}

document.addEventListener("trade:showDetails", (e: Event) => {
  const batch = (e as CustomEvent<{ batch: TradeBatch }>).detail.batch;
  open(batch);
});
