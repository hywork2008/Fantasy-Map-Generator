import { pointer } from "d3";
import { clearMainTip, tip } from "../../hostServices";
import { confirmationDialog, downloadFile, findCell, getFileName, layerIsOn, rn, unique } from "../../hostUtils";
import { getApi, getViewContext, getWorldContext } from "../economyContext";
import { Goods, getDefaultGoodTradeProfile, isGoodEnabled } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import { isDealRecord, isMfgRecord, Production } from "../generators/production-generator";
import { getCellProduction } from "../generators/production-utils";
import { drawGoods } from "../renderers/draw-goods";
import { getGoodsEditorTableState, setGoodsEditorTableState } from "../store/goodsEditorTableState";
import { setGoodsProducersDialogState } from "../store/goodsProducersDialogState";
import { setGoodsStockDialogState } from "../store/goodsStockDialogState";
import { setGoodsTagsDialogState } from "../store/goodsTagsDialogState";
import { DistributionEditor } from "./goods-distribution-editor";

const viewbox = () => getViewContext().viewbox;
const worldContext = () => getWorldContext();

const visibleTags = new Set<string>();
const displayedGoods = new Set<number>();
let displayedGoodsInitialized = false;
let cellsWasForced = false;

function refreshEditor(): void {
  goodsEditorAddLines();
  drawGoods(displayedGoods);
}

function regenerateEconomyForGood(goodId: number): void {
  Goods.regeneratePlacement(goodId);
  Markets.generate(true);
  Production.produce();
  refreshEditor();
}

function ensureDisplayedGoodsInitialized(): void {
  if (displayedGoodsInitialized) return;
  displayedGoodsInitialized = true;
  const enabledGoods = (worldContext().pack.goods ?? []).filter(isGoodEnabled);
  if (!enabledGoods.length) return;

  const wood = enabledGoods.find(g => g.name === "Wood");
  displayedGoods.add(wood ? wood.i : enabledGoods[0].i);
}

export function open(): void {
  if (getViewContext().customization) return;

  ensureDisplayedGoodsInitialized();
  if (!layerIsOn("toggleGoods")) getApi().toggleLayerById("toggleGoods");
  else drawGoods(displayedGoods);

  goodsEditorAddLines();
}

export function goodsEditorAddLines(): void {
  const { isAssignMode, selectedAssignGoodId } = getGoodsEditorTableState();
  const production = getProduction();
  const stockData = getAllStockData();

  const enabledGoods = (worldContext().pack.goods ?? []).filter(isGoodEnabled);
  const goods = enabledGoods.map(good => {
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

  const { sortBy, sortOrder } = getGoodsEditorTableState();
  const sortedGoods = goods.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "type") cmp = a.types.join(",").localeCompare(b.types.join(","));
    else if (sortBy === "produced") cmp = a.produced - b.produced;
    else if (sortBy === "stock") cmp = a.stock - b.stock;
    else if (sortBy === "baseprice") cmp = a.basePrice - b.basePrice;

    return sortOrder === "asc" ? cmp : -cmp;
  });

  setGoodsEditorTableState({
    goods: sortedGoods,
    totalProduced,
    totalStock,
    displayedCount: goods.filter(good => displayedGoods.has(good.i)).length,
    isPercentageMode: false,
    hasTagFilter: visibleTags.size > 0,
    isAssignMode,
    selectedAssignGoodId
  });
}

