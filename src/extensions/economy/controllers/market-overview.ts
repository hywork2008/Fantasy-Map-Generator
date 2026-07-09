import { tip } from "../../hostServices";
import type { Burg } from "../../hostTypes";
import { openDialog } from "../../hostUi";
import { downloadFile, getFileName, rn } from "../../hostUtils";

import { getAppServices, getWorldContext } from "../economyContext";
import {
  getBurgMarketLedger,
  getDominantMerchant,
  getMerchantName,
  syncBurgMarketLedgers
} from "../generators/burgMarketLedgers";
import { Goods } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import {
  type MarketOverviewBurgMerchantRow,
  type MarketOverviewRow,
  setMarketOverviewState
} from "../store/marketOverviewState";
import { open as openMarketDealsOverview } from "./market-deals-overview";
import { open as openMarketTradeOpportunities } from "./marketTradeOpportunities";

let activeMarketId = 0;

export function open(marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  activeMarketId = marketId;
  openDialog("marketOverview", { marketId });
  refreshMarketOverview();
}

export function renameActiveMarket(name: string): void {
  const market = Markets.get(activeMarketId);
  if (!market) return;

  market.name = name.trim() || undefined;
  setMarketOverviewState({ name: market.name || "" });
}

export function resetActiveMarketName(): void {
  const market = Markets.get(activeMarketId);
  if (!market) return;

  market.name = undefined;
  setMarketOverviewState({ name: "" });
}

export function openActiveMarketDeals(): void {
  if (!activeMarketId) return;
  openMarketDealsOverview(activeMarketId);
}

export function openTradeOpportunities(): void {
  openMarketTradeOpportunities();
}

export function refreshMarketOverview(): void {
  const market = Markets.get(activeMarketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  const centerBurg = getWorldContext().pack.burgs[market.centerBurgId] as Burg | undefined;
  if (!centerBurg || centerBurg.removed) {
    tip("Invalid market. The selected market has no center burg", true, "error", 5000);
    return;
  }

  syncBurgMarketLedgers();

  const rows: MarketOverviewRow[] = [];
  for (const [goodId, marketGood] of Object.entries(market.goods)) {
    const good = Goods.get(Number(goodId));
    if (!good) continue;
    rows.push({
      goodId: good.i,
      goodName: good.name,
      goodColor: good.color,
      goodStroke: Goods.getStroke(good.color),
      goodIcon: good.icon,
      stock: rn(marketGood.stock, 2),
      price: rn(marketGood.price, 2)
    });
  }

  const center = getWorldContext().pack.burgs[market.centerBurgId];
  const state = getWorldContext().pack.states[center?.state || 0];
  const coaId = `stateCOA${state.i}`;
  const COArenderer = getAppServices().COArenderer;
  if (state && COArenderer) COArenderer.trigger(coaId, state.coa);

  const burgs = getWorldContext().pack.burgs.filter(b => !b.removed && b.market === market.i);
  const burgMerchantRows = getBurgMerchantRows(burgs);
  const totalUnits = Object.values(market.goods).reduce((sum, mg) => sum + mg.stock, 0);

  setMarketOverviewState({
    marketId: market.i,
    name: market.name || "",
    defaultName: centerBurg.name || `Market ${market.i}`,
    owner: state ? { coaId, name: state.fullName || state.name } : null,
    rows,
    burgMerchantRows,
    cellsCount: getWorldContext().pack.cells.market.reduce(
      (count, marketCellId) => count + (marketCellId === market.i ? 1 : 0),
      0
    ),
    burgsCount: burgs.length,
    totalStock: rn(totalUnits, 2)
  });
}

function getBurgMerchantRows(burgs: Burg[]): MarketOverviewBurgMerchantRow[] {
  return burgs
    .filter((burg): burg is Burg & { i: number } => Boolean(burg.i))
    .map(burg => {
      const ledger = getBurgMarketLedger(burg.i);
      const dominant = getDominantMerchant(ledger);
      const rivals =
        ledger?.merchants
          .filter(merchant => merchant.characterId !== dominant?.characterId)
          .sort((a, b) => b.share - a.share || b.revenue - a.revenue)
          .slice(0, 3)
          .map(merchant => `${getMerchantName(merchant.characterId)} ${merchant.share.toFixed(1)}%`)
          .join(", ") || "None";

      return {
        burgId: burg.i,
        burgName: burg.name || `Burg ${burg.i}`,
        topMerchantName: getMerchantName(dominant?.characterId),
        topShare: dominant?.share ?? 0,
        topRevenue: dominant?.revenue ?? 0,
        rivals
      };
    })
    .sort((a, b) => b.topRevenue - a.topRevenue || a.burgName.localeCompare(b.burgName));
}

export function downloadStockCsv(): void {
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
