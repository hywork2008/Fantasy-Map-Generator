import { color, type D3DragEvent, drag, pointer } from "d3";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import {
  closeDialogs,
  confirmationDialog,
  downloadFile,
  getFileName,
  moveCircle,
  removeCircle,
  restoreDefaultEvents
} from "../controllers/editors";
import { toggleMarketsLayer } from "../controllers/layers";
import type { Burg } from "../modules/burgs-generator";
import type { Deal, Market } from "../modules/markets-generator";
import { Markets } from "../modules/markets-generator";
import { drawMarketsLayer, highlightMarketOff, highlightMarketOn } from "../renderers/draw-markets";
import { getMarketsOverviewState, type MarketRowData, setMarketsOverviewState } from "../store/marketsOverviewState";
import { openDialog } from "../ui/dialogs/dialogService";
import { findAllCellsInRadius, findCell, findClosestCell, getIsolines, getVertexPath, rn } from "../utils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, showMainTip, tip } from "../utils/uiHelpers";

const viewbox = viewContext.viewbox;

let isInitialized = false;
// Working copy of worldContext.pack.cells.market mutated during manual assignment; applied on commit.
let marketsWorking: Uint16Array | null = null;
let marketsManualHistory: Uint16Array[] = [];

export function open(): void {
  if (viewContext.customization) return;
  closeDialogs("#marketsOverview, .stable");
  if (!layerIsOn("toggleMarketsLayer")) toggleMarketsLayer();

  marketsOverviewAddLines();

  setMarketsOverviewState({ isOpen: true });
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
  const markets = worldContext.pack.markets;

  if (!markets?.length) {
    setMarketsOverviewState({
      markets: [],
      totalMarkets: 0,
      avgSales: 0,
      avgBuys: 0,
      avgValue: 0
    });
    return;
  }

  let totalSales = 0;
  let totalBuys = 0;
  let totalValue = 0;

  const rowData: MarketRowData[] = [];

  for (const market of markets) {
    const centerName = Markets.getName(market);
    const ownerName = getOwnerStateName(market);
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
      ownerName,
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
    ownerName: "—",
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
  setMarketsOverviewState({
    markets: rowData,
    totalMarkets: count,
    avgSales: count ? rn(totalSales / count, 2) : 0,
    avgBuys: count ? rn(totalBuys / count, 2) : 0,
    avgValue: count ? rn(totalValue / count, 2) : 0
  });

  // delay sorting apply to after react render if possible, but leaving out for now.
}

function enterMarketsManualAssignment(): void {
  if (!layerIsOn("toggleMarketsLayer")) toggleMarketsLayer();
  viewContext.customization = 15;
  marketsManualHistory = [];

  document.getElementById("marketsTemp")?.remove();
  viewContext.markets.append("g").attr("id", "marketsTemp").style("fill-opacity", "0.7");
  marketsWorking = Uint16Array.from(worldContext.pack.cells.market);
  renderMarketsTemp();

  document.querySelectorAll<HTMLElement>("#marketsOverviewBottom > button").forEach(b => {
    b.style.display = "none";
  });
  document.getElementById("marketsManuallyButtons")!.style.display = "block";
  document.getElementById("marketsBrush")!.style.display = "inline-block";
  document.getElementById("marketsManually")!.classList.add("pressed");
  document.getElementById("marketsOverviewFooter")!.style.display = "none";

  document.getElementById("marketsOverviewHeader")!.style.gridTemplateColumns = "1.6em 7.2em 8em 3.5em";
  document
    .getElementById("marketsOverview")!
    .querySelectorAll(".hide")
    .forEach(el => {
      el.classList.add("hidden");
    });

  tip('Click a market row (or "No market") to select it, then drag on the map to repaint territory', true);

  const firstRow = document
    .getElementById("marketsOverviewBody")!
    .querySelector<HTMLElement>('.states.market:not([data-id="0"])');
  if (firstRow) firstRow.classList.add("selected");

  viewbox
    .style("cursor", "crosshair")
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

  const marketId = (marketsWorking ?? worldContext.pack.cells.market)[cellId];

  const body = document.getElementById("marketsOverviewBody")!;
  body.querySelector<HTMLElement>(".states.market.selected")?.classList.remove("selected");
  body.querySelector<HTMLElement>(`.states.market[data-id="${marketId}"]`)?.classList.add("selected");
}

function startMarketsBrushDrag(this: SVGGElement, event: D3DragEvent<SVGGElement, unknown, unknown>): void {
  const selectedRow = document
    .getElementById("marketsOverviewBody")!
    .querySelector<HTMLElement>(".states.market.selected");
  if (!selectedRow) return;
  const marketId = +selectedRow.dataset.id!;
  // marketId 0 = "no market" (erase assignment); any other id must be an existing market.
  if (marketId !== 0 && !Markets.get(marketId)) return;

  saveMarketsManualSnapshot();
  const r = +(document.getElementById("marketsBrush") as HTMLInputElement).value;

  event.on("drag", (dragEvent: D3DragEvent<SVGGElement, unknown, unknown>) => {
    if (!dragEvent.dx && !dragEvent.dy) return;
    const [x, y] = pointer(dragEvent.sourceEvent, this);
    moveCircle(x, y, r);

    const found =
      r > 5 ? findAllCellsInRadius(x, y, r, worldContext.pack) : [findClosestCell(x, y, Infinity, worldContext.pack)];
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
  const isolines = getIsolines(worldContext.pack, cellId => working[cellId] || null, { fill: true });
  temp.innerHTML = worldContext.pack.markets
    .map(market => `<path data-market="${market.i}" fill="${market.color}" d="${isolines[market.i]?.fill || ""}"/>`)
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
    const d = cells.length ? getVertexPath(cells, worldContext.pack) : "";
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
  const r = +(document.getElementById("marketsBrush") as HTMLInputElement).value;
  moveCircle(x, y, r);
}

function undoMarketsManualStep(): void {
  if (!marketsManualHistory.length) return;
  marketsWorking = marketsManualHistory.pop()!;
  renderMarketsTemp();
}

function exitMarketsManualAssignment(apply: boolean): void {
  viewContext.customization = 0;

  if (apply && marketsWorking) {
    for (let cellId = 0; cellId < marketsWorking.length; cellId++) {
      const marketId = marketsWorking[cellId];
      worldContext.pack.cells.market[cellId] = marketId;
      const burgId = worldContext.pack.cells.burg[cellId];
      if (burgId) (worldContext.pack.burgs as Burg[])[burgId].market = marketId;
    }
  }

  marketsWorking = null;
  marketsManualHistory = [];
  document.getElementById("marketsTemp")?.remove();

  document.getElementById("marketsOverviewHeader")!.style.gridTemplateColumns =
    "1.6em 7.2em 8em 3.5em 4.5em 6.5em 6.4em 6em 6em 1.2em";
  document
    .getElementById("marketsOverview")!
    .querySelectorAll(".hide")
    .forEach(el => void el.classList.remove("hidden"));
  document.getElementById("marketsOverviewFooter")!.style.display = "block";

  document.querySelectorAll<HTMLElement>("#marketsOverviewBottom > button").forEach(b => {
    b.style.display = "";
  });
  document.getElementById("marketsManuallyButtons")!.style.display = "none";
  document.getElementById("marketsBrush")!.style.display = "none";
  document.getElementById("marketsManually")!.classList.remove("pressed");
  document
    .getElementById("marketsOverviewBody")!
    .querySelector<HTMLElement>(".states.market.selected")
    ?.classList.remove("selected");

  restoreDefaultEvents();
  clearMainTip();
  removeCircle();

  if (apply) {
    drawMarketsLayer();
    marketsOverviewAddLines();
  }

  // dialog call removed
}

function enterAddMarketMode(): void {
  viewContext.customization = 16;
  document.getElementById("marketsAdd")!.classList.add("pressed");
  tip("Click on a burg on the map to create a new market there. Hold Shift to add multiple", true);
  viewbox.style("cursor", "crosshair").on("click", addMarketOnClick);
}

function exitAddMarketMode(): void {
  viewContext.customization = 0;
  document.getElementById("marketsAdd")!.classList.remove("pressed");
  restoreDefaultEvents();
  clearMainTip();
}

function addMarketOnClick(this: SVGGElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const cellId = findCell(x, y);
  if (cellId === undefined) return;

  const burgId = worldContext.pack.cells.burg[cellId];
  if (!burgId) {
    tip("Click on a burg to create a new market — no burg found here", false, "error");
    return;
  }

  if (worldContext.pack.markets.some(m => m.centerBurgId === burgId)) {
    tip("This burg is already a market center", false, "error");
    return;
  }

  const newMarket = Markets.addMarket(burgId);
  if (!newMarket) return;

  if (!event.shiftKey) exitAddMarketMode();

  if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
  marketsOverviewAddLines();
}

function confirmRemoveMarket(marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) return;
  const name = Markets.getName(market);

  confirmationDialog({
    title: "Remove Market",
    message: `Are you sure you want to remove the market "${name}"?<br>This action cannot be reverted`,
    confirm: "Remove",
    onConfirm: () => {
      Markets.removeMarket(marketId);
      if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
      marketsOverviewAddLines();
    }
  });
}

function marketChangeFill(fillBox: HTMLElement, marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) return;

  const callback = (newFill: string) => {
    (fillBox as unknown as { fill: string }).fill = newFill;
    market.color = newFill;
    applyMarketColor(marketId, newFill);
  };

  openPicker(market.color, callback);
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
  const marketArr = worldContext.pack.cells.market;
  if (!marketArr) return 0;
  let count = 0;
  for (let i = 0; i < marketArr.length; i++) {
    if (marketArr[i] === marketId) count++;
  }
  return count;
}

function getMarketBurgs(marketId: number): number {
  const marketArr = worldContext.pack.cells.market;
  if (!marketArr) return 0;
  return (worldContext.pack.burgs as Burg[]).filter(b => b.i && !b.removed && marketArr[b.cell] === marketId).length;
}

function getMarketFinancials(market: Market): {
  sales: number;
  buys: number;
  value: number;
} {
  const marketId = market.i;
  const deals: Deal[] = (worldContext.pack.deals || []).filter(
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

function getOwnerStateName(market: Market): string {
  const center = worldContext.pack.burgs[market.centerBurgId];
  if (!center) return "Unknown";
  if (!center.state) return "Independent";
  return worldContext.pack.states[center.state]?.name || `State ${center.state}`;
}

function regenerateMarkets() {
  confirmationDialog({
    title: "Regenerate markets",
    message: /* html */ `Are you sure you want to regenerate markets and their territories?
      <label style="display:flex; align-items:center; gap:.4em; margin-top:.6em;">
        <input id="marketsRegenerateProductionToggle" type="checkbox" class="native" checked />
        Regenerate production and trade
      </label>`,
    confirm: "Regenerate",
    onConfirm: () => {
      const regenProduction = (document.getElementById("marketsRegenerateProductionToggle") as HTMLInputElement)
        .checked;
      (() => {})();
      if (regenProduction) (() => {})();
    }
  });
}

function regenerateProduction() {
  confirmationDialog({
    title: "Regenerate production",
    message:
      "Are you sure you want to regenerate production and trade for all goods? Generation will be based on the current Goods settings and bonus goods placement",
    confirm: "Regenerate",
    onConfirm: () => {}
  });
}

function downloadMarketsCsv(): void {
  let csv = "Market,Owner,Cells,Burgs,Total Stock,Sales,Buys,Value\n";
  for (const market of worldContext.pack.markets) {
    const { sales, buys, value } = getMarketFinancials(market);
    const cells = getMarketCells(market.i);
    const burgs = getMarketBurgs(market.i);
    const stock = rn(getMarketTotalStock(market), 2);
    csv += `${[Markets.getName(market), getOwnerStateName(market), cells, burgs, stock, sales, buys, value].join(",")}\n`;
  }
  downloadFile(csv, `${getFileName("Markets_Overview")}.csv`);
}

export function closeMarketsOverview(): void {
  if (viewContext.customization === 15) exitMarketsManualAssignment(false);
  if (viewContext.customization === 16) exitAddMarketMode();
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
  confirmRemoveMarket,
  marketChangeFill,
  highlightMarketOn,
  highlightMarketOff
};
