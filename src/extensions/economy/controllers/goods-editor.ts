import { pointer } from "d3";
import { confirmationDialog, downloadFile, getFileName, restoreDefaultEvents } from "../../../controllers/editors";
import { toggleCells } from "../../../controllers/layers";
import { getGoodsEditorTableState, setGoodsEditorTableState } from "../../../store/goodsEditorTableState";
import { setGoodsProducersDialogState } from "../../../store/goodsProducersDialogState";
import { setGoodsStockDialogState } from "../../../store/goodsStockDialogState";
import { setGoodsTagsDialogState } from "../../../store/goodsTagsDialogState";
import { rn, unique } from "../../../utils";
import { findCell } from "../../../utils/graphUtils";
import { layerIsOn } from "../../../utils/nodeUtils";
import { applySorting, clearMainTip, tip } from "../../../utils/uiHelpers";
import { getApi, getViewContext, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import { isDealRecord, isMfgRecord, Production } from "../generators/production-generator";
import { getCellProduction } from "../generators/production-utils";
import { drawGoods } from "../renderers/draw-goods";

const viewbox = () => getViewContext().viewbox;
const worldContext = () => getWorldContext();

const visibleTags = new Set<string>();
const displayedGoods = new Set<number>();
let displayedGoodsInitialized = false;

function refreshEditor(): void {
  goodsEditorAddLines();
  drawGoods(displayedGoods);
}

function ensureDisplayedGoodsInitialized(): void {
  if (displayedGoodsInitialized) return;
  displayedGoodsInitialized = true;
  if (!worldContext().pack.goods?.length) return;

  const wood = worldContext().pack.goods.find(g => g.name === "Wood");
  displayedGoods.add(wood ? wood.i : worldContext().pack.goods[0].i);
}

export function open(): void {
  if (getViewContext().customization) return;

  ensureDisplayedGoodsInitialized();
  if (!layerIsOn("toggleGoods")) getApi().toggleLayerById("toggleGoods");
  else drawGoods(displayedGoods);

  goodsEditorAddLines();
}

export function goodsEditorAddLines(): void {
  const production = getProduction();
  const stockData = getAllStockData();

  const goods = (worldContext().pack.goods ?? []).map(good => {
    const types = [good.recipes && "MFG", good.distribution && "RAW"].filter(Boolean) as string[];
    const goodProduction = production[good.i] ?? { burg: 0, cell: 0 };
    const produced = rn(goodProduction.burg + goodProduction.cell);
    const stock = rn(stockData[good.i]?.total ?? 0);
    const producedTip = `Total good production: ${produced}⚒. Cells: ${rn(goodProduction.cell, 2)}⚒. Burgs: ${rn(goodProduction.burg, 2)}⚒`;
    const stockTip = `Total stock in all markets and burg inventories: ${stock} units`;
    const isTagVisible = visibleTags.size === 0 || (good.tags?.some(tag => visibleTags.has(tag)) ?? false);

    return {
      i: good.i,
      name: good.name,
      color: good.color,
      strokeColor: Goods.getStroke(good.color),
      icon: good.icon,
      types,
      tags: good.tags ?? [],
      produced,
      cellProduction: rn(goodProduction.cell, 2),
      burgProduction: rn(goodProduction.burg, 2),
      producedTip,
      stock,
      stockTip,
      basePrice: good.value,
      isDisplayed: displayedGoods.has(good.i),
      isTagVisible
    };
  });

  const totalProduced = rn(
    Object.values(production)
      .map(p => p.burg + p.cell)
      .reduce((sum, v) => sum + v, 0)
  );
  const totalStock = rn(Object.values(stockData).reduce((sum, d) => sum + d.total, 0));

  setGoodsEditorTableState({
    goods,
    totalProduced,
    totalStock,
    displayedCount: displayedGoods.size,
    isPercentageMode: false,
    hasTagFilter: visibleTags.size > 0
  });

  setTimeout(() => {
    const header = document.getElementById("goodsHeader");
    if (header) applySorting(header);
  }, 0);
}

export function openProducersDialog(goodId: number): void {
  const good = Goods.get(goodId);
  if (!good) return;

  const producers = worldContext()
    .pack.burgs.filter(b => b.i && !b.removed)
    .map(b => ({ burg: b, units: Production.getBurgProduction(b)[goodId] ?? 0 }))
    .filter(({ units }) => units > 0)
    .sort((a, b) => b.units - a.units)
    .map(({ burg, units }) => ({
      id: burg.i ?? 0,
      name: burg.name ?? "",
      x: burg.x ?? 0,
      y: burg.y ?? 0,
      units
    }));

  setGoodsProducersDialogState({
    isOpen: true,
    goodName: good.name,
    producers,
    onZoom: (x: number, y: number) => getApi().zoomTo(x, y, 8, 2000)
  });
}

type StockSource = { name: string; type: "market" | "burg"; x: number; y: number; id: number; stock: number };

function getAllStockData(): Record<number, { total: number; sources: StockSource[] }> {
  const dealById = new Map((worldContext().pack.deals || []).map(d => [d.i, d]));
  const result: Record<number, { total: number; sources: StockSource[] }> = {};
  for (const good of worldContext().pack.goods || []) result[good.i] = { total: 0, sources: [] };

  for (const market of worldContext().pack.markets || []) {
    const centerBurg = worldContext().pack.burgs[market.centerBurgId];
    if (!centerBurg) continue;
    const x = centerBurg.x ?? 0;
    const y = centerBurg.y ?? 0;
    const marketName = Markets.getName(market);

    for (const [goodIdStr, { stock }] of Object.entries(market.goods)) {
      const goodId = +goodIdStr;
      if (!result[goodId] || stock <= 0) continue;
      result[goodId].total += stock;
      result[goodId].sources.push({ name: marketName, type: "market", x, y, id: market.i, stock });
    }
  }

  for (const burg of worldContext().pack.burgs) {
    if (!burg?.i || burg.removed || !burg.production) continue;

    const netInventory: Record<number, number> = {};
    for (const record of burg.production) {
      if (isMfgRecord(record)) {
        netInventory[record.goodId] = (netInventory[record.goodId] || 0) + record.units;
        for (const item of record.recipe) {
          netInventory[item.goodId] = (netInventory[item.goodId] || 0) - item.units;
        }
      } else if (isDealRecord(record)) {
        const deal = dealById.get(record.dealId);
        if (!deal) continue;
        if (deal.buyerType === "burg" && deal.buyer === burg.i) {
          netInventory[deal.good] = (netInventory[deal.good] || 0) + deal.units;
        } else if (deal.sellerType === "burg" && deal.seller === burg.i) {
          netInventory[deal.good] = (netInventory[deal.good] || 0) - deal.units;
        }
      } else {
        netInventory[record.goodId] = (netInventory[record.goodId] || 0) + record.units;
      }
    }

    for (const [goodIdStr, units] of Object.entries(netInventory)) {
      const goodId = +goodIdStr;
      if (!result[goodId] || units <= 0.001) continue;
      const roundedUnits = rn(units, 2);
      result[goodId].total += roundedUnits;
      result[goodId].sources.push({
        name: burg.name || `Burg ${burg.i}`,
        type: "burg",
        x: burg.x ?? 0,
        y: burg.y ?? 0,
        id: burg.i,
        stock: roundedUnits
      });
    }
  }

  for (const good of worldContext().pack.goods || []) result[good.i].total = rn(result[good.i].total, 2);

  return result;
}

export function openStockDialog(goodId: number): void {
  const good = Goods.get(goodId);
  if (!good) return;

  const stockData = getAllStockData();
  const sources = [...(stockData[goodId]?.sources ?? [])].sort((a, b) => b.stock - a.stock);

  setGoodsStockDialogState({
    isOpen: true,
    goodName: good.name,
    sources: sources.map(s => ({ id: s.id, name: s.name, type: s.type, x: s.x, y: s.y, stock: s.stock })),
    onZoom: (x: number, y: number) => getApi().zoomTo(x, y, 8, 2000)
  });
}

function getProduction(): Record<number, { burg: number; cell: number }> {
  const production: Record<number, { burg: number; cell: number }> = {};
  const addProduction = (goodId: number, amount: number, type: "burg" | "cell") => {
    if (!production[goodId]) production[goodId] = { burg: 0, cell: 0 };
    production[goodId][type] += amount;
  };

  const productionByBiome = Goods.getBiomesProduction();
  for (const cellId of worldContext().pack.cells.i) {
    const produced = getCellProduction(cellId, productionByBiome);
    for (const goodId in produced) {
      addProduction(Number(goodId), produced[goodId] || 0, "cell");
    }
  }

  for (const burg of worldContext().pack.burgs) {
    if (!burg || burg.removed || !burg.production) continue;
    const produced = Production.getBurgProduction(burg);
    for (const goodId in produced) {
      addProduction(Number(goodId), produced[goodId] || 0, "burg");
    }
  }

  return production;
}

export function openTagsVisibilityDialog(): void {
  const tags = unique((worldContext().pack.goods || []).flatMap(good => good.tags));

  setGoodsTagsDialogState({
    isOpen: true,
    tags,
    activeTags: Array.from(visibleTags),
    onApply: (activeTags: string[]) => {
      visibleTags.clear();
      for (const tag of activeTags) visibleTags.add(tag);
      goodsEditorAddLines();
    }
  });
}

export function goodsRestoreDefaults(): void {
  confirmationDialog({
    title: "Restore default goods",
    message: "Are you sure you want to restore default goods? <br>This action cannot be reverted",
    confirm: "Restore",
    onConfirm: () => {
      Goods.restoreDefaults();
      Goods.generate();
      Markets.generate(true);
      Production.produce();
      refreshEditor();
    }
  });
}

export function togglePercentageMode(): void {
  const { isPercentageMode } = getGoodsEditorTableState();
  if (!isPercentageMode) {
    setGoodsEditorTableState({ isPercentageMode: true });
  } else {
    goodsEditorAddLines();
  }
}

export function enterResourceAssignMode(this: HTMLElement): void {
  if (this.classList.contains("pressed")) {
    exitResourceAssignMode();
    return;
  }
  getViewContext().customization = 14;
  this.classList.add("pressed");
  if (!layerIsOn("toggleGoods")) getApi().toggleLayerById("toggleGoods");
  if (!layerIsOn("toggleCells")) {
    (document.getElementById("toggleCells") as HTMLButtonElement).dataset.forced = "true";
    toggleCells();
  }

  document
    .getElementById("goodsEditor")!
    .querySelectorAll(".hide")
    .forEach(el => {
      el.classList.add("hidden");
    });
  document.getElementById("goodsHeader")!.style.cssText = "grid-template-columns: 7.5em 6em; margin-left: 22px;";

  tip("Select good line in editor, click on cells to remove or add a bonus resource", true);
  viewbox().on("click.goodsAssign", (event: MouseEvent) => {
    const point = pointer(event, getViewContext().viewbox.node()!);
    const cellId = findCell(point[0], point[1]);
    if (cellId === undefined) return;

    const body = document.getElementById("goodsBody")!;
    const selected = body.querySelector<HTMLElement>("div.selected");
    if (!selected) return;

    if (worldContext().pack.cells.good[cellId]) {
      worldContext().pack.cells.good[cellId] = 0;
    } else {
      const resourceId = +selected.dataset.id!;
      const resource = Goods.get(resourceId);
      if (!resource) return;
      worldContext().pack.cells.good[cellId] = resourceId;
      displayedGoods.add(resourceId);
    }

    drawGoods(displayedGoods);
  });
}

export function handleGoodRowClick(el: HTMLElement): void {
  if (getViewContext().customization !== 14) return;
  const body = document.getElementById("goodsBody")!;
  body.querySelector<HTMLElement>("div.selected")?.classList.remove("selected");
  el.classList.add("selected");
}

function exitResourceAssignMode(close?: string): void {
  const body = document.getElementById("goodsBody")!;
  getViewContext().customization = 0;
  document.getElementById("goodsAssign")!.classList.remove("pressed");

  if (layerIsOn("toggleCells")) {
    const toggler = document.getElementById("toggleCells") as HTMLButtonElement;
    if (toggler.dataset.forced) toggleCells();
    delete toggler.dataset.forced;
  }

  document
    .getElementById("goodsEditor")!
    .querySelectorAll(".hide")
    .forEach(el => {
      el.classList.remove("hidden");
    });
  document.getElementById("goodsHeader")!.style.cssText = "grid-template-columns: 4em 7.4em 7em 6.8em 6em 4.6em 1.6em;";

  viewbox().on("click.goodsAssign", null);

  if (!close) goodsEditorAddLines();

  restoreDefaultEvents();
  clearMainTip();
  const selected = body.querySelector("div.selected");
  if (selected) selected.classList.remove("selected");
}

export function downloadGoodsData(): void {
  const cellsByGood: Record<number, number> = {};
  for (const goodId of worldContext().pack.cells.good) {
    if (goodId) cellsByGood[goodId] = (cellsByGood[goodId] || 0) + 1;
  }

  const production = getProduction();
  const stockData = getAllStockData();

  let data = "Id,Good,Color,Type,Tags,Value,Demand Coverage,Chance,Model,Cells,Produced,Stock\n";

  for (const good of worldContext().pack.goods || []) {
    const types = [good.recipes && "MFG", good.distribution && "RAW"].filter(Boolean).join(";");
    const tags = good.tags.join(";");
    const demandCoverage = Object.entries(good.demandCoverage || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
    const cells = cellsByGood[good.i] || 0;
    const goodProduction = production[good.i] || { burg: 0, cell: 0 };
    const produced = rn(goodProduction.burg + goodProduction.cell);
    const stock = stockData[good.i]?.total ?? 0;

    data += `${good.i},${good.name},${good.color},${types},${tags},${good.value},${demandCoverage},${good.chance ?? ""},${good.distribution ?? ""},${cells},${produced},${stock}\n`;
  }

  downloadFile(data, `${getFileName("Goods")}.csv`);
}

export function toggleDisplayedGood(goodId: number, show: boolean): void {
  if (show) displayedGoods.add(goodId);
  else displayedGoods.delete(goodId);

  setGoodsEditorTableState({
    displayedCount: displayedGoods.size,
    goods: getGoodsEditorTableState().goods.map(g => (g.i === goodId ? { ...g, isDisplayed: show } : g))
  });
  drawGoods(displayedGoods);
}

export function toggleAllDisplayed(show: boolean): void {
  if (show) {
    for (const good of worldContext().pack.goods || []) displayedGoods.add(good.i);
  } else {
    displayedGoods.clear();
  }
  goodsEditorAddLines();
  drawGoods(displayedGoods);
}

export function requestGoodsRegeneration(): void {
  confirmationDialog({
    title: "Regenerate bonus goods",
    message:
      "Are you sure you want to regenerate bonus goods placement? Generation will be based on the current Goods settings and won't affect production or trade",
    confirm: "Regenerate",
    onConfirm: () => {
      Goods.generate();
      refreshEditor();
    }
  });
}

export function requestProductionRegeneration(): void {
  confirmationDialog({
    title: "Regenerate production",
    message:
      "Are you sure you want to regenerate production and trade for all goods? Generation will be based on the current Goods settings and bonus goods placement",
    confirm: "Regenerate",
    onConfirm: () => {
      Production.produce();
      refreshEditor();
    }
  });
}

export function removeGood(goodId: number): void {
  const good = Goods.get(goodId);
  if (!good) return;

  confirmationDialog({
    title: "Remove resource",
    message: "Are you sure you want to remove the resource? <br>This action cannot be reverted",
    confirm: "Remove",
    onConfirm: () => {
      for (const i of worldContext().pack.cells.i) {
        if (worldContext().pack.cells.good[i] === good.i) {
          worldContext().pack.cells.good[i] = 0;
        }
      }
      worldContext().pack.goods = worldContext().pack.goods.filter(g => g.i !== good.i);
      Goods.sync();
      displayedGoods.delete(good.i);
      goodsEditorAddLines();
      drawGoods(displayedGoods);
    }
  });
}

export function closeGoodsEditor(): void {
  if (getViewContext().customization === 14) exitResourceAssignMode("close");
}
