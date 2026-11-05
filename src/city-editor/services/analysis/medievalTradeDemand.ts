/** Fixed-reference demand used by the T0 observation; does not change the economy or city. */
import { HISTORICAL_PERIODS } from "../../../types/historicalPeriod";

export interface TradeReferenceRow {
  domain: string;
  pool: string;
  per_1000_people: string;
  port_multiplier?: string;
  wine_region_per_1000?: string;
  from_period?: string;
  requires_technology?: string;
}
export const MIXED_TRADE_POOLS = new Set([
  "tailoring",
  "weaving",
  "shoemaking",
  "furriery",
  "leatherGoods",
  "saddlery",
  "goldsmithing",
  "joinery",
  "bowyery",
  "bookTrades"
]);
export function medievalTradeDemand(
  rows: readonly TradeReferenceRow[],
  population: number,
  options: { period?: string; employmentShare?: number; port?: boolean; wine?: boolean; technologies?: string[] } = {}
) {
  const period = options.period ?? "highMedieval";
  const order = HISTORICAL_PERIODS as readonly string[];
  const share = options.employmentShare ?? 0.45;
  if (!Number.isInteger(population) || population < 1 || !order.includes(period) || share < 0.3 || share > 0.6)
    throw new Error("Invalid trade observation inputs");
  const seen = new Set<string>();
  const trades = rows
    .filter(row => row.domain !== "(none)")
    .map(row => {
      if (seen.has(row.pool)) throw new Error(`Duplicate occupational pool: ${row.pool}`);
      seen.add(row.pool);
      const gated =
        (row.from_period && order.indexOf(period) < order.indexOf(row.from_period)) ||
        (row.requires_technology && !options.technologies?.includes(row.requires_technology));
      const rate = Number(options.wine && row.wine_region_per_1000 ? row.wine_region_per_1000 : row.per_1000_people);
      if (!Number.isFinite(rate) || rate < 0 || (row.from_period && !order.includes(row.from_period)))
        throw new Error(`Invalid occupational reference: ${row.pool}`);
      const practitioners = gated
        ? 0
        : (((population * rate) / 1000) * (options.port ? Number(row.port_multiplier || 1) : 1) * share) / 0.45;
      return {
        pool: row.pool,
        domain: row.domain,
        practitioners,
        workshops: Math.floor((practitioners + 1e-9) / 2.5),
        mixed: MIXED_TRADE_POOLS.has(row.pool)
      };
    });
  const domains = [...new Set(trades.map(row => row.domain))].map(domain => {
    const members = trades.filter(row => row.domain === domain);
    const practitioners = members.reduce((sum, row) => sum + row.practitioners, 0);
    return {
      domain,
      practitioners,
      workshops: members.reduce((sum, row) => sum + row.workshops, 0),
      inferredHalls: practitioners >= 3 - 1e-9 ? 1 : 0
    };
  });
  return {
    trades,
    domains,
    workshops: trades.reduce((sum, row) => sum + row.workshops, 0),
    mixedWorkshops: trades.filter(row => row.mixed).reduce((sum, row) => sum + row.workshops, 0),
    dedicatedWorkshops: trades.filter(row => !row.mixed).reduce((sum, row) => sum + row.workshops, 0),
    inferredHalls: domains.reduce((sum, row) => sum + row.inferredHalls, 0)
  };
}
