// @ts-nocheck

import { pointer } from "d3";
import { zoomTo } from "../../../actions";
import { viewContext } from "../../../context/viewContext";
import { worldContext } from "../../../context/worldContext";
import { toggleCells, toggleGoods } from "../../../controllers/layers";
import { rn, unique } from "../../../utils";
import { alertMessage } from "../../../utils/alertMessageEl";
import { layerIsOn } from "../../../utils/nodeUtils";
import { clearMainTip, tip } from "../../../utils/uiHelpers";
import { Goods } from "../modules/goods-generator";
import { Markets } from "../modules/markets-generator";
import { isDealRecord, isMfgRecord, Production } from "../modules/production-generator";
import { getCellProduction } from "../modules/production-utils";
import { drawGoods } from "../renderers/draw-goods";

const viewbox = viewContext.viewbox;
const _options = worldContext.options;

// Mock jQuery and window objects since they're mostly removed
const _$ = _selector => {
  return {
    dialog: () => {},
    draggable: () => {},
    on: () => {}
  };
};

// Mock other missing globals
const restoreDefaultEvents = () => {};
const applySorting = () => {};
const downloadFile = () => {};
const getFileName = () => "data";
const confirmationDialog = () => {};
const closeDialogs = () => {};
let _isInitialized = false;
const visibleTags = new Set<string>();
const displayedGoods = new Set<number>();
let displayedGoodsInitialized = false;

function refreshEditor() {
  goodsEditorAddLines();
  drawGoods(displayedGoods);
}

function ensureDisplayedGoodsInitialized() {
  if (displayedGoodsInitialized) return;
  displayedGoodsInitialized = true;
  if (!worldContext.pack.goods?.length) return;

  const wood = worldContext.pack.goods.find(g => g.name === "Wood");
  displayedGoods.add(wood ? wood.i : worldContext.pack.goods[0].i);
}

function _getDisplayedGoods(): Set<number> {
  ensureDisplayedGoodsInitialized();
  for (const id of displayedGoods) if (!Goods.get(id)) displayedGoods.delete(id); // drop goods removed since selection
  return displayedGoods;
}

export function open() {
  if (viewContext.customization) return;
  closeDialogs("#goodsEditor, .stable");

  ensureDisplayedGoodsInitialized();
  if (!layerIsOn("toggleGoods")) toggleGoods();
  else drawGoods(displayedGoods);

  goodsEditorAddLines();

  // dialog call removed

  const refreshBtn = document.getElementById("goodsEditorRefresh")!;
  if (!refreshBtn.dataset.initialized) {
    refreshBtn.dataset.initialized = "true";
    document.getElementById("goodsEditorRefresh")!.addEventListener("click", goodsEditorAddLines);
    document.getElementById("goodsPercentage")!.addEventListener("click", togglePercentageMode);
    document.getElementById("goodsTagsFilter")!.addEventListener("click", openTagsVisibilityDialog);
    document.getElementById("goodsAssign")!.addEventListener("click", enterResourceAssignMode);
    document.getElementById("goodsAdd")!.addEventListener("click", () => goodEditor(undefined, refreshEditor));
    document.getElementById("goodsRestore")!.addEventListener("click", goodsRestoreDefaults);
    document.getElementById("goodsExport")!.addEventListener("click", downloadGoodsData);
    document.getElementById("goodsDisplayAll")!.addEventListener("change", toggleAllDisplayed);
    document.getElementById("goodsChains")!.addEventListener("click", () => ProductionChains.open());
    document.getElementById("goodsRegenerateGoods")!.addEventListener("click", requestGoodsRegeneration);
    document.getElementById("goodsRegenerateProduction")!.addEventListener("click", requestProductionRegeneration);

    document.getElementById("goodsBody")!.addEventListener("click", ev => {
      const el = ev.target as HTMLElement;
      const cl = el.classList;
      const line = el.parentNode as HTMLElement;
      const good = Goods.get(+line.dataset.id!);
      if (!good) return;
      if (cl.contains("goodEdit")) return goodEditor(good, refreshEditor);
      if (cl.contains("goodDisplayed")) return toggleDisplayedGood(good, el as HTMLInputElement);
      if (cl.contains("icon-trash-empty")) return removeGood(good, line);
    });

    _isInitialized = true;
  }
}

