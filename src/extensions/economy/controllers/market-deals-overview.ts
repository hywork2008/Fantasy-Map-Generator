import { tip } from "../../../services/tooltipService";
import type { Burg } from "../../../types/models";
import { openDialog } from "../../../ui/dialogs/dialogService";
import { rn } from "../../../utils";
import { downloadFile, getFileName } from "../../../utils/editorHelpers";
import { getApi, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import type { Deal } from "../generators/markets-generator";
import { Markets } from "../generators/markets-generator";
import { type MarketDealRow, type MarketDealsFilter, setMarketDealsState } from "../store/marketDealsState";

let activeMarketId = 0;
let activeFilter: MarketDealsFilter = "all";

export function open(marketId: number): void {
  const market = Markets.get(marketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  activeMarketId = marketId;
  setActiveMarketDealsFilter("all");
  openDialog("marketDeals");
}

export function refreshMarketDeals(): void {
  const market = Markets.get(activeMarketId);
  if (!market) {
    tip("Invalid market. The selected market does not exist", true, "error", 5000);
    return;
  }

  const allDeals = getMarketDeals(activeMarketId);
  const deals = allDeals.filter(deal => {
    if (activeFilter === "all") return true;
    const counterparty = getCounterparty(deal);
    return activeFilter === "local" ? counterparty.type === "burg" : counterparty.type === "market";
  });

  let netFlow = 0;
  const rows: MarketDealRow[] = [];

  for (const deal of deals) {
    const row = buildDealRow(deal);
    if (row) {
      netFlow += row.income;
      rows.push(row);
    }
  }

  setMarketDealsState({
    rows,
    dealsCount: deals.length,
    netFlow: rn(netFlow, 2),
    activeFilter,
    onRowClick: (row: MarketDealRow) => {
      const deal = getWorldContext().pack.deals.find(d => d.i === row.id);
      if (!deal) return;
      const party = getParty(deal);
      if (party) getApi().zoomTo(party.x, party.y, 8, 2000);
    }
  });
}

export function setActiveMarketDealsFilter(filter: MarketDealsFilter): void {
  activeFilter = filter;
  setMarketDealsState({ activeFilter });
  if (activeMarketId) refreshMarketDeals();
}

function getMarketDeals(marketId: number): Deal[] {
  return getWorldContext().pack.deals.filter(
    deal =>
      (deal.sellerType === "market" && deal.seller === marketId) ||
      (deal.buyerType === "market" && deal.buyer === marketId)
  );
}

function isMarketSeller(deal: Deal): boolean {
  return deal.sellerType === "market" && deal.seller === activeMarketId;
}

function getDirection(deal: Deal): "in" | "out" {
  return isMarketSeller(deal) ? "out" : "in";
}

function getCounterparty(deal: Deal): { id: number; type: "burg" | "market" } {
  return isMarketSeller(deal) ? { id: deal.buyer, type: deal.buyerType } : { id: deal.seller, type: deal.sellerType };
}

function buildDealRow(deal: Deal): MarketDealRow | null {
  const good = Goods.get(deal.good);
  if (!good) return null;

  const dealNet = getDealNet(deal);
  const party = getParty(deal);
  const counterparty = getCounterparty(deal);
  const direction = getDirection(deal);
  const incomeColor = dealNet >= 0 ? "#2a6" : "#c44";
  const backColor = dealNet >= 0 ? "#dff0d8" : "#f2dede";

  return {
    id: deal.i,
    goodId: good.i,
    goodName: good.name,
    goodColor: good.color,
    goodStroke: Goods.getStroke(good.color),
    goodIcon: good.icon,
    direction,
    counterpartyType: counterparty.type,
    partyName: party?.name ?? "",
    units: rn(deal.units, 2),
    income: rn(dealNet, 2),
    incomeColor,
    backColor
  };
}

function getParty(deal: Deal): Burg | null {
  const counterparty = getCounterparty(deal);
  const burgId = counterparty.type === "burg" ? counterparty.id : Markets.get(counterparty.id)?.centerBurgId;
  if (!burgId) return null;
  return getWorldContext().pack.burgs[burgId] || null;
}

function getDealNet(deal: Deal): number {
  return rn(deal.units * deal.price * (isMarketSeller(deal) ? 1 : -1), 2);
}

export function downloadDealsCsv(): void {
  const market = Markets.get(activeMarketId);
  if (!market) return;

  const lines = getMarketDeals(activeMarketId);
  let csv = "Id,Good,Type,Client,Units,Price,Net\n";
  for (const deal of lines) {
    const good = Goods.get(deal.good);
    if (!good) continue;

    csv += [
      deal.i,
      good.name,
      getDirection(deal),
      getParty(deal)?.name ?? "",
      rn(deal.units, 2),
      rn(deal.price, 2),
      rn(getDealNet(deal), 2)
    ].join(",");
    csv += "\n";
  }

  downloadFile(csv, `${getFileName(`Market_${activeMarketId}_Deals`)}.csv`);
}
