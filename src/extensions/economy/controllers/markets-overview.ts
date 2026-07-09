import { color, type D3DragEvent, drag, pointer } from "d3";
import { clearMainTip, showMainTip, tip } from "../../hostServices";
import type { Burg } from "../../hostTypes";
import { closeDialogs, openDialog } from "../../hostUi";
import {
  downloadFile,
  findAllCellsInRadius,
  findCell,
  findClosestCell,
  getFileName,
  getIsolines,
  getVertexPath,
  layerIsOn,
  removeCircle,
  rn
} from "../../hostUtils";

import { getApi, getMarketsLayer, getViewContext, getWorldContext } from "../economyContext";
import { syncBurgMarketLedgers } from "../generators/burgMarketLedgers";
import { getMarketManagerName } from "../generators/marketManagers";
import type { Deal, Market } from "../generators/markets-generator";
import { Markets } from "../generators/markets-generator";
import { Production } from "../generators/production-generator";
import { drawMarketsLayer, highlightMarketOff, highlightMarketOn } from "../renderers/draw-markets";
import { getMarketsOverviewState, type MarketRowData, setMarketsOverviewState } from "../store/marketsOverviewState";
import { open as openMarketsGoodCompare } from "./marketsGoodCompare";
import { open as openMarketTradeOpportunities } from "./marketTradeOpportunities";

let isInitialized = false;
// Working copy of getWorldContext().pack.cells.market mutated during manual assignment; applied on commit.
let marketsWorking: Uint16Array | null = null;
let marketsManualHistory: Uint16Array[] = [];

