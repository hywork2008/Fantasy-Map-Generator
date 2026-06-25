import * as d3 from "d3";
import { worldContext } from "../../context/worldContext";
import { rn } from "../../utils/numberUtils";
import { tip } from "../../utils/uiHelpers";
import { Goods } from "./modules/goods-generator";
import { Markets } from "./modules/markets-generator";
import { Production } from "./modules/production-generator";
import { getCellProduction } from "./modules/production-utils";

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
      const centerBurg = market && worldContext.pack.burgs[market.centerBurgId];
      if (!centerBurg) return true;
      tip(`${centerBurg.name} market. Click to view`);
      return true;
    }
  }

  if (group === "goods") {
    const el = e.target as Element;
    const bonusGoodId = worldContext.pack.cells.good[i];
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
      const produced = getCellProduction(i, Goods.getBiomesProduction());
      tip(
        `Cell rural production: ${formatProduct(produced).join(", ")}. Click to select displayed goods in Goods Editor`
      );
      return true;
    }

    if (el.closest("#goodsBurgs")) {
      const burgEl = el.closest("[data-id]") as HTMLElement | null;
      const burgId = burgEl ? +burgEl.dataset.id! : 0;
      const burg = burgId ? worldContext.pack.burgs[burgId] : undefined;
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
  const cells = worldContext.pack.cells;
  const infoGood = document.getElementById("infoGood") as HTMLElement;
  const infoMarket = document.getElementById("infoMarket") as HTMLElement;
  const infoCellProduction = document.getElementById("infoCellProduction") as HTMLElement;
  const infoBurgProduction = document.getElementById("infoBurgProduction") as HTMLElement;

  if (infoGood)
    infoGood.innerHTML = cells.good[i] ? `${Goods.get(cells.good[i])?.name ?? "unknown"} (${cells.good[i]})` : "no";

  if (infoMarket) {
    const marketId = cells.market?.[i];
    if (marketId) {
      const market = Markets.get(marketId);
      const centerBurg = market && worldContext.pack.burgs[market.centerBurgId];
      infoMarket.innerHTML = centerBurg ? `${centerBurg.name} market (${marketId})` : `market ${marketId}`;
    } else {
      infoMarket.innerHTML = "no";
    }
  }

  if (infoCellProduction) {
    const cellProduced = getCellProduction(i, Goods.getBiomesProduction());
    const cellEntries = Object.entries(cellProduced).filter(([, amt]) => amt > 0);
    infoCellProduction.innerHTML = cellEntries.length
      ? cellEntries.map(([id, amt]) => `${Goods.get(+id)?.name ?? id}: ${rn(amt, 2)}`).join(", ")
      : "none";
  }

  if (infoBurgProduction) {
    const burgId = cells.burg[i];
    if (burgId) {
      const burg = worldContext.pack.burgs[burgId];
      const burgProduced = Production.getBurgProduction(burg);
      const burgEntries = Object.entries(burgProduced).filter(([, amt]) => amt > 0);
      infoBurgProduction.innerHTML = burgEntries.length
        ? burgEntries.map(([id, amt]) => `${Goods.get(+id)?.name ?? id}: ${rn(amt, 2)}`).join(", ")
        : "none";
    } else {
      infoBurgProduction.innerHTML = "n/a";
    }
  }
}
