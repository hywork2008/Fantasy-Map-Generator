import { tip } from "../../hostServices";
import type { Burg } from "../../hostTypes";
import { openDialog } from "../../hostUi";
import { downloadFile, getFileName, rn } from "../../hostUtils";

import {
  getAppServices,
  getExportStagingLots,
  getMarketCellColumn,
  getMerchantOrganizations,
  getWorldContext
} from "../economyContext";
import {
  getBurgMarketLedger,
  getDominantMerchant,
  getMerchantName,
  syncBurgMarketLedgers
} from "../generators/burgMarketLedgers";
import { getFoodLedgerSummary } from "../generators/foodLedgerSummary";
import { Goods } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import type { TransportAssetOrder } from "../generators/marketTypes";
import { MerchantTradeCapital } from "../generators/merchantTradeCapital";
import { MerchantTransportAssets } from "../generators/merchantTransportAssets";
import { TradeLogisticsSettings } from "../generators/tradeLogisticsSettings";
import { TransportAssetOrders } from "../generators/transportAssetOrders";
import {
  type MarketOverviewBurgMerchantRow,
  type MarketOverviewRow,
  type MarketOverviewTransportAssetRow,
  type MarketOverviewTransportOrderRow,
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

export function getTransportAssetOrderBlueprints() {
  return TransportAssetOrders.getBlueprints();
}

export function createPlayerTransportOrder({
  blueprintId,
  quantity,
  budgetLimit
}: {
  blueprintId: TransportAssetOrder["blueprintId"];
  quantity: number;
  budgetLimit: number;
}): boolean {
  const order = TransportAssetOrders.createOrder({
    marketId: activeMarketId,
    blueprintId,
    quantity,
    budgetLimit,
    requestedBy: "player"
  });
  if (!order) {
    tip("Enter a positive whole quantity and a non-negative budget limit", true, "error", 5000);
    return false;
  }
  refreshMarketOverview();
  return true;
}

export function cancelTransportAssetOrder(orderId: number): boolean {
  if (!TransportAssetOrders.cancel(orderId)) return false;
  refreshMarketOverview();
  return true;
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
  const transportAssetRows: MarketOverviewTransportAssetRow[] = MerchantTransportAssets.getAvailability(market.i);
  const transportOrderRows: MarketOverviewTransportOrderRow[] = TransportAssetOrders.getOrders(market.i).map(order => {
    const blueprint = TransportAssetOrders.getBlueprints().find(candidate => candidate.id === order.blueprintId);
    const materials = blueprint
      ? Object.entries(blueprint.materialNames)
          .map(([name, units]) => `${name} ×${units * order.quantity}`)
          .join(", ")
      : "Unknown materials";
    const requiredWorkPoints = (blueprint?.requiredWorkPoints ?? 0) * order.quantity;
    return {
      id: order.id,
      requestedBy: order.requestedBy,
      blueprintName: blueprint ? formatTransportAssetName(blueprint.id) : order.blueprintId,
      quantity: order.quantity,
      completedQuantity: order.completedQuantity,
      workPoints: order.workPoints,
      requiredWorkPoints,
      progressPercent: requiredWorkPoints ? Math.min(100, rn((order.workPoints / requiredWorkPoints) * 100, 0)) : 0,
      materials,
      budgetLimit: order.budgetLimit,
      fundedAmount: order.fundedAmount,
      status: order.status,
      blockedReason: order.blockedReason
    };
  });
  const transportCargoCapacitySlots = transportAssetRows.reduce(
    (sum, row) => sum + row.total * row.cargoCapacitySlots,
    0
  );
  const transportReadyCapacitySlots = transportAssetRows.reduce(
    (sum, row) => sum + row.available * row.cargoCapacitySlots,
    0
  );
  const occupiedTransportSlots = transportAssetRows.reduce(
    (sum, row) => sum + (row.reserved + row.inTransit) * row.cargoCapacitySlots,
    0
  );

  MerchantTradeCapital.ensureTradeCapital(market);
  const tradeWorkingCapital = market.marketTreasury?.tradeWorkingCapital ?? 0;
  const tradeCapitalLocked = market.marketTreasury?.tradeCapitalLocked ?? 0;
  const tradeCapitalAvailable = Math.max(0, tradeWorkingCapital - tradeCapitalLocked);

  const stagingLots = getExportStagingLots().filter(lot => lot.marketId === market.i && lot.units > 0);
  const exportStagingUnits = stagingLots.reduce((sum, lot) => sum + lot.units, 0);
  const exportStagingValue = stagingLots.reduce((sum, lot) => sum + lot.units * lot.unitCost, 0);
  const organization = getMerchantOrganizations().find(org => org.homeMarketId === market.i);
  const foodLedger = getFoodLedgerSummary(market.foodLedger);

  setMarketOverviewState({
    marketId: market.i,
    name: market.name || "",
    defaultName: centerBurg.name || `Market ${market.i}`,
    owner: state ? { coaId, name: state.fullName || state.name } : null,
    rows,
    burgMerchantRows,
    transportAssetRows,
    transportOrderRows,
    cellsCount: getMarketCellColumn().reduce((count, marketCellId) => count + (marketCellId === market.i ? 1 : 0), 0),
    burgsCount: burgs.length,
    totalStock: rn(totalUnits, 2),
    agTechStockPercent: rn((market.agTechStock ?? 0) * 100, 0),
    transportCargoCapacitySlots,
    transportReadyCapacitySlots,
    transportUtilizationPercent: transportCargoCapacitySlots
      ? rn((occupiedTransportSlots / transportCargoCapacitySlots) * 100, 0)
      : 0,
    tradeWorkingCapital: rn(tradeWorkingCapital, 2),
    tradeCapitalLocked: rn(tradeCapitalLocked, 2),
    tradeCapitalAvailable: rn(tradeCapitalAvailable, 2),
    exportStagingLotCount: stagingLots.length,
    exportStagingUnits: rn(exportStagingUnits, 2),
    exportStagingValue: rn(exportStagingValue, 2),
    merchantOrganizationName: organization?.name ?? "",
    sailScheduleLabel: `Days ${TradeLogisticsSettings.getOptions().sailDays.join(" / ")} each month`,
    foodLedger: foodLedger
      ? {
          localProduction: rn(foodLedger.localProduction, 2),
          quarterlyNeed: rn(foodLedger.quarterlyNeed, 2),
          importedFood: rn(foodLedger.importedFood, 2),
          importSharePercent: rn(foodLedger.importShare * 100, 1),
          reserveGap: rn(foodLedger.reserveGap, 2),
          stock: rn(foodLedger.stock, 2),
          stockMonths: rn(foodLedger.stockMonths, 1)
        }
      : null
  });
}

function formatTransportAssetName(assetId: TransportAssetOrder["blueprintId"]): string {
  return assetId === "pack-train" ? "Pack train" : `${assetId[0].toUpperCase()}${assetId.slice(1)}`;
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
        topMerchantId: dominant?.characterId,
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
    const buyPrice = rn(Markets.customerBuyPrice(marketGood.price, market.centerBurgId, good.i), 2);
    const sellPrice = rn(Markets.customerSellPrice(marketGood.price, market.centerBurgId, good.i), 2);
    csv += `${[good.name, rn(marketGood.stock, 2), buyPrice, sellPrice].join(",")}\n`;
  }
  downloadFile(csv, `${getFileName("Market")}.csv`);
}
