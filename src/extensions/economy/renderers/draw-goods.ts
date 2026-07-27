import { createLayerCanvas } from "../../hostCore";
import { getPackPolygon, normalize, rn, TIME } from "../../hostUtils";
import {
  getBurgProductionRecords,
  getGoodCellColumn,
  getGoods,
  getGoodsLayer,
  getWorldContext
} from "../economyContext";
import type { Good } from "../generators/goods-generator";
import { Goods } from "../generators/goods-generator";
import { Production } from "../generators/production-generator";
import { getCellProduction } from "../generators/production-utils";

const SUBGROUPS = ["goodsCells", "goodsIcons", "goodsBurgs"] as const;

const SIZE = 6;
const HALF = SIZE / 2;

const PLATE_ICON = 3;
const PLATE_FONT = 3.5;
const PLATE_GAP = 0.2;
const PLATE_ENTRY_GAP = 0.8;
const PLATE_DY = 0;
const PLATE_PAD_X = 1;
const PLATE_PAD_Y = 0.6;
const PLATE_RX = 1;
const PLATE_FILL = "#f5f5f5";
// A mapped resource is geographical information, not necessarily current rural
// production. Keep it visible even when its economic output is supplied by a mine.
const RESOURCE_CELL_OPACITY = 0.45;

// Burg production plates remain density-managed; resource icons themselves are always
// visible while the Goods layer is enabled, matching the upstream map behavior.
const MIN_BURG_SCALE = 1.5;
const MAX_BURG_SCALE = 8;

export function drawGoods(displayedGoods: ReadonlySet<number>) {
  TIME && console.time("drawGoods");
  ensureSubgroups();

  const biomeProduction = Goods.getBiomesProduction();
  drawGoodsCellsCanvas(displayedGoods, biomeProduction);

  const burgWeights = computeBurgWeights(displayedGoods);
  const burgMinScales = weightsToMinScales(burgWeights);

  getGoodsLayer()?.select("#goodsIcons").html(buildGoodsIconsContent(displayedGoods));
  getGoodsLayer()?.select("#goodsBurgs").html(buildGoodsBurgsContent(displayedGoods, burgMinScales));

  getGoodsLayer()?.style("display", null);
  TIME && console.timeEnd("drawGoods");

  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
}

function ensureSubgroups() {
  const goods = getGoodsLayer();
  if (!goods) return;
  for (const id of SUBGROUPS) {
    if (goods.select(`#${id}`).empty()) goods.append("g").attr("id", id);
  }
}

/**
 * Draws the cell production heatmap and then overlays mapped resource cells. The latter
 * is deliberately display-only: mine-supplied goods are not rural production, but their
 * mapped source locations must remain visible on the Goods layer.
 */
