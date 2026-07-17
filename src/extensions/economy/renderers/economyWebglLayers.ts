import type {
  ExtensionWebglColor,
  ExtensionWebglIconDatum,
  ExtensionWebglLayer,
  ExtensionWebglLayerSpec,
  ExtensionWebglPathDatum,
  ExtensionWebglPolygonDatum,
  ExtensionWebglScatterDatum
} from "../../../types/extension-api";
import { getCaravans, getGoodCellColumn, getMarketCellColumn, getMarkets, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { getCellProduction } from "../generators/production-utils";
import { TradeAnimation } from "../generators/trade-animation";
import { getDisplayedGoodIds } from "../store/goodsDisplaySelection";
import { getCaravanPosition, getHighlightedPoints } from "./draw-trade-animation";

const MIN_GOODS_ALPHA = 26;
const MAX_GOODS_ALPHA = 230;

export function createEconomyWebglLayerSpec(): ExtensionWebglLayerSpec {
  return {
    build: (): readonly ExtensionWebglLayer[] => {
      const displayedGoods = getDisplayedGoodIds();
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
        },
        {
          type: "icon" as const,
          id: "economy-trade-caravans",
          toggle: "toggleTrade",
          data: buildTradeCaravanIcons(),
          pickable: true
        },
        {
          type: "path" as const,
          id: "economy-trade-highlight",
          toggle: "toggleTrade",
          data: buildTradeHighlightPaths(),
          pickable: false
        }
      ];
    }
  };
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
  const goodCellColumn = getGoodCellColumn();
  const symbols: ExtensionWebglScatterDatum[] = [];
  for (const cellId of worldContext.pack.cells.i) {
    const goodId = goodCellColumn[cellId];
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
  const marketCellColumn = getMarketCellColumn();
  const markets = getMarkets();
  if (!marketCellColumn.length || !markets.length) return [];

  const polygons: ExtensionWebglPolygonDatum[] = [];
  for (const cellId of worldContext.pack.cells.i) {
    const marketId = marketCellColumn[cellId];
    if (!marketId) continue;
    const market = markets[marketId];
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
  for (const market of getMarkets()) {
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

function buildTradeCaravanIcons(): ExtensionWebglIconDatum[] {
  const caravans = getCaravans().filter(c => c.state === "transit");
  if (!caravans.length) return [];

  const animOptions = TradeAnimation.getOptions();
  const size = animOptions.markerSize;

  return caravans.map(c => {
    const { x, y, angle, type } = getCaravanPosition(c);
    const imgSize = type === "land" ? size / 1.6 : size;
    const iconUrl = type === "land" ? "./images/markers/wagon.svg" : "./images/markers/ship.svg";

    const dealId = c.payload[0]?.dealId ?? 0;
    return {
      id: `economy-caravan-${c.i}-${c.seller}-${c.buyer}-${dealId}`,
      position: [x, y],
      angle,
      size: imgSize,
      iconUrl,
      kind: "extension",
      extensionId: "economy",
      caravan: c
    };
  });
}

function buildTradeHighlightPaths(): ExtensionWebglPathDatum[] {
  const points = getHighlightedPoints();
  if (!points || points.length === 0) return [];

  return [
    {
      id: "economy-trade-highlight-line",
      path: points,
      color: [255, 0, 0, 178], // Red with ~0.7 opacity
      width: 2
    }
  ];
}
