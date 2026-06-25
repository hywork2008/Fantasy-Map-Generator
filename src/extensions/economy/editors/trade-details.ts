import { zoomTo } from "../../../actions";
import { worldContext } from "../../../context/worldContext";
import type { Burg } from "../../../modules/burgs-generator";
import type { Point } from "../../../modules/voronoi";
import { openDialog } from "../../../ui/dialogs/dialogService";
import { formatPrice, rn } from "../../../utils";
import { applySorting } from "../../../utils/uiHelpers";
import { Goods } from "../modules/goods-generator";
import type { Deal } from "../modules/markets-generator";
import { TradeAnimation, type TradeBatch } from "../modules/trade-animation";
import { clearHighlight, highlight } from "../renderers/draw-trade-animation";

let isInitialized = false;
let activeBatch: TradeBatch | undefined;

export function open(batch: TradeBatch): void {
  if (!batch?.deals.length) return;

  activeBatch = batch;

  const { burgs } = worldContext.pack;
  const startBurg = burgs[batch.startBurgId];
  const endBurg = burgs[batch.endBurgId];
  if (!startBurg || !endBurg) return;
  const path = TradeAnimation.findRoutePath(startBurg.cell, endBurg.cell);
  if (!path) return;

  tradeDetailsAddLines(path.points);
  highlight(path.points);
  openDialog("tradeDetails");

  if (!isInitialized) {
    document.getElementById("tradeDetailsSummary")!.addEventListener("click", event => {
      const zoomEl = (event.target as HTMLElement).closest<HTMLElement>("[data-zoom]");
      if (!activeBatch || !zoomEl) return;
      const burgId = activeBatch[zoomEl.dataset.zoom === "start" ? "startBurgId" : "endBurgId"];
      const burg = worldContext.pack.burgs[burgId];
      if (!burg) return;
      zoomTo(burg.x, burg.y, 8, 1500);
    });
    isInitialized = true;
  }
}

export function closeTradeDetails(): void {
  document.getElementById("tradeDetailsBody")!.innerHTML = "";
  document.getElementById("tradeDetailsSummary")!.innerHTML = "";
  clearHighlight();
}

function tradeDetailsAddLines(points: Point[]): void {
  if (!activeBatch) return;

  const from = worldContext.pack.burgs[activeBatch.startBurgId];
  const to = worldContext.pack.burgs[activeBatch.endBurgId];
  const fromType = getClientType(activeBatch.deals[0], from, "from");
  const toType = getClientType(activeBatch.deals[0], to, "to");

  document.getElementById("tradeDetailsSummary")!.innerHTML = /* html */ `
    <span><b>Seller</b>: ${from?.name} ${fromType} <span class="icon-dot-circled pointer" data-zoom="start" data-tip="Zoom to start"></span></span>
    <span style="margin-left:5px"><b>Buyer</b>: ${to?.name} ${toType} <span class="icon-dot-circled pointer" data-zoom="end" data-tip="Zoom to end"></span></span>`;

  let totalUnits = 0;
  let totalValue = 0;
  const combined = new Map<number, { units: number; value: number }>();
  for (const deal of activeBatch.deals) {
    const entry = combined.get(deal.good) ?? { units: 0, value: 0 };
    entry.units += deal.units;
    entry.value += deal.units * deal.price;
    combined.set(deal.good, entry);
    totalUnits += deal.units;
    totalValue += deal.units * deal.price;
  }

  const html = Array.from(combined, ([goodId, { units, value }]) => {
    const good = Goods.get(goodId);
    if (!good) return "";
    const price = units ? value / units : 0;

    return /* html */ `<div class="states tradeDeal" data-good="${good.name}" data-units="${rn(units, 2)}" data-price="${price}" data-value="${rn(value, 2)}">
    <svg data-tip="Good icon" width="2em" height="2em" class="goodIcon">
      <circle cx="50%" cy="50%" r="42%" fill="${good.color}" stroke="${Goods.getStroke(good.color)}"/>
      <use href="#${good.icon}" x="10%" y="10%" width="80%" height="80%"></use>
    </svg>
    <div data-tip="Good name" class="goodName">${good.name}</div>
    <div class="goodUnits">${rn(units, 2)}</div>
    <div class="goodPrice">${formatPrice(rn(price, 2))}</div>
    <div class="goodValue">${formatPrice(rn(value, 2))}</div>
  </div>`;
  });

  const length = rn(
    points.reduce((sum, p, i) => {
      if (i === 0) return 0;
      const prev = points[i - 1];
      return sum + Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    }, 0),
    2
  );
  document.getElementById("tradeDetailsBody")!.innerHTML = html.join("");
  document.getElementById("tradeDetailsFooterDistance")!.innerHTML =
    `${rn(length * worldContext.distanceScale)} ${distanceUnitInput.value}`;
  document.getElementById("tradeDetailsFooterUnits")!.innerHTML = String(rn(totalUnits, 2));
  document.getElementById("tradeDetailsFooterValue")!.innerHTML = formatPrice(totalValue);

  applySorting(document.getElementById("tradeDetailsHeader")!);
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