function goodsEditorAddLines() {
  const body = document.getElementById("goodsBody")!;
  const production = getProduction();
  const stockData = getAllStockData();
  let lines = "";

  const renderTypeBadge = (type: string) => {
    const commonStyles =
      "display:inline-block;border-radius:3px;padding:0 .4em;font-size:0.8em;font-weight:bold;line-height:1.35";
    if (type === "RAW")
      return `<span style="${commonStyles};background:#d0e7f5;color:#036" data-tip="Raw goods are produced by rural population in cells based on biome availability and in cells and burgs when bonus resource is assigned to cells">RAW</span>`;
    return `<span style="${commonStyles};background:#f8e7bf;color:#b67a00" data-tip="Manufactured goods are produced in burgs">MFG</span>`;
  };

  for (const good of worldContext.pack.goods || []) {
    const types = [good.recipes && "MFG", good.distribution && "RAW"].filter(Boolean) as string[];
    const goodProduction = production[good.i] || { burg: 0, cell: 0 };
    const produced = rn(goodProduction.burg + goodProduction.cell);
    const producedTip = `Total good production: ${produced}⚒. Cells: ${rn(goodProduction.cell, 2)}⚒. Burgs: ${rn(goodProduction.burg, 2)}⚒`;
    const stock = rn(stockData[good.i]?.total ?? 0);
    const stockTip = `Total stock in all markets and burg inventories: ${stock} units`;

    lines += /*html*/ `<div class="states goods" data-id=${good.i} data-name="${good.name}" data-color="${good.color}" data-baseprice="${good.value}" data-produced="${produced}" data-stock="${stock}" data-type="${types.join(",")}" data-tags="${good.tags?.join(",")}">
        <input type="checkbox" data-tip="Toggle this good on the Goods map" class="native goodDisplayed hide" style="padding: 0; margin: 0; vertical-align: middle; width: 1.2em;" ${displayedGoods.has(good.i) ? "checked" : ""} />
        <svg data-tip="Good icon" width="2em" height="2em" class="goodIcon">
          <circle cx="50%" cy="50%" r="42%" fill="${good.color}" stroke="${Goods.getStroke(good.color)}"/>
          <use href="#${good.icon}" x="10%" y="10%" width="80%" height="80%"/>
        </svg>
        <div data-tip="Good name" class="goodName">${good.name}</div>
        <div data-tip="Good types" class="goodType" style="width: 6em;">${types.map(renderTypeBadge).join(" ")}</div>
        <div data-tip="${producedTip}. Click to see burgs producing this good" class="goodProduced pointer hide" style="vertical-align: middle;">
          <div style="display: inline-block;">${produced}</div>
          <div style="display: inline-block; width: 0.4em; font-size: 1.5em;">⚒</div>
        </div>
        <div data-tip="${stockTip}. Click to see breakdown by location" class="goodStock pointer hide" style="vertical-align: middle;">
          <div style="display: inline-block;">${stock}</div>
          <div style="display: inline-block; width: 0.4em; font-size: 1.2em;">⛁</div>
        </div>
        <div data-tip="Base (initial) price. Click to compare prices across markets" class="goodBasePrice pointer hide">🟡 ${good.value}</div>
        <span data-tip="Edit good" class="icon-pencil goodEdit hide"></span>
        <span data-tip="Remove good" class="icon-trash-empty hide goodRemove"></span>
      </div>`;
  }
  body.innerHTML = lines;

  const totalProduced = Object.values(production)
    .map(p => p.burg + p.cell)
    .reduce((sum, v) => sum + v, 0);
  const totalStock = Object.values(stockData).reduce((sum, d) => sum + d.total, 0);
  document.getElementById("goodsDisplayed")!.innerHTML = String(displayedGoods.size);
  document.getElementById("goodsNumber")!.innerHTML = String(worldContext.pack.goods?.length || 0);
  document.getElementById("goodsProduced")!.innerHTML = String(rn(totalProduced));
  document.getElementById("goodsStock")!.innerHTML = String(rn(totalStock));

  body.querySelectorAll("div.states").forEach(el => void el.addEventListener("click", selectResourceOnLineClick));
  body.querySelectorAll<HTMLButtonElement>(".goodProduced").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      openProducersDialog(Number(el.parentElement?.dataset?.id));
    });
  });

  body.querySelectorAll<HTMLElement>(".goodStock").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      const goodId = Number((el.closest<HTMLElement>(".states") as HTMLElement).dataset.id);
      openStockDialog(goodId);
    });
  });

  body.querySelectorAll<HTMLElement>(".goodBasePrice").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      const goodId = Number((el.closest<HTMLElement>(".states") as HTMLElement).dataset.id);
      (() => {})(goodId, "#goodsEditor");
    });
  });

  if (body.dataset.type === "percentage") {
    body.dataset.type = "absolute";
    togglePercentageMode();
  }
  updateDisplayAllCheckbox();
  applySorting(document.getElementById("goodsHeader")!);
  applyTagVisibilityFilter();
  // dialog call removed
}

