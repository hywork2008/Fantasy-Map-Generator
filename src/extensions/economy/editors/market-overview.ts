import { appServices } from "../../../context/appServices";
import { worldContext } from "../../../context/worldContext";
import { downloadFile, getFileName } from "../../../controllers/editors";
import type { Burg } from "../../../types/models";
import { formatPrice, rn } from "../../../utils";
import { applySorting, tip } from "../../../utils/uiHelpers";
import { Goods } from "../modules/goods-generator";
import type { Market } from "../modules/markets-generator";
import { Markets } from "../modules/markets-generator";
import { open as openMarketDealsOverview } from "./market-deals-overview";

let isInitialized = false;
let activeMarketId = 0;

export function open(marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  activeMarketId = marketId;
  marketOverviewAddLines();
  refreshNameInput(market);

  // dialog call removed

  if (!isInitialized) {
    document.getElementById("marketOverviewRefresh")!.addEventListener("click", marketOverviewAddLines);
    document.getElementById("marketOverviewExport")!.addEventListener("click", downloadStockCsv);
    document
      .getElementById("marketOverviewOpenDeals")!
      .addEventListener("click", () => openMarketDealsOverview(activeMarketId));
    document.getElementById("marketOverviewName")!.addEventListener("input", onRenameInput);
    document.getElementById("marketOverviewNameReset")!.addEventListener("click", resetMarketName);
    isInitialized = true;
  }
}

// The input shows the custom name (empty when using the default); the placeholder shows the default.
function refreshNameInput(market: Market): void {
  const input = document.getElementById("marketOverviewName") as HTMLInputElement;
  input.value = market.name || "";
  input.placeholder = worldContext.pack.burgs[market.centerBurgId]?.name || `Market ${market.i}`;
}

function onRenameInput(ev: Event): void {
  const target = ev.target as HTMLInputElement;
  const market = Markets.get(activeMarketId);
  if (!market) return;
  const value = target.value.trim();
  market.name = value || undefined;
  // Dialog call removed
}

function resetMarketName(): void {
  const market = Markets.get(activeMarketId);
  if (!market) return;
  market.name = undefined;
  (document.getElementById("marketOverviewName") as HTMLInputElement).value = "";
  // Dialog call removed
}

function marketOverviewAddLines() {
  const market = Markets.get(activeMarketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  const centerBurg = worldContext.pack.burgs[market.centerBurgId] as Burg | undefined;
  if (!centerBurg || centerBurg.removed) {
    tip("Invalid market. The selected market has no center burg", true, "error", 5000);
    return;
  }

  let lines = "";
  for (const [goodId, marketGood] of Object.entries(market.goods)) {
    const good = Goods.get(Number(goodId));
    if (!good) continue;
    const stroke = Goods.getStroke(good.color);

    lines += /*html*/ `<div class="states marketGood"
      data-good="${good.name}"
      data-stock="${rn(marketGood.stock, 2)}"
      data-price="${rn(marketGood.price, 2)}">
      <svg data-tip="Good icon" width="2em" height="2em" class="goodIcon">
        <circle cx="50%" cy="50%" r="42%" fill="${good.color}" stroke="${stroke}"/>
        <use href="#${good.icon}" x="10%" y="10%" width="80%" height="80%"/>
      </svg>
      <div data-tip="Good name" class="goodName">${good.name}</div>
      <div data-tip="Good stock" class="marketGoodStock">${rn(marketGood.stock, 2)}</div>
      <div data-tip="Good price" class="marketGoodPrice">${formatPrice(marketGood.price)}</div>
    </div>`;
  }
  document.getElementById("marketOverviewGoodsBody")!.innerHTML = lines || "No market goods available";

  const center = worldContext.pack.burgs[market.centerBurgId];
  const state = worldContext.pack.states[center?.state || 0];
  const coaId = `stateCOA${state.i}`;
  if (state && appServices.COArenderer) appServices.COArenderer.trigger(coaId, state.coa);

  document.getElementById("marketOverviewInfo")!.innerHTML =
    `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#${coaId}"></use></svg><b>Owner:</b> ${state.fullName || state.name}`;

  const burgs = worldContext.pack.burgs.filter(b => !b.removed && b.market === market.i);
  const totalUnits = Object.values(market.goods).reduce((sum, mg) => sum + mg.stock, 0);
  document.getElementById("marketOverviewSummary")!.innerHTML = /*html*/ `
    <div style="margin-left:5px">Cells: ${worldContext.pack.cells.market.reduce((count, m) => count + (m === market.i ? 1 : 0), 0)}</div>
    <div style="margin-left:12px">Burgs: ${burgs.length}</div>
    <div style="margin-left:12px">Stock: ${rn(totalUnits, 2)}</div>`;

  applySorting(document.getElementById("marketOverviewHeader")!);
  // dialog call removed
}

function downloadStockCsv() {
  const market = Markets.get(activeMarketId);
  if (!market) return;

  let csv = "Good,Stock,Buy Price,Sell Price\n";
  for (const [goodId, marketGood] of Object.entries(market.goods)) {
    const good = Goods.get(Number(goodId));
    if (!good) continue;
    const buyPrice = rn(Markets.customerBuyPrice(marketGood.price), 2);
    const sellPrice = rn(Markets.customerSellPrice(marketGood.price), 2);
    csv += `${[good.name, rn(marketGood.stock, 2), buyPrice, sellPrice].join(",")}\n`;
  }
  downloadFile(csv, `${getFileName("Market")}.csv`);
}
