import { tip } from "../../hostServices";
import { openDialog } from "../../hostUi";
import { formatPrice, rn } from "../../hostUtils";
import { getBurgProductPerThousandResidents } from "../burgEconomySummary";
import { getBurgProductionRecords, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { isDealRecord, isMfgRecord } from "../generators/production-generator";
import { type ProductionOverviewRow, setProductionOverviewState } from "../store/productionOverviewState";

let activeBurgId = 0;

export function open(burgId: number): void {
  const burg = getWorldContext().pack.burgs[burgId];
  if (!burg || burg.removed) {
    tip("Invalid burg. The selected burg does not exist", true, "error", 5000);
    return;
  }

  activeBurgId = burgId;
  openDialog("productionOverview", { burgId });
  refreshProductionOverview();
}

export function refreshProductionOverview(): void {
  const burg = getWorldContext().pack.burgs[activeBurgId];
  if (!burg) {
    tip("Invalid burg. The selected burg does not exist", true, "error", 5000);
    return;
  }

  const rows: ProductionOverviewRow[] = [];
  let taxPaid = 0;

  for (const record of getBurgProductionRecords(burg)) {
    if (isMfgRecord(record)) {
      const good = Goods.get(record.goodId);
      if (!good) continue;
      rows.push(buildRow(rows.length, "manufactured", good, rn(record.units, 2), 0, 0, 0));
      continue;
    }

    if (!isDealRecord(record)) continue;
    const deal = getWorldContext().pack.deals.find(d => d.i === record.dealId);
    if (!deal) continue;
    const good = Goods.get(deal.good);
    if (!good) continue;

    const isSeller = deal.sellerType === "burg" && deal.seller === activeBurgId;
    const isBuyer = deal.buyerType === "burg" && deal.buyer === activeBurgId;
    if (!isSeller && !isBuyer) continue;

    const gross = rn(deal.units * deal.price, 2);
    const tax = rn(deal.tax || 0, 2);
    const net = isSeller ? rn(gross - tax, 2) : rn(-gross, 2);
    if (isSeller) taxPaid += tax;

    rows.push(
      buildRow(rows.length, isSeller ? "sold" : "bought", good, rn(deal.units, 2), rn(deal.price, 2), net, tax)
    );
  }

  const wealth = getBurgProductPerThousandResidents(burg);

  setProductionOverviewState({
    burgId: burg.i ?? null,
    burgName: burg.name || "",
    rows,
    wealth: formatPrice(wealth),
    treasury: formatPrice(burg.treasury || 0),
    taxPaid: formatPrice(rn(taxPaid, 2))
  });
}

function buildRow(
  id: number,
  kind: ProductionOverviewRow["kind"],
  good: { i: number; name: string; color: string; icon: string },
  units: number,
  price: number,
  net: number,
  tax: number
): ProductionOverviewRow {
  return {
    id,
    kind,
    goodId: good.i,
    goodName: good.name,
    goodColor: good.color,
    goodStroke: Goods.getStroke(good.color),
    goodIcon: good.icon,
    units,
    price,
    net,
    tax
  };
}