export function toggleSortBy(column: string): void {
  const { sortBy, sortOrder } = getGoodsEditorTableState();
  if (sortBy === column) {
    setGoodsEditorTableState({ sortOrder: sortOrder === "asc" ? "desc" : "asc" });
  } else {
    setGoodsEditorTableState({ sortBy: column, sortOrder: "desc" }); // usually desc first for numbers, but we can just use "asc" for names if we want, desc is a good default for numbers
  }

  // Re-sort current goods and update state without regenerating everything
  const state = getGoodsEditorTableState();
  const sortedGoods = [...state.goods].sort((a, b) => {
    let cmp = 0;
    if (state.sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (state.sortBy === "type") cmp = a.types.join(",").localeCompare(b.types.join(","));
    else if (state.sortBy === "produced") cmp = a.produced - b.produced;
    else if (state.sortBy === "stock") cmp = a.stock - b.stock;
    else if (state.sortBy === "baseprice") cmp = a.basePrice - b.basePrice;

    return state.sortOrder === "asc" ? cmp : -cmp;
  });
  setGoodsEditorTableState({ goods: sortedGoods });
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
  for (const good of (worldContext().pack.goods || []).filter(isGoodEnabled)) {
    result[good.i] = { total: 0, sources: [] };
  }

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

  for (const good of (worldContext().pack.goods || []).filter(isGoodEnabled)) {
    result[good.i].total = rn(result[good.i].total, 2);
  }

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
  const tags = unique((worldContext().pack.goods || []).filter(isGoodEnabled).flatMap(good => good.tags));

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

export function enterResourceAssignMode(): void {
  const { isAssignMode } = getGoodsEditorTableState();
  if (isAssignMode) {
    exitResourceAssignMode();
    return;
  }
  getViewContext().customization = 14;
  setGoodsEditorTableState({ isAssignMode: true, selectedAssignGoodId: null });
  if (!layerIsOn("toggleGoods")) getApi().toggleLayerById("toggleGoods");
  if (!layerIsOn("toggleCells")) {
    cellsWasForced = true;
    getApi().toggleLayerById("toggleCells");
  }

  tip("Select good line in editor, click on cells to remove or add a bonus resource", true);
  viewbox().on("click.goodsAssign", (event: MouseEvent) => {
    const point = pointer(event, getViewContext().viewbox.node()!);
    const cellId = findCell(point[0], point[1]);
    if (cellId === undefined) return;

    const selectedGoodId = getGoodsEditorTableState().selectedAssignGoodId;
    if (!selectedGoodId) return;

    if (worldContext().pack.cells.good[cellId]) {
      worldContext().pack.cells.good[cellId] = 0;
    } else {
      const resource = Goods.get(selectedGoodId);
      if (!resource) return;
      worldContext().pack.cells.good[cellId] = selectedGoodId;
      displayedGoods.add(selectedGoodId);
    }

    drawGoods(displayedGoods);
  });
}

export function handleGoodRowClick(goodId: number): void {
  if (getViewContext().customization !== 14) return;
  setGoodsEditorTableState({ selectedAssignGoodId: goodId });
}

function exitResourceAssignMode(close?: string): void {
  getViewContext().customization = 0;
  setGoodsEditorTableState({ isAssignMode: false, selectedAssignGoodId: null });

  if (cellsWasForced && layerIsOn("toggleCells")) getApi().toggleLayerById("toggleCells");
  cellsWasForced = false;

  viewbox().on("click.goodsAssign", null);

  if (!close) goodsEditorAddLines();

  getApi().restoreDefaultEvents();
  clearMainTip();
}

export function downloadGoodsData(): void {
  const cellsByGood: Record<number, number> = {};
  for (const goodId of worldContext().pack.cells.good) {
    if (goodId) cellsByGood[goodId] = (cellsByGood[goodId] || 0) + 1;
  }

  const production = getProduction();
  const stockData = getAllStockData();

  let data =
    "Id,Good,Color,Type,Tags,Value,Demand Coverage,Chance,Model,Trade Weight,Trade Bulk,Rarity,Distance Premium,Time Value Trend,Durability,Loss Risk,Cells,Produced,Stock\n";

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

    const trade = good.trade ?? getDefaultGoodTradeProfile(good);

    data += `${good.i},${good.name},${good.color},${types},${tags},${good.value},${demandCoverage},${good.chance ?? ""},${good.distribution ?? ""},${trade.weight},${trade.bulk},${trade.rarity},${trade.distancePremium},${trade.timeValueTrend},${trade.durability},${trade.lossRisk},${cells},${produced},${stock}\n`;
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
    for (const good of (worldContext().pack.goods || []).filter(isGoodEnabled)) displayedGoods.add(good.i);
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

export function editGoodDistribution(goodId: number): void {
  const good = Goods.get(goodId);
  if (!good) return;

  DistributionEditor.open(
    draft => {
      const normalizedDistribution = draft.distribution.trim();
      good.name = draft.name;
      good.color = draft.color;
      good.icon = draft.icon;
      good.value = Math.max(0, draft.value);
      good.unit = draft.unit;
      good.tags = draft.tagsText
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);
      good.distribution = normalizedDistribution || undefined;
      good.chance = good.distribution ? Math.max(0, Math.min(100, draft.chance)) : undefined;

      Goods.sync();
      regenerateEconomyForGood(good.i);
    },
    {
      dialogTitle: `Edit ${good.name}`,
      name: good.name,
      color: good.color,
      icon: good.icon,
      value: good.value,
      unit: good.unit,
      tagsText: (good.tags || []).join(", "),
      chance: good.chance ?? 4,
      distribution: good.distribution ?? ""
    }
  );
}

export function addGood(): void {
  DistributionEditor.open(draft => {
    const goods = worldContext().pack.goods || [];
    const nextId = goods.reduce((maxId, existingGood) => Math.max(maxId, existingGood.i), 0) + 1;
    const normalizedDistribution = draft.distribution.trim();

    const good = {
      i: nextId,
      name: draft.name,
      tags: draft.tagsText
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean),
      value: Math.max(0, draft.value),
      unit: draft.unit.trim() || "unit",
      icon: draft.icon.trim() || "good-wood",
      color: draft.color,
      chance: normalizedDistribution ? Math.max(0, Math.min(100, draft.chance)) : undefined,
      distribution: normalizedDistribution || undefined
    };

    worldContext().pack.goods.push({ ...good, trade: getDefaultGoodTradeProfile(good) });

    Goods.sync();
    displayedGoods.add(nextId);
    regenerateEconomyForGood(nextId);
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