function openProducersDialog(goodId: number) {
  const good = Goods.get(goodId);
  if (!good) return;

  const producers = worldContext.pack.burgs
    .filter(b => b.i && !b.removed)
    .map(b => ({ burg: b, units: Production.getBurgProduction(b)[goodId] ?? 0 }))
    .filter(({ units }) => units > 0)
    .sort((a, b) => b.units - a.units);

  if (!producers.length) {
    alertMessage.innerHTML = `<i style="color:#888">No burgs produced ${good.name}.</i>`;
  } else {
    const header = /*html*/ `
          <div class="header" style="grid-template-columns: 1.6em 7em 4em;">
            <div></div>
            <div>Burg</div>
            <div>Units</div>
         </div>`;
    const rows = producers
      .map(
        ({ burg, units }) => /*html*/ `
          <div data-tip="Click to zoom to burg" class="states pointer" data-x="${burg.x} " data-y="${burg.y}" data-id="${burg.i}">
            <div class="icon-dot-circled" style="width:1em"></div>
            <div style="width:7em;">${burg.name}</div>
            <div style="width:4em;">${units}</div>
          </div>`
      )
      .join("");
    alertMessage.innerHTML = header + rows;
    alertMessage.querySelectorAll<HTMLElement>(".states").forEach(row => {
      row.addEventListener("click", () => {
        zoomTo(Number(row.dataset.x), Number(row.dataset.y), 8, 2000);
      });
    });
  }

  // dialog call removed
}

type StockSource = { name: string; type: "market" | "burg"; x: number; y: number; id: number; stock: number };

