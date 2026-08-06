import * as d3 from "d3";
import { tip } from "../hostServices";
import { useCellInfoState } from "../hostUi";
import { rn } from "../hostUtils";
import { getGoodCellColumn, getMarketCellColumn, getWorldContext } from "./economyContext";
import { getBurgMarketLedger, getDominantMerchant, getMerchantName } from "./generators/burgMarketLedgers";
import { getCellFaunaHeadcounts } from "./generators/faunaPopulation";
import { Goods } from "./generators/goods-generator";
import { Markets } from "./generators/markets-generator";
import { Production } from "./generators/production-generator";
import { getCellProduction } from "./generators/production-utils";

export function showEconomyTooltip(
  _point: [number, number],
  e: MouseEvent,
  i: number,
  _g: number,
  group: string,
  _subgroup: string
): boolean {
  if (group === "markets") {
    const marketEl = (e.target as Element).closest("[data-id]") as HTMLElement | null;
    if (marketEl) {
      const market = Markets.get(+marketEl.dataset.id!);
      const centerBurg = market && getWorldContext().pack.burgs[market.centerBurgId];
      if (!centerBurg) return true;
      tip(`${centerBurg.name} market. Click to view`);
      return true;
    }
  }

  if (group === "goods") {
    const el = e.target as Element;
    const bonusGoodId = getGoodCellColumn()[i];
    const getName = (id: number) => (Goods.get(id)?.name ?? "unknown").toLowerCase();
    const formatProduct = (produced: Record<number, number>) =>
      Object.entries(produced).reduce<string[]>((acc, [goodId, amount]) => {
        acc.push(`${getName(+goodId)} ${amount}${+goodId === bonusGoodId ? " (bonus)" : ""}`);
        return acc;
      }, []);

    if (el.closest("#goodsIcons")) {
      const iconEl = el.closest("[data-i]") as HTMLElement | null;
      const good = iconEl ? Goods.get(+iconEl.dataset.i!) : undefined;
      tip(`${good?.name} bonus resource. Click to open Goods Editor and select displayed goods`);
      return true;
    }

    if (el.closest("#goodsCells")) {
      // preview: true — a tooltip hover must stay read-only, not cull fauna stock (see
      // getRuralProductionContributions()'s doc-comment in production-utils.ts).
      const produced = getCellProduction(i, Goods.getBiomesProduction(), { preview: true });
      tip(
        `Cell rural production: ${formatProduct(produced).join(", ")}. Click to select displayed goods in Goods Editor`
      );
      return true;
    }

    if (el.closest("#goodsBurgs")) {
      const burgEl = el.closest("[data-id]") as HTMLElement | null;
      const burgId = burgEl ? +burgEl.dataset.id! : 0;
      const burg = burgId ? getWorldContext().pack.burgs[burgId] : undefined;
      if (!burg || burg.removed) return true;
      d3.select(burgEl).raise();
      const produced = Production.getBurgProduction(burg);
      tip(`${burg.name} urban production: ${formatProduct(produced).join(", ")}. Click to view`);
      return true;
    }

    return true;
  }

  return false;
}

export function updateEconomyCellInfo(_point: [number, number], i: number, _g: number): void {
  const goodCellColumn = getGoodCellColumn();
  const marketCellColumn = getMarketCellColumn();
  const extra: Record<string, string> = {};

  extra.good = goodCellColumn[i] ? `${Goods.get(goodCellColumn[i])?.name ?? "unknown"} (${goodCellColumn[i]})` : "no";

  const marketId = marketCellColumn[i];
  if (marketId) {
    const market = Markets.get(marketId);
    const centerBurg = market && getWorldContext().pack.burgs[market.centerBurgId];
    extra.market = centerBurg ? `${centerBurg.name} market (${marketId})` : `market ${marketId}`;
  } else {
    extra.market = "no";
  }

  const fauna = getCellFaunaHeadcounts(i);
  const domesticatedText = fauna.domesticated.length
    ? fauna.domesticated.map(entry => `${entry.name} ${rn(entry.count)}`).join(", ")
    : "none";
  extra.fauna = `Wild ${rn(fauna.wild)} | Domesticated: ${domesticatedText}`;

  // preview: true — CellInfo must stay read-only, not cull fauna stock (see
  // getRuralProductionContributions()'s doc-comment in production-utils.ts).
  const cellProduced = getCellProduction(i, Goods.getBiomesProduction(), { preview: true });
  const cellEntries = Object.entries(cellProduced).filter(([, amt]) => amt > 0);
  extra.cellProduction = cellEntries.length
    ? cellEntries.map(([id, amt]) => `${Goods.get(+id)?.name ?? id}: ${rn(amt, 2)}`).join(", ")
    : "none";

  const burgId = getWorldContext().pack.cells.burg[i];
  if (burgId) {
    const burg = getWorldContext().pack.burgs[burgId];
    const burgProduced = Production.getBurgProduction(burg);
    const burgEntries = Object.entries(burgProduced).filter(([, amt]) => amt > 0);
    extra.burgProduction = burgEntries.length
      ? burgEntries.map(([id, amt]) => `${Goods.get(+id)?.name ?? id}: ${rn(amt, 2)}`).join(", ")
      : "none";
    const dominant = getDominantMerchant(getBurgMarketLedger(burgId));
    extra.marketHolder = dominant
      ? `${getMerchantName(dominant.characterId)} (${dominant.share.toFixed(1)}%)`
      : "unassigned";
  } else {
    extra.burgProduction = "n/a";
    extra.marketHolder = "n/a";
  }

  useCellInfoState.getState().updateInfo({ extra });
}