function drawGoodsCellsCanvas(
  displayedGoods: ReadonlySet<number>,
  biomeProduction: Record<number, { goodId: number; production: number }[]>
): void {
  const { graphWidth, graphHeight } = getWorldContext();
  const node = getGoodsLayer()?.select<SVGGElement>("#goodsCells").node();
  if (!node) return;
  const ctx = createLayerCanvas(node, graphWidth, graphHeight);

  if (!displayedGoods.size) return;

  // First pass: accumulate total production per cell to find the global max
  const cellTotals = new Map<number, { produced: Map<number, number>; total: number }>();
  const resourceOnlyCells = new Map<number, number>();
  const goodCellColumn = getGoodCellColumn();
  let maxTotal = 0;
  for (const cellId of getWorldContext().pack.cells.i) {
    let total = 0;
    const produced = getCellProduction(cellId, biomeProduction);
    const filteredProduced = Object.entries(produced).reduce((map, [goodId, amount]) => {
      if (displayedGoods.has(+goodId)) {
        map.set(+goodId, amount as number);
        total += amount as number;
      }
      return map;
    }, new Map<number, number>());

    const resourceGoodId = goodCellColumn[cellId];
    if (resourceGoodId && displayedGoods.has(resourceGoodId) && !filteredProduced.has(resourceGoodId)) {
      resourceOnlyCells.set(cellId, resourceGoodId);
    }

    if (!total) continue;

    cellTotals.set(cellId, { produced: filteredProduced, total });
    if (total > maxTotal) maxTotal = total;
  }

  // Second pass: draw polygons onto canvas with opacity normalized against the global max
  if (maxTotal > 0) {
    for (const [cellId, { produced, total }] of cellTotals) {
      const opacity = rn(0.1 + 0.9 * normalize(total, 0, maxTotal), 2);
      const points = getPackPolygon(cellId, getWorldContext().pack);
      for (const [goodId, amount] of produced) {
        if (amount <= 0) continue;
        const good = Goods.get(goodId);
        if (!good) continue;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = good.color;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Resource-only cells include mine-supplied metals. They do not add production or
  // market stock; this overlay only restores their geographic map representation.
  for (const [cellId, goodId] of resourceOnlyCells) {
    const good = Goods.get(goodId);
    if (!good) continue;
    const points = getPackPolygon(cellId, getWorldContext().pack);
    ctx.globalAlpha = RESOURCE_CELL_OPACITY;
    ctx.fillStyle = good.color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  }
}

/** Returns Map<burgId, totalDisplayedProduction> for burg plate min-scale computation. */
function computeBurgWeights(displayedGoods: ReadonlySet<number>): Map<number, number> {
  const result = new Map<number, number>();
  for (const burg of getWorldContext().pack.burgs) {
    if (!burg.i || burg.removed || !getBurgProductionRecords(burg).length) continue;
    const produced = Production.getBurgProduction(burg);
    let total = 0;
    for (const goodId of displayedGoods) total += produced[goodId] || 0;
    if (total > 0) result.set(burg.i, total);
  }
  return result;
}

/** Normalizes burg production weights to zoom scale thresholds. Higher weight → lower minScale. */
function weightsToMinScales(weights: Map<number, number>): Map<number, number> {
  const maxWeight = Math.max(...weights.values(), 1);
  const result = new Map<number, number>();
  for (const [id, weight] of weights) {
    const normalized = weight / maxWeight;
    result.set(id, rn(MAX_BURG_SCALE - normalized * (MAX_BURG_SCALE - MIN_BURG_SCALE), 2));
  }
  return result;
}

function buildGoodsIconsContent(displayedGoods: ReadonlySet<number>): string {
  const goodCellColumn = getGoodCellColumn();
  if (!displayedGoods.size || !goodCellColumn.length) return "";

  const drawCircle = +(getGoodsLayer()?.select("#goodsIcons").attr("data-circle") ?? 0);
  let html = "";
  for (const cellId of getWorldContext().pack.cells.i) {
    const goodId = goodCellColumn[cellId];
    if (!goodId || !displayedGoods.has(goodId)) continue;
    const good = Goods.get(goodId);
    if (!good) continue;

    const [x, y] = getWorldContext().pack.cells.p[cellId];
    const stroke = Goods.getStroke(good.color);
    html += `<g data-i="${good.i}" data-x="${rn(x, 1)}" data-y="${rn(y, 1)}" data-min-scale="0">${
      drawCircle ? `<circle cx="${x}" cy="${y}" r="${HALF}" fill="${good.color}" stroke="${stroke}" />` : ""
    }<use href="#${good.icon}" x="${x - HALF}" y="${y - HALF}" width="${SIZE}" height="${SIZE}"/></g>`;
  }
  return html;
}

function buildGoodsBurgsContent(displayedGoods: ReadonlySet<number>, burgMinScales: Map<number, number>): string {
  if (!displayedGoods.size) return "";

  let html = "";
  for (const burg of getWorldContext().pack.burgs) {
    if (!burg.i || burg.removed || !getBurgProductionRecords(burg).length) continue;

    const produced = Production.getBurgProduction(burg);
    const entries: { good: Good; value: number; width: number }[] = [];

    for (const good of getGoods()) {
      if (!displayedGoods.has(good.i)) continue;
      const raw = produced[good.i];
      if (!raw || raw <= 0) continue;

      const value = rn(raw, 1);
      if (entries.length === 3 && value <= entries[2].value) continue;

      const width = PLATE_ICON + PLATE_GAP + String(value).length * 1.2 + 0.4 * PLATE_FONT * 0.62;

      let i = entries.length;
      while (i > 0 && entries[i - 1].value < value) i--;
      entries.splice(i, 0, { good, value, width });
      if (entries.length > 3) entries.pop();
    }
    if (!entries.length) continue;

    const contentWidth = entries.reduce((sum, e) => sum + e.width, 0) + PLATE_ENTRY_GAP * (entries.length - 1);
    const plateWidth = contentWidth + PLATE_PAD_X * 2;
    const plateHeight = PLATE_ICON + PLATE_PAD_Y * 2;
    const plateX = burg.x - plateWidth / 2;
    const plateY = burg.y + PLATE_DY;
    const iconY = plateY + PLATE_PAD_Y;
    const mid = iconY + PLATE_ICON / 2;

    const minScale = burgMinScales.get(burg.i) ?? MAX_BURG_SCALE;

    let content = `<rect x="${rn(plateX, 1)}" y="${rn(plateY, 1)}" width="${rn(plateWidth, 1)}" height="${rn(plateHeight, 1)}" rx="${PLATE_RX}" fill="${PLATE_FILL}"/>`;
    let offset = plateX + PLATE_PAD_X;
    for (const { good, value, width } of entries) {
      const stroke = Goods.getStroke(good.color);
      content += `<circle cx="${rn(offset + PLATE_ICON / 2, 1)}" cy="${rn(mid, 1)}" r="${PLATE_ICON / 2}" fill="${good.color}" stroke="${stroke}"/>`;
      content += `<use href="#${good.icon}" x="${rn(offset, 1)}" y="${rn(iconY, 1)}" width="${PLATE_ICON}" height="${PLATE_ICON}"/>`;
      content += `<text x="${rn(offset + PLATE_ICON + PLATE_GAP, 1)}" y="${rn(mid, 1)}" dominant-baseline="central" font-size="${PLATE_FONT}px" fill="#28282f" stroke="none">${value}</text>`;
      offset += width + PLATE_ENTRY_GAP;
    }

    html += `<g data-id="${burg.i}" data-x="${rn(burg.x, 1)}" data-y="${rn(burg.y, 1)}" data-min-scale="${minScale}">${content}</g>`;
  }
  return html;
}