export function open(): void {
  if (getViewContext().customization) return;
  closeDialogs("#marketsOverview, .stable");
  if (!layerIsOn("toggleMarketsLayer")) getApi().toggleLayerById("toggleMarketsLayer");

  marketsOverviewAddLines();

  setMarketsOverviewState({ isOpen: true, mode: "default" });
  openDialog("marketsOverview", {
    title: "Markets Overview",
    resizable: false,
    width: "auto",
    onClose: () => {
      setMarketsOverviewState({ isOpen: false });
      closeMarketsOverview();
    },
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  if (!isInitialized) {
    isInitialized = true;
  }
}

function marketsOverviewAddLines(): void {
  const markets = getWorldContext().pack.markets;

  if (!markets?.length) {
    setMarketsOverviewState({
      markets: [],
      totalMarkets: 0,
      avgSales: 0,
      avgBuys: 0,
      avgValue: 0,
      selectedMarketId: null
    });
    return;
  }

  let totalSales = 0;
  let totalBuys = 0;
  let totalValue = 0;

  const rowData: MarketRowData[] = [];

  for (const market of markets) {
    const centerName = Markets.getName(market);
    const managerName = getMarketManagerName(market);
    const cells = getMarketCells(market.i);
    const burgs = getMarketBurgs(market.i);
    const stock = rn(getMarketTotalStock(market), 2);
    const { sales, buys, value } = getMarketFinancials(market);

    totalSales += sales;
    totalBuys += buys;
    totalValue += value;

    rowData.push({
      i: market.i,
      centerName,
      managerName,
      managerId: market.managerCharacterId,
      cells,
      burgs,
      stock,
      sales,
      buys,
      value,
      color: market.color,
      isNoMarket: false
    });
  }

  rowData.push({
    i: 0,
    centerName: "No market",
    managerName: "—",
    cells: getMarketCells(0),
    burgs: getMarketBurgs(0),
    stock: 0,
    sales: 0,
    buys: 0,
    value: 0,
    color: "none",
    isNoMarket: true
  });

  const count = markets.length;
  const prevSelectedMarketId = getMarketsOverviewState().selectedMarketId;
  const nextSelectedMarketId =
    prevSelectedMarketId !== null && rowData.some(row => row.i === prevSelectedMarketId)
      ? prevSelectedMarketId
      : (rowData.find(row => !row.isNoMarket)?.i ?? rowData[0]?.i ?? null);

  setMarketsOverviewState({
    markets: rowData,
    totalMarkets: count,
    avgSales: count ? rn(totalSales / count, 2) : 0,
    avgBuys: count ? rn(totalBuys / count, 2) : 0,
    avgValue: count ? rn(totalValue / count, 2) : 0,
    selectedMarketId: nextSelectedMarketId
  });

  // delay sorting apply to after react render if possible, but leaving out for now.
}

function enterMarketsManualAssignment(): void {
  if (!layerIsOn("toggleMarketsLayer")) getApi().toggleLayerById("toggleMarketsLayer");
  getViewContext().customization = 15;
  marketsManualHistory = [];

  document.getElementById("marketsTemp")?.remove();
  getMarketsLayer()?.append("g").attr("id", "marketsTemp").style("fill-opacity", "0.7");
  marketsWorking = Uint16Array.from(getWorldContext().pack.cells.market);
  renderMarketsTemp();

  const firstMarketId = getMarketsOverviewState().markets.find(row => !row.isNoMarket)?.i ?? 0;
  setMarketsOverviewState({ mode: "manual", selectedMarketId: firstMarketId });

  tip('Click a market row (or "No market") to select it, then drag on the map to repaint territory', true);

  getViewContext()
    .viewbox.style("cursor", "crosshair")
    .on("click", selectMarketOnMapClick)
    .call(drag<SVGGElement, unknown>().on("start", startMarketsBrushDrag))
    .on("touchmove mousemove", onMarketsBrushMove);

  // dialog call removed
}

function saveMarketsManualSnapshot(): void {
  if (marketsWorking) marketsManualHistory.push(Uint16Array.from(marketsWorking));
}

// renderNoMarketRow removed

function selectMarketOnMapClick(this: SVGGElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const cellId = findCell(x, y);
  if (cellId === undefined) return;

  const marketId = (marketsWorking ?? getWorldContext().pack.cells.market)[cellId];

  setMarketsOverviewState({ selectedMarketId: marketId });
}

function startMarketsBrushDrag(this: SVGGElement, event: D3DragEvent<SVGGElement, unknown, unknown>): void {
  const marketId = getMarketsOverviewState().selectedMarketId;
  if (marketId === null) return;
  // marketId 0 = "no market" (erase assignment); any other id must be an existing market.
  if (marketId !== 0 && !Markets.get(marketId)) return;

  saveMarketsManualSnapshot();
  const r = getMarketsOverviewState().brushSize;

  event.on("drag", (dragEvent: D3DragEvent<SVGGElement, unknown, unknown>) => {
    if (!dragEvent.dx && !dragEvent.dy) return;
    const [x, y] = pointer(dragEvent.sourceEvent, this);
    getApi().moveCircle(x, y, r);

    const found =
      r > 5
        ? findAllCellsInRadius(x, y, r, getWorldContext().pack)
        : [findClosestCell(x, y, Infinity, getWorldContext().pack)];
    const selection = found.filter((cellId): cellId is number => cellId !== undefined);
    if (!selection.length) return;
    paintMarketCells(selection, marketId);
  });
}

function paintMarketCells(selection: number[], targetMarketId: number) {
  if (!marketsWorking) return;

  const affected = new Set<number>([targetMarketId]);
  let changed = false;
  for (const cellId of selection) {
    const prev = marketsWorking[cellId];
    if (prev === targetMarketId) continue;
    if (prev) affected.add(prev); // previous owner loses a cell
    marketsWorking[cellId] = targetMarketId;
    changed = true;
  }

  if (changed) updateMarketTempPaths(affected);
}

// Render every market's territory as a single combined path (one DOM node per market).
function renderMarketsTemp(): void {
  const temp = document.getElementById("marketsTemp");
  if (!temp || !marketsWorking) return;

  const working = marketsWorking;
  const isolines = getIsolines(getWorldContext().pack, cellId => working[cellId] || null, { fill: true });
  temp.innerHTML = getWorldContext()
    .pack.markets.map(
      market => `<path data-market="${market.i}" fill="${market.color}" d="${isolines[market.i]?.fill || ""}"/>`
    )
    .join("");
}

// Recompute the combined path only for the markets whose territory changed.
function updateMarketTempPaths(marketIds: Iterable<number>): void {
  const temp = document.getElementById("marketsTemp");
  if (!temp || !marketsWorking) return;

  const cellsByMarket = new Map<number, number[]>();
  for (const id of marketIds) cellsByMarket.set(id, []);

  for (let cellId = 0; cellId < marketsWorking.length; cellId++) {
    const cells = cellsByMarket.get(marketsWorking[cellId]);
    if (cells) cells.push(cellId);
  }

  for (const [marketId, cells] of cellsByMarket) {
    if (!marketId) continue; // market 0 = "no market": those cells are left unpainted
    const d = cells.length ? getVertexPath(cells, getWorldContext().pack) : "";
    setMarketTempPath(temp, marketId, d);
  }
}

function setMarketTempPath(temp: HTMLElement, marketId: number, d: string): void {
  let path = temp.querySelector<SVGPathElement>(`path[data-market="${marketId}"]`);
  if (!path) {
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("data-market", String(marketId));
    const market = Markets.get(marketId);
    if (market) path.setAttribute("fill", market.color);
    temp.appendChild(path);
  }
  path.setAttribute("d", d);
}

function onMarketsBrushMove(this: SVGGElement, event: MouseEvent): void {
  showMainTip();
  const [x, y] = pointer(event, this);
  const r = getMarketsOverviewState().brushSize;
  getApi().moveCircle(x, y, r);
}

function undoMarketsManualStep(): void {
  if (!marketsManualHistory.length) return;
  marketsWorking = marketsManualHistory.pop()!;
  renderMarketsTemp();
}

function exitMarketsManualAssignment(apply: boolean): void {
  getViewContext().customization = 0;

  if (apply && marketsWorking) {
    for (let cellId = 0; cellId < marketsWorking.length; cellId++) {
      const marketId = marketsWorking[cellId];
      getWorldContext().pack.cells.market[cellId] = marketId;
      const burgId = getWorldContext().pack.cells.burg[cellId];
      if (burgId) (getWorldContext().pack.burgs as Burg[])[burgId].market = marketId;
    }
  }

  marketsWorking = null;
  marketsManualHistory = [];
  document.getElementById("marketsTemp")?.remove();
  setMarketsOverviewState({ mode: "default" });

  getApi().restoreDefaultEvents();
  clearMainTip();
  removeCircle();

  if (apply) {
    syncBurgMarketLedgers();
    drawMarketsLayer();
    marketsOverviewAddLines();
  }

  // dialog call removed
}

function enterAddMarketMode(): void {
  getViewContext().customization = 16;
  setMarketsOverviewState({ mode: "add" });
  tip("Click on a burg on the map to create a new market there. Hold Shift to add multiple", true);
  getViewContext().viewbox.style("cursor", "crosshair").on("click", addMarketOnClick);
}

function exitAddMarketMode(): void {
  getViewContext().customization = 0;
  setMarketsOverviewState({ mode: "default" });
  getApi().restoreDefaultEvents();
  clearMainTip();
}

function addMarketOnClick(this: SVGGElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const cellId = findCell(x, y);
  if (cellId === undefined) return;

  const burgId = getWorldContext().pack.cells.burg[cellId];
  if (!burgId) {
    tip("Click on a burg to create a new market — no burg found here", false, "error");
    return;
  }

  if (getWorldContext().pack.markets.some(m => m.centerBurgId === burgId)) {
    tip("This burg is already a market center", false, "error");
    return;
  }

  const newMarket = Markets.addMarket(burgId);
  if (!newMarket) return;

  if (!event.shiftKey) exitAddMarketMode();

  if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
  marketsOverviewAddLines();
}

export function updateMarketColor(marketId: number, newFill: string): void {
  const market = Markets.get(marketId);
  if (!market) return;
  market.color = newFill;
  applyMarketColor(marketId, newFill);
  setMarketsOverviewState({
    markets: getMarketsOverviewState().markets.map(row => (row.i === marketId ? { ...row, color: newFill } : row))
  });
}

export function removeMarket(marketId: number): void {
  Markets.removeMarket(marketId);
  if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
  marketsOverviewAddLines();
}

// Recolor a single market's rendered shapes in place, matching draw-markets output.
function applyMarketColor(marketId: number, fill: string): void {
  const strokeColor = color(fill)?.darker().hex() || "#000";

  const group = document.getElementById(`market${marketId}`);
  if (group) {
    group.querySelector<SVGPathElement>("path.fill")?.setAttribute("fill", fill);
    group.querySelector<SVGPathElement>("path.border")?.setAttribute("stroke", strokeColor);
    const circle = group.querySelector<SVGCircleElement>("circle");
    if (circle) {
      circle.setAttribute("fill", fill);
      circle.setAttribute("stroke", strokeColor);
    }
  }

  document.querySelector<SVGPathElement>(`#marketsTemp path[data-market="${marketId}"]`)?.setAttribute("fill", fill);
}

function getMarketTotalStock(market: Market): number {
  return Object.values(market.goods).reduce((sum, g) => sum + (g.stock || 0), 0);
}

function getMarketCells(marketId: number): number {
  const marketArr = getWorldContext().pack.cells.market;
  if (!marketArr) return 0;
  let count = 0;
  for (let i = 0; i < marketArr.length; i++) {
    if (marketArr[i] === marketId) count++;
  }
  return count;
}

function getMarketBurgs(marketId: number): number {
  const marketArr = getWorldContext().pack.cells.market;
  if (!marketArr) return 0;
  return (getWorldContext().pack.burgs as Burg[]).filter(b => b.i && !b.removed && marketArr[b.cell] === marketId)
    .length;
}

function getMarketFinancials(market: Market): {
  sales: number;
  buys: number;
  value: number;
} {
  const marketId = market.i;
  const deals: Deal[] = (getWorldContext().pack.deals || []).filter(
    (deal: Deal) =>
      (deal.sellerType === "market" && deal.seller === marketId) ||
      (deal.buyerType === "market" && deal.buyer === marketId)
  );
  let sales = 0;
  let buys = 0;
  let tax = 0;

  for (const deal of deals) {
    const amount = deal.units * deal.price;
    const marketIsSeller = deal.sellerType === "market" && deal.seller === marketId;
    if (marketIsSeller) {
      sales += amount;
      tax += deal.tax || 0;
    } else {
      buys += amount;
    }
  }

  const stockValue = Object.values(market.goods).reduce((sum, g) => sum + (g.stock || 0) * (g.price || 0), 0);

  return {
    sales: rn(sales, 2),
    buys: rn(buys, 2),
    value: rn(buys - sales + stockValue - tax, 2)
  };
}

function togglePercentageMode(): void {
  const isPercentageMode = getMarketsOverviewState()?.isPercentageMode || false;
  setMarketsOverviewState({ isPercentageMode: !isPercentageMode });
}

// updateFooter removed

function regenerateMarkets(regenerateTrade = true): void {
  Markets.generate(true);
  if (regenerateTrade) Production.produce();
  if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
  marketsOverviewAddLines();
}

function regenerateProduction(): void {
  Production.produce();
  if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
  marketsOverviewAddLines();
}

function downloadMarketsCsv(): void {
  let csv = "Market,Manager,Cells,Burgs,Total Stock,Sales,Buys,Value\n";
  for (const market of getWorldContext().pack.markets) {
    const { sales, buys, value } = getMarketFinancials(market);
    const cells = getMarketCells(market.i);
    const burgs = getMarketBurgs(market.i);
    const stock = rn(getMarketTotalStock(market), 2);
    csv += `${[Markets.getName(market), getMarketManagerName(market), cells, burgs, stock, sales, buys, value].join(",")}\n`;
  }
  downloadFile(csv, `${getFileName("Markets_Overview")}.csv`);
}

export function closeMarketsOverview(): void {
  if (getViewContext().customization === 15) exitMarketsManualAssignment(false);
  if (getViewContext().customization === 16) exitAddMarketMode();
  setMarketsOverviewState({ isOpen: false, mode: "default" });
}

export const marketsOverviewActions = {
  marketsOverviewAddLines,
  togglePercentageMode,
  downloadMarketsCsv,
  regenerateMarkets,
  regenerateProduction,
  enterMarketsManualAssignment,
  undoMarketsManualStep,
  exitMarketsManualAssignment,
  enterAddMarketMode,
  highlightMarketOn,
  highlightMarketOff,
  removeMarket,
  updateMarketColor,
  selectMarket(marketId: number) {
    setMarketsOverviewState({ selectedMarketId: marketId });
  },
  toggleManualAssignment() {
    if (getViewContext().customization === 15) exitMarketsManualAssignment(false);
    else enterMarketsManualAssignment();
  },
  toggleAddMarketMode() {
    if (getViewContext().customization === 16) exitAddMarketMode();
    else enterAddMarketMode();
  },
  setBrushSize(brushSize: number) {
    setMarketsOverviewState({ brushSize });
  },
  openMarketOverview(marketId: number) {
    const market = Markets.get(marketId);
    if (!market) return;
    getApi().openDialog("marketOverview", { marketId });
  },
  openMarketCompare() {
    openMarketsGoodCompare();
  },
  openTradeOpportunities() {
    openMarketTradeOpportunities();
  },
  setSorting(sortBy: string) {
    const { sortBy: currentSortBy, sortDirection } = getMarketsOverviewState();
    const nextDirection =
      currentSortBy === sortBy ? sortDirection * -1 : sortBy === "market" || sortBy === "manager" ? 1 : -1;
    setMarketsOverviewState({ sortBy, sortDirection: nextDirection });
  }
};