function getAllStockData(): Record<number, { total: number; sources: StockSource[] }> {
  const dealById = new Map((worldContext.pack.deals || []).map(d => [d.i, d]));
  const result: Record<number, { total: number; sources: StockSource[] }> = {};
  for (const good of worldContext.pack.goods || []) result[good.i] = { total: 0, sources: [] };

  for (const market of worldContext.pack.markets || []) {
    const centerBurg = worldContext.pack.burgs[market.centerBurgId];
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

  for (const burg of worldContext.pack.burgs) {
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

  for (const good of worldContext.pack.goods || []) result[good.i].total = rn(result[good.i].total, 2);

  return result;
}

function openStockDialog(goodId: number) {
  const good = Goods.get(goodId);
  if (!good) return;

  const stockData = getAllStockData();
  const data = stockData[goodId];
  const sources = data?.sources ?? [];

  if (!sources.length) {
    alertMessage.innerHTML = `<i style="color:#888">No stock of ${good.name} found in any market or burg inventory.</i>`;
  } else {
    const header = /*html*/ `
      <div class="header" style="grid-template-columns: 1.6em 7em 4em;">
        <div></div>
        <div>Location</div>
        <div>Units</div>
      </div>`;
    const rows = [...sources]
      .sort((a, b) => b.stock - a.stock)
      .map(
        source => /*html*/ `
        <div data-tip="Click to zoom to location" class="states pointer" data-x="${source.x}" data-y="${source.y}" data-id="${source.id}">
          <div class="${source.type === "market" ? "icon-store" : "icon-dot-circled"}" style="width:1em"></div>
          <div style="width:7em;">${source.name}</div>
          <div style="width:4em;">${source.stock}</div>
        </div>`
      )
      .join("");
    alertMessage.innerHTML = header + rows;
    alertMessage.querySelectorAll<HTMLElement>(".states").forEach(row => {
      row.addEventListener("click", () => {
        zoomTo(Number(row.dataset.x), Number(row.dataset.y), 8, 2000);
      });
    });
  }

  // dialog call removed
}

function getProduction() {
  const production: Record<number, { burg: number; cell: number }> = {};
  const addProduction = (goodId: number, amount: number, type: "burg" | "cell") => {
    if (!production[goodId]) production[goodId] = { burg: 0, cell: 0 };
    production[goodId][type] += amount;
  };

  // rural production
  const productionByBiome = Goods.getBiomesProduction();
  for (const cellId of worldContext.pack.cells.i) {
    const produced = getCellProduction(cellId, productionByBiome);
    for (const goodId in produced) {
      addProduction(Number(goodId), produced[goodId] || 0, "cell");
    }
  }

  // burg production
  for (const burg of worldContext.pack.burgs) {
    if (!burg || burg.removed || !burg.production) continue;
    const produced = Production.getBurgProduction(burg);
    for (const goodId in produced) {
      addProduction(Number(goodId), produced[goodId] || 0, "burg");
    }
  }

  return production;
}

function openTagsVisibilityDialog() {
  const tags = unique((worldContext.pack.goods || []).flatMap(good => good.tags));
  const renderTag = (tag: string) =>
    `<label style="display: flex; align-items: center;"><input type="checkbox" class="native" value="${tag}" ${visibleTags.has(tag) ? "checked" : ""} /> ${tag}</label>`;
  const tagsMarkup = tags.length ? tags.map(renderTag).join("") : '<div style="color:#666">No tags available</div>';

  alertMessage.innerHTML = `
    <div data-tip="Only goods with at least one selected tag remain visible in the editor list" style="display: grid; grid-template-columns: 1fr 1fr 1fr; column-gap: 0.3em;">${tagsMarkup}</div>
  `;

  // dialog call removed
}

function applyTagVisibilityFilter() {
  const body = document.getElementById("goodsBody")!;
  const hasFilter = visibleTags.size > 0;

  body.querySelectorAll<HTMLElement>(":scope > div.states").forEach(line => {
    const lineTags = line.dataset.tags?.split(",") || [];
    const matches = !hasFilter || lineTags.some(tag => visibleTags.has(tag));
    line.classList.toggle("hidden", !matches);
  });

  const filterBtn = document.getElementById("goodsTagsFilter");
  if (filterBtn) filterBtn.classList.toggle("active", hasFilter);
}

function goodsRestoreDefaults() {
  confirmationDialog({
    title: "Restore default goods",
    message: "Are you sure you want to restore default goods? <br>This action cannot be reverted",
    confirm: "Restore",
    onConfirm: () => {
      Goods.restoreDefaults();
      Goods.generate();
      regenerateEconomy();
    }
  });
}

function togglePercentageMode() {
  const body = document.getElementById("goodsBody")!;
  if (body.dataset.type === "absolute") {
    body.dataset.type = "percentage";
    let totalProduced = 0;
    let totalStock = 0;

    body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
      totalProduced += +el.dataset.produced! || 0;
      totalStock += +el.dataset.stock! || 0;
    });

    body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
      const producedEl = el.querySelector<HTMLElement>(".goodProduced");
      if (producedEl) {
        const produced = +el.dataset.produced! || 0;
        producedEl.innerHTML = `${rn(totalProduced ? (produced / totalProduced) * 100 : 0, 2)}%`;
      }
      const stockEl = el.querySelector<HTMLElement>(".goodStock");
      if (stockEl) {
        const stock = +el.dataset.stock! || 0;
        stockEl.innerHTML = `${rn(totalStock ? (stock / totalStock) * 100 : 0, 2)}%`;
      }
    });
  } else {
    body.dataset.type = "absolute";
    goodsEditorAddLines();
  }
}

function enterResourceAssignMode(this: HTMLElement) {
  if (this.classList.contains("pressed")) return exitResourceAssignMode();
  viewContext.customization = 14;
  this.classList.add("pressed");
  if (!layerIsOn("toggleGoods")) toggleGoods();
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

  // dialog call removed

  tip("Select good line in editor, click on cells to remove or add a bonus resource", true);
  viewbox.on("click", changeResourceOnCellClick);
}

function selectResourceOnLineClick(this: HTMLElement) {
  if (viewContext.customization !== 14) return;
  const body = document.getElementById("goodsBody")!;
  body.querySelector<HTMLElement>("div.selected")?.classList.remove("selected");
  this.classList.add("selected");
}

function changeResourceOnCellClick(this: SVGElement) {
  const body = document.getElementById("goodsBody")!;
  const point = pointer(event, this);
  const cellId = findCell(...point);
  if (cellId === undefined) return;

  const selected = body.querySelector<HTMLElement>("div.selected");
  if (!selected) return;

  if (worldContext.pack.cells.good[cellId]) {
    worldContext.pack.cells.good[cellId] = 0;
  } else {
    const resourceId = +selected.dataset.id!;
    const resource = Goods.get(resourceId);
    if (!resource) return;
    worldContext.pack.cells.good[cellId] = resourceId;
    displayedGoods.add(resourceId);
  }

  drawGoods(displayedGoods);
}

