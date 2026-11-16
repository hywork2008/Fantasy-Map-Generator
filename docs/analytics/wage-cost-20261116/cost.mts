/**
 * Wage cost against value (docs/analytics/wage-cost-20261116.md, docs/plan/per-capita-income-scale.md §6 step 2):
 * for each good with a calibrated labour content, the cheapest recipe's materials at base value plus labour at the
 * subsistence wage × multiple (staple at its retail floor 0.8), as a share of the good's value. No simulation.
 *
 *   npx tsx docs/analytics/wage-cost-20261116/cost.mts > out.tsv
 */
import { GOOD_DEMAND_CALIBRATION, UNCALIBRATED_LABOR_POINTS_PER_LOT, laborPointsForLots } from "../../../src/extensions/economy/generators/craftDemandCalibration";
import { GOODS_DATA } from "../../../src/extensions/economy/generators/goods-generator";

const MULTIPLES = [1.5, 4, 8, 14];
const STAPLE = 0.8;
const wagePerPointMonth = (m: number) => (m * 0.43 * 1000 * STAPLE) / 12;
const goods = new Map((GOODS_DATA as { name: string; value: number; recipes?: Record<string, number>[] }[]).map(g => [g.name, g]));
const names = new Set<string>([...GOOD_DEMAND_CALIBRATION.map(r => r.goodName), ...Object.keys(UNCALIBRATED_LABOR_POINTS_PER_LOT)]);
const rows: (string | number)[][] = [];
for (const name of names) {
  const g = goods.get(name);
  if (!g || !(g.value > 0)) continue;
  const materials = g.recipes?.length
    ? Math.min(...g.recipes.map(r => Object.entries(r).reduce((s, [k, q]) => s + q * (goods.get(k)?.value ?? 0), 0)))
    : 0;
  const lp = laborPointsForLots(name, 1, 1000);
  rows.push([name, g.value, +(materials / g.value).toFixed(3), ...MULTIPLES.map(m => +((materials + lp * wagePerPointMonth(m)) / g.value).toFixed(2))]);
}
rows.sort((a, b) => (b[6] as number) - (a[6] as number));
console.log(["good", "value", "materials/value", ...MULTIPLES.map(m => `cost/value@${m}`)].join("\t"));
for (const r of rows) console.log(r.join("\t"));
