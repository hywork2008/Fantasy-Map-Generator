import { openDialog } from "../../hostUi";
import { downloadFile, getFileName, rn } from "../../hostUtils";
import { getApi, getWorldContext } from "../economyContext";
import { Goods, isGoodEnabled } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import {
  getMarketsGoodCompareState,
  type MarketsGoodCompareOption,
  type MarketsGoodCompareRow,
  setMarketsGoodCompareState
} from "../store/marketsGoodCompareState";

export function open(): void {
  const goods = (getWorldContext().pack.goods || []).filter(isGoodEnabled);
  const options: MarketsGoodCompareOption[] = goods.map(good => ({ goodId: good.i, goodName: good.name }));
  const selectedGoodId = getMarketsGoodCompareState().selectedGoodId ?? options[0]?.goodId ?? null;

  setMarketsGoodCompareState({
    options,
    selectedGoodId,
    sortBy: getMarketsGoodCompareState().sortBy,
    sortDirection: getMarketsGoodCompareState().sortDirection
  });

  refresh();
  openDialog("marketsGoodCompare");
}

export function close(): void {
  setMarketsGoodCompareState({ rows: [], totalStock: 0, avgPrice: 0 });
}

export function refresh(): void {
  const selectedGoodId = getMarketsGoodCompareState().selectedGoodId;
  if (!selectedGoodId) {
    setMarketsGoodCompareState({ rows: [], totalStock: 0, avgPrice: 0 });
    return;
  }

  const rows: MarketsGoodCompareRow[] = [];
  let totalStock = 0;
  let totalPrice = 0;
  let pricedMarkets = 0;

  for (const market of getWorldContext().pack.markets || []) {
    const goodData = market.goods[selectedGoodId];
    if (!goodData) continue;

    const stock = rn(goodData.stock || 0, 2);
    const price = rn(goodData.price || 0, 2);
    totalStock += stock;
    totalPrice += price;
    pricedMarkets += 1;

    rows.push({
      marketId: market.i,
      marketName: Markets.getName(market),
      marketColor: market.color,
      stock,
      price
    });
  }

  setMarketsGoodCompareState({
    rows,
    totalStock: rn(totalStock, 2),
    avgPrice: pricedMarkets ? rn(totalPrice / pricedMarkets, 2) : 0
  });
}

export function setSelectedGoodId(selectedGoodId: number): void {
  setMarketsGoodCompareState({ selectedGoodId });
  refresh();
}

export function togglePercentageMode(): void {
  setMarketsGoodCompareState({ isPercentageMode: !getMarketsGoodCompareState().isPercentageMode });
}

export function setSorting(sortBy: "market" | "stock" | "price"): void {
  const { sortBy: currentSortBy, sortDirection } = getMarketsGoodCompareState();
  const nextDirection = currentSortBy === sortBy ? sortDirection * -1 : sortBy === "market" ? 1 : -1;
  setMarketsGoodCompareState({ sortBy, sortDirection: nextDirection });
}

export function openMarketOverview(marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) return;
  getApi().openDialog("marketOverview", { marketId });
}

export function downloadCsv(): void {
  const selectedGoodId = getMarketsGoodCompareState().selectedGoodId;
  const good = selectedGoodId ? Goods.get(selectedGoodId) : null;
  if (!good) return;

  let csv = "Market,Stock,Price\n";
  for (const row of getMarketsGoodCompareState().rows) {
    csv += `${[row.marketName, row.stock, rn(row.price, 2)].join(",")}\n`;
  }
  downloadFile(csv, `${getFileName(`${good.name}_Market_Compare`)}.csv`);
}
