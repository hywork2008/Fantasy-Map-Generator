import type { ExtensionMapPickHandler } from "../../../types/extension-api";
import { getApi, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";

const GOODS_CELL_ID = /^economy-goods-cell-(\d+)-(\d+)$/;
const GOODS_SOURCE_ID = /^economy-goods-source-(\d+)$/;
const MARKET_ID = /^economy-market-(?:area|center)-(\d+)(?:-\d+)?$/;
const CARAVAN_ID = /^economy-caravan-(\d+)$/;

export const economyMapPickHandler: ExtensionMapPickHandler = {
  formatPick(detail) {
    const caravanIdMatch = CARAVAN_ID.exec(detail.id);
    if (caravanIdMatch) {
      const caravanId = Number(caravanIdMatch[1]);
      const caravan = getWorldContext().pack.caravans?.find(c => c.i === caravanId);
      if (caravan) {
        const fromMarket = getWorldContext().pack.markets?.[caravan.seller];
        const toMarket = getWorldContext().pack.markets?.[caravan.buyer];

        let fromName = `Market ${caravan.seller}`;
        if (caravan.sellerType === "market" && fromMarket) {
          fromName = fromMarket.name ?? getWorldContext().pack.burgs[fromMarket.centerBurgId]?.name ?? fromName;
        } else if (caravan.sellerType === "burg") {
          fromName = getWorldContext().pack.burgs[caravan.seller]?.name ?? `Burg ${caravan.seller}`;
        }

        let toName = `Market ${caravan.buyer}`;
        if (caravan.buyerType === "market" && toMarket) {
          toName = toMarket.name ?? getWorldContext().pack.burgs[toMarket.centerBurgId]?.name ?? toName;
        } else if (caravan.buyerType === "burg") {
          toName = getWorldContext().pack.burgs[caravan.buyer]?.name ?? `Burg ${caravan.buyer}`;
        }

        return `Caravan: ${fromName} → ${toName}`;
      }
      return "Trade Caravan";
    }

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
    const caravanIdMatch = CARAVAN_ID.exec(detail.id);
    if (caravanIdMatch) {
      const caravanId = Number(caravanIdMatch[1]);
      const caravan = getWorldContext().pack.caravans?.find(c => c.i === caravanId);
      if (caravan) {
        document.dispatchEvent(new CustomEvent("trade:showDetails", { detail: { caravan } }));
      }
      return;
    }

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
