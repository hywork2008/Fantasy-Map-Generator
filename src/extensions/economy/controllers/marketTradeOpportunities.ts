import { openDialog } from "../../hostUi";
import { downloadFile, formatPrice, getFileName, rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import {
  getMarketTradeOpportunitiesState,
  type MarketTradeOpportunityOption,
  type MarketTradeOpportunityRow,
  type MarketTradeOpportunitySort,
  setMarketTradeOpportunitiesState
} from "../store/marketTradeOpportunitiesState";

const DISTANCE_COST_FACTOR = 0.5;

export function open(selectedGoodId?: number): void {
  const goods = getWorldContext().pack.goods || [];
  const options: MarketTradeOpportunityOption[] = goods.map(good => ({ goodId: good.i, goodName: good.name }));
  const currentSelectedGoodId = getMarketTradeOpportunitiesState().selectedGoodId;
  const nextSelectedGoodId = selectedGoodId ?? currentSelectedGoodId ?? options[0]?.goodId ?? null;

  setMarketTradeOpportunitiesState({
    options,
    selectedGoodId: nextSelectedGoodId,
    sortBy: getMarketTradeOpportunitiesState().sortBy,
    sortDirection: getMarketTradeOpportunitiesState().sortDirection
  });

  refresh();
  openDialog("marketTradeOpportunities");
}

export function close(): void {
  setMarketTradeOpportunitiesState({ rows: [] });
}

export function refresh(): void {
  const selectedGoodId = getMarketTradeOpportunitiesState().selectedGoodId;
  if (selectedGoodId === null) {
    setMarketTradeOpportunitiesState({ rows: [] });
    return;
  }

  const good = Goods.get(selectedGoodId);
  if (!good) {
    setMarketTradeOpportunitiesState({ rows: [] });
    return;
  }
  const goodId = selectedGoodId;

  const rows: MarketTradeOpportunityRow[] = [];
  const markets = getWorldContext().pack.markets || [];
  const mapDiagonal = Math.hypot(getWorldContext().graphWidth, getWorldContext().graphHeight) || 1;

  for (const source of markets) {
    const sourceGood = source.goods[goodId];
    if (!sourceGood || sourceGood.stock <= 0) continue;

    const sourceCenter = getWorldContext().pack.burgs[source.centerBurgId];
    if (!sourceCenter) continue;

    for (const target of markets) {
      if (target.i === source.i) continue;
      const targetGood = target.goods[goodId];
      if (!targetGood) continue;

      const targetCenter = getWorldContext().pack.burgs[target.centerBurgId];
      if (!targetCenter) continue;

      const buyPrice = Markets.customerBuyPrice(sourceGood.price, source.centerBurgId, goodId);
      const sellPrice = Markets.customerSellPrice(targetGood.price, target.centerBurgId, goodId);
      const transportCost = getTransportCost(sourceCenter, targetCenter, mapDiagonal) * good.value;
      const unitProfit = rn(sellPrice - buyPrice - transportCost, 2);
      if (unitProfit <= 0) continue;

      const maxUnits = rn(sourceGood.stock, 2);
      rows.push({
        sourceMarketId: source.i,
        targetMarketId: target.i,
        sourceMarketName: Markets.getName(source),
        targetMarketName: Markets.getName(target),
        buyPrice: rn(buyPrice, 2),
        sellPrice: rn(sellPrice, 2),
        transportCost: rn(transportCost, 2),
        unitProfit,
        maxUnits,
        totalProfit: rn(unitProfit * maxUnits, 2)
      });
    }
  }

  rows.sort((a, b) => b.totalProfit - a.totalProfit || b.unitProfit - a.unitProfit);
  setMarketTradeOpportunitiesState({ rows: rows.slice(0, 200) });
}

function getTransportCost(
  source: { x: number; y: number },
  target: { x: number; y: number },
  mapDiagonal: number
): number {
  const dx = Math.abs(source.x - target.x);
  const dy = Math.abs(source.y - target.y);
  const distance = dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx;
  return (distance / mapDiagonal) * DISTANCE_COST_FACTOR;
}

export function setSelectedGoodId(selectedGoodId: number): void {
  setMarketTradeOpportunitiesState({ selectedGoodId });
  refresh();
}

export function setSorting(sortBy: MarketTradeOpportunitySort): void {
  const { sortBy: currentSortBy, sortDirection } = getMarketTradeOpportunitiesState();
  const nextDirection =
    currentSortBy === sortBy ? sortDirection * -1 : sortBy === "source" || sortBy === "target" ? 1 : -1;
  setMarketTradeOpportunitiesState({ sortBy, sortDirection: nextDirection });
}

export function downloadCsv(): void {
  const selectedGoodId = getMarketTradeOpportunitiesState().selectedGoodId;
  const good = selectedGoodId === null ? null : Goods.get(selectedGoodId);
  if (!good) return;

  let csv = "Good,Buy Market,Sell Market,Buy Price,Sell Price,Transport Cost,Unit Profit,Max Units,Total Profit\n";
  for (const row of getMarketTradeOpportunitiesState().rows) {
    csv += [
      good.name,
      row.sourceMarketName,
      row.targetMarketName,
      formatPrice(row.buyPrice),
      formatPrice(row.sellPrice),
      formatPrice(row.transportCost),
      formatPrice(row.unitProfit),
      row.maxUnits,
      formatPrice(row.totalProfit)
    ].join(",");
    csv += "\n";
  }
  downloadFile(csv, `${getFileName(`${good.name}_Trade_Opportunities`)}.csv`);
}
