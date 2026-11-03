/**
 * Per-craft headcount against the urban table (docs/plan/urban-craft-staffing.md §5.2, §10 S3):
 * each town's workers in a craft are its recipe output of the craft's goods × their labor a lot.
 * Smiths' repair work makes no good and is not counted here. Each domain's practitioners (the
 * guild people economystart.mts records, which include work that makes no good) are also set
 * against the domain's table total.
 *
 *   npx tsx docs/analytics/economy-start-s3-20261103/rows.mts <out.json> <month> <label=dir>...
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { laborPointsForLots } from "../../../src/extensions/economy/generators/craftDemandCalibration";
import {
  expectedDomainWorkerPeople,
  expectedWorkerPeople,
  OCCUPATIONAL_CALIBRATION
} from "../../../src/extensions/economy/generators/occupationalCalibration";
import { CRAFT_KNOWLEDGE_DOMAINS } from "../../../src/extensions/economy/generators/guildKnowledgeTypes";

const [out, monthArg, ...sets] = process.argv.slice(2);
const month = Number(monthArg);
const seeds = [2101, 2102, 2103, 2104];
const r2 = (v: number) => Math.round(v * 100) / 100;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.toSorted((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const rows = OCCUPATIONAL_CALIBRATION.filter(row => row.guildDomain && row.goodNames.length);

const report: Record<string, any> = {};
for (const set of sets) {
  const [label, dir] = set.split("=");
  const ratios = new Map<string, number[]>();
  const domainRatios = new Map<string, number[]>();
  for (const seed of seeds) {
    const data = JSON.parse(readFileSync(join(dir, `obs-${seed}.json`), "utf8"));
    const rate = data.populationRate ?? 1000;
    const snap = (data.snapshots as any[]).find(s => s.month === month);
    for (const b of snap.burgs as any[]) {
      for (const domain of CRAFT_KNOWLEDGE_DOMAINS) {
        const expected = expectedDomainWorkerPeople({
          domain,
          laborPeople: b.people,
          port: Boolean(b.port),
          capital: Boolean(b.capital),
          hasQuarry: false,
          period: "highMedieval"
        });
        if (expected < 2.5) continue;
        const actual = (b.guilds as any[]).find(g => g.domain === domain)?.people ?? 0;
        const list = domainRatios.get(domain) ?? [];
        list.push(actual / expected);
        domainRatios.set(domain, list);
      }
      for (const row of rows) {
        const expected = expectedWorkerPeople({
          row,
          laborPeople: b.people,
          port: Boolean(b.port),
          capital: Boolean(b.capital),
          hasQuarry: false,
          period: "highMedieval"
        });
        // A craft is expected from the town size where its table headcount fills one workshop (§4.5).
        if (expected < 2.5) continue;
        const actual = row.goodNames.reduce(
          (sum, name) => sum + laborPointsForLots(name, b.production[`${name}*`] ?? 0, rate) * rate,
          0
        );
        const list = ratios.get(row.pool) ?? [];
        list.push(actual / expected);
        ratios.set(row.pool, list);
      }
    }
  }
  const summarize = (list: number[]) => ({
    towns: list.length,
    within30: r2(list.filter(r => r >= 0.7 && r <= 1.3).length / (list.length || 1)),
    zero: r2(list.filter(r => r <= 0.01).length / (list.length || 1)),
    medianRatio: r2(median(list))
  });
  report[label] = {
    ...Object.fromEntries(rows.map(row => [row.pool, summarize(ratios.get(row.pool) ?? [])])),
    domains: Object.fromEntries(CRAFT_KNOWLEDGE_DOMAINS.map(d => [d, summarize(domainRatios.get(d) ?? [])]))
  };
}
writeFileSync(out, JSON.stringify(report, null, 1));
const line = (key: string, get: (label: string) => any) =>
  console.log(
    key.padEnd(16),
    sets
      .map(set => set.split("=")[0])
      .map(label => {
        const r = get(label);
        return `${label}: n=${r.towns} ±30%=${r.within30} zero=${r.zero} median=${r.medianRatio}`;
      })
      .join("  |  ")
  );
for (const domain of CRAFT_KNOWLEDGE_DOMAINS) line(`[${domain}]`, label => report[label].domains[domain]);
for (const row of rows) line(row.pool, label => report[label][row.pool]);
