import type {
  ExtensionWebglColor,
  ExtensionWebglLayerSpec,
  ExtensionWebglPolygonDatum,
  ExtensionWebglScatterDatum
} from "../../../types/extension-api";
import { getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { getCellProduction } from "../generators/production-utils";

const MIN_GOODS_ALPHA = 26;
const MAX_GOODS_ALPHA = 230;

export function createEconomyWebglLayerSpec(): ExtensionWebglLayerSpec {
  return {
    build: () => {
      const displayedGoods = getDefaultGoodsSet();
      return [
        {
          type: "polygon" as const,
          id: "economy-goods-cells",
          toggle: "toggleGoods",
          data: buildGoodsCellPolygons(displayedGoods),
          pickable: true
        },
        {
          type: "scatter" as const,
          id: "economy-goods-sources",
          toggle: "toggleGoods",
          data: buildGoodsSourceSymbols(displayedGoods),
          radiusUnits: "common" as const,
          pickable: true
        },
        {
          type: "polygon" as const,
          id: "economy-market-areas",
          toggle: "toggleMarketsLayer",
          data: buildMarketAreaPolygons(),
          pickable: true
        },
        {
          type: "scatter" as const,
          id: "economy-market-centers",
          toggle: "toggleMarketsLayer",
          data: buildMarketCenterSymbols(),
          radiusUnits: "common" as const,
          pickable: true
        }
      ];
    }
  };
}

function getDefaultGoodsSet(): Set<number> {
  const goods = getWorldContext().pack.goods ?? [];
  const wood = goods.find(good => good.name === "Wood");
  return wood ? new Set([wood.i]) : new Set(goods.map(good => good.i));
}

function buildGoodsCellPolygons(displayedGoods: ReadonlySet<number>): ExtensionWebglPolygonDatum[] {
  if (!displayedGoods.size) return [];

  const worldContext = getWorldContext();
  const biomeProduction = Goods.getBiomesProduction();
  const cells: Array<{ cellId: number; total: number; produced: ReadonlyMap<number, number> }> = [];
  let maxTotal = 0;

  for (const cellId of worldContext.pack.cells.i) {
    const produced = getCellProduction(cellId, biomeProduction);
    const displayed = new Map<number, number>();
    let total = 0;
    for (const [goodIdText, amount] of Object.entries(produced)) {
      const goodId = Number(goodIdText);
      if (!displayedGoods.has(goodId) || amount <= 0) continue;
      displayed.set(goodId, amount);
      total += amount;
    }
    if (!total) continue;
    cells.push({ cellId, total, produced: displayed });
    maxTotal = Math.max(maxTotal, total);
  }

  if (!maxTotal) return [];
  const polygons: ExtensionWebglPolygonDatum[] = [];
  for (const cell of cells) {
    const polygon = getCellPolygon(cell.cellId);
    if (!polygon) continue;
    const alpha = Math.round(MIN_GOODS_ALPHA + (MAX_GOODS_ALPHA - MIN_GOODS_ALPHA) * (cell.total / maxTotal));
    for (const [goodId] of cell.produced) {
      const good = Goods.get(goodId);
      if (!good) continue;
      polygons.push({
        id: `economy-goods-cell-${cell.cellId}-${goodId}`,
        kind: "extension",
        extensionId: "economy",
        cellId: cell.cellId,
        polygon,
        fillColor: colorToRgba(good.color, alpha)
      });
    }
  }
  return polygons;
}

function buildGoodsSourceSymbols(displayedGoods: ReadonlySet<number>): ExtensionWebglScatterDatum[] {
  const worldContext = getWorldContext();
  const symbols: ExtensionWebglScatterDatum[] = [];
  for (const cellId of worldContext.pack.cells.i) {
    const goodId = worldContext.pack.cells.good[cellId];
    if (!goodId || !displayedGoods.has(goodId)) continue;
    const good = Goods.get(goodId);
    const position = worldContext.pack.cells.p[cellId];
    if (!good || !position) continue;
    const color = colorToRgba(good.color);
    symbols.push({
      id: `economy-goods-source-${cellId}`,
      kind: "extension",
      extensionId: "economy",
      cellId,
      position,
      fillColor: color,
      lineColor: getContrastingColor(color),
      radius: 3,
      lineWidth: 1
    });
  }
  return symbols;
}

function buildMarketAreaPolygons(): ExtensionWebglPolygonDatum[] {
  const worldContext = getWorldContext();
  if (!worldContext.pack.cells.market || !worldContext.pack.markets?.length) return [];

  const polygons: ExtensionWebglPolygonDatum[] = [];
  for (const cellId of worldContext.pack.cells.i) {
    const marketId = worldContext.pack.cells.market[cellId];
    if (!marketId) continue;
    const market = worldContext.pack.markets[marketId];
    const polygon = getCellPolygon(cellId);
    if (!market || !polygon) continue;
    polygons.push({
      id: `economy-market-area-${marketId}-${cellId}`,
      kind: "extension",
      extensionId: "economy",
      cellId,
      polygon,
      fillColor: colorToRgba(market.color || "#dababf", 72)
    });
  }
  return polygons;
}

function buildMarketCenterSymbols(): ExtensionWebglScatterDatum[] {
  const worldContext = getWorldContext();
  const symbols: ExtensionWebglScatterDatum[] = [];
  for (const market of worldContext.pack.markets ?? []) {
    const burg = worldContext.pack.burgs[market.centerBurgId];
    if (!burg || burg.removed) continue;
    const fillColor = colorToRgba(market.color || "#dababf");
    symbols.push({
      id: `economy-market-center-${market.i}`,
      kind: "extension",
      extensionId: "economy",
      cellId: burg.cell,
      position: [burg.x, burg.y],
      fillColor,
      lineColor: getContrastingColor(fillColor),
      radius: 4,
      lineWidth: 1
    });
  }
  return symbols;
}

function getCellPolygon(cellId: number): readonly [number, number][] | null {
  const { cells, vertices } = getWorldContext().pack;
  const vertexIds = cells.v[cellId];
  if (!vertexIds?.length) return null;
  const polygon: [number, number][] = [];
  for (const vertexId of vertexIds) {
    const point = vertices.p[vertexId];
    if (!point) return null;
    polygon.push(point);
  }
  return polygon;
}

function colorToRgba(value: string, alpha = 255): ExtensionWebglColor {
  const normalized = value.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
      alpha
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      alpha
    ];
  }
  return [153, 153, 153, alpha];
}

function getContrastingColor([red, green, blue]: ExtensionWebglColor): ExtensionWebglColor {
  const lightness = red * 0.299 + green * 0.587 + blue * 0.114;
  return lightness > 160 ? [40, 40, 47, 255] : [245, 245, 245, 255];
}