function exitResourceAssignMode(close?: string) {
  const body = document.getElementById("goodsBody")!;
  viewContext.customization = 0;
  document.getElementById("goodsAssign")!.classList.remove("pressed");

  if (layerIsOn("toggleCells")) {
    const toggler = document.getElementById("toggleCells") as HTMLButtonElement;
    if (toggler.dataset.forced) toggleCells();
    delete toggler.dataset.forced;
  }

  document
    .getElementById("goodsEditor")!
    .querySelectorAll(".hide")
    .forEach(el => void el.classList.remove("hidden"));
  document.getElementById("goodsHeader")!.style.cssText = "grid-template-columns: 4em 7.4em 7em 6.8em 6em 4.6em 1.6em;";

  if (!close) goodsEditorAddLines();

  restoreDefaultEvents();
  clearMainTip();
  const selected = body.querySelector("div.selected");
  if (selected) selected.classList.remove("selected");
}

function downloadGoodsData() {
  const cellsByGood: Record<number, number> = {};
  for (const goodId of worldContext.pack.cells.good) {
    if (goodId) cellsByGood[goodId] = (cellsByGood[goodId] || 0) + 1;
  }

  const production = getProduction();
  const stockData = getAllStockData();

  let data = "Id,Good,Color,Type,Tags,Value,Demand Coverage,Chance,Model,Cells,Produced,Stock\n";

  for (const good of worldContext.pack.goods || []) {
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

  const name = `${getFileName("Goods")}.csv`;
  downloadFile(data, name);
}

function toggleDisplayedGood(good: Good, el: HTMLInputElement) {
  if (el.checked) displayedGoods.add(good.i);
  else displayedGoods.delete(good.i);

  updateDisplayAllCheckbox();
  drawGoods(displayedGoods);
}

function toggleAllDisplayed(this: HTMLInputElement) {
  if (this.checked) for (const good of worldContext.pack.goods || []) displayedGoods.add(good.i);
  else displayedGoods.clear();

  document
    .getElementById("goodsBody")!
    .querySelectorAll<HTMLInputElement>(".goodDisplayed")
    .forEach(checkbox => {
      const id = Number((checkbox.closest(".states") as HTMLElement).dataset.id);
      checkbox.checked = displayedGoods.has(id);
    });

  drawGoods(displayedGoods);
}

function updateDisplayAllCheckbox() {
  const master = document.getElementById("goodsDisplayAll") as HTMLInputElement;
  const total = (worldContext.pack.goods || []).length;
  master.checked = total > 0 && displayedGoods.size === total;
  master.indeterminate = displayedGoods.size > 0 && displayedGoods.size < total;
  document.getElementById("goodsDisplayed")!.innerHTML = String(displayedGoods.size);
}

function requestGoodsRegeneration() {
  confirmationDialog({
    title: "Regenerate bonus goods",
    message:
      "Are you sure you want to regenerate bonus goods placement? Generation will be based on the current Goods settings and won't affect production or trade",
    confirm: "Regenerate",
    onConfirm: () => {}
  });
}

function requestProductionRegeneration() {
  confirmationDialog({
    title: "Regenerate production",
    message:
      "Are you sure you want to regenerate production and trade for all goods? Generation will be based on the current Goods settings and bonus goods placement",
    confirm: "Regenerate",
    onConfirm: () => {}
  });
}

function removeGood(good: Good, line: HTMLElement) {
  const message = "Are you sure you want to remove the resource? <br>This action cannot be reverted";
  const onConfirm = () => {
    for (const i of worldContext.pack.cells.i) {
      if (worldContext.pack.cells.good[i] === good.i) {
        worldContext.pack.cells.good[i] = 0;
      }
    }

    worldContext.pack.goods = worldContext.pack.goods.filter(g => g.i !== good.i);
    Goods.sync();
    displayedGoods.delete(good.i);
    line.remove();
    document.getElementById("goodsNumber")!.innerHTML = String(worldContext.pack.goods.length);

    updateDisplayAllCheckbox();
    drawGoods(displayedGoods);
  };
  confirmationDialog({ title: "Remove resource", message, confirm: "Remove", onConfirm });
}

function _closeGoodsEditor() {
  if (viewContext.customization === 14) exitResourceAssignMode("close");
  document.getElementById("goodsBody")!.innerHTML = "";
}
