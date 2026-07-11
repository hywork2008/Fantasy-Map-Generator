import type { ExtensionMapPickHandler } from "../../../types/extension-api";
import { getApi, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";

const GOODS_CELL_ID = /^economy-goods-cell-(\d+)-(\d+)$/;
const GOODS_SOURCE_ID = /^economy-goods-source-(\d+)$/;
const MARKET_ID = /^economy-market-(?:area|center)-(\d+)(?:-\d+)?$/;

export const economyMapPickHandler: ExtensionMapPickHandler = {
  formatPick(detail) {
    const goodsCell = GOODS_CELL_ID.exec(detail.id);
    if (goodsCell) return `Good: ${getGoodName(Number(goodsCell[2]))}`;

    const goodsSource = GOODS_SOURCE_ID.exec(detail.id);
    if (goodsSource) {
      const goodId = getWorldContext().pack.cells.good[Number(goodsSource[1])] ?? 0;
      return `Good: ${getGoodName(goodId)}`;
    }

    const marketId = getMarketId(detail.id);
    if (marketId !== null) return `Market: ${getMarketName(marketId)}`;
    return "Economy object";
  },

  selectPick(detail) {
    if (GOODS_CELL_ID.test(detail.id) || GOODS_SOURCE_ID.test(detail.id)) {
      getApi().openDialog("goodsEditor");
      return;
    }

    const marketId = getMarketId(detail.id);
    if (marketId !== null) getApi().openDialog("marketOverview", { marketId });
  },

  getEntityKey(detail) {
    const marketId = getMarketId(detail.id);
    if (marketId !== null) return `market-${marketId}`;
    return detail.id;
  }
};

function getGoodName(goodId: number): string {
  return Goods.get(goodId)?.name ?? `Good ${goodId}`;
}

function getMarketId(id: string): number | null {
  const match = MARKET_ID.exec(id);
  return match ? Number(match[1]) : null;
}

function getMarketName(marketId: number): string {
  const market = getWorldContext().pack.markets?.[marketId];
  if (!market) return `Market ${marketId}`;
  return market.name ?? getWorldContext().pack.burgs[market.centerBurgId]?.name ?? `Market ${marketId}`;
}
