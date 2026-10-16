/**
 * Browser download of the market flow report. Kept out of the generator so the simulation core
 * never touches `document` (docs/plan/simulation-core-separation.md S2).
 */
import { getMarkets, getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { getFlowReport } from "../generators/marketFlowDiagnostics";
import { formatFlowReportCsv } from "../generators/marketFlowReport";

export function downloadFlowReportCsv(filename = "market-flow-report.csv"): void {
  const summary = getFlowReport();
  const world = getWorldContext();
  const markets = getMarkets();
  const marketName = (marketId: number) => {
    const market = markets.find(candidate => candidate.i === marketId);
    if (!market) return `Market ${marketId}`;
    if (market.name) return market.name;
    const burg = world.pack.burgs[market.centerBurgId];
    return burg?.name ?? `Market ${marketId}`;
  };
  const goodName = (goodId: number) => Goods.get(goodId)?.name ?? `Good ${goodId}`;
  const csv = formatFlowReportCsv(summary.rows, { marketName, goodName });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
