/**
 * Observatory report (docs/plan/approach-traffic-observatory.md §7.1, §8): turns the decayed stocks
 * of each sample back into per-period flows and ranks the approaches of every burg.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RETENTION = 0.7;

interface ApproachRow {
  id: string;
  burg: number;
  route: number | null;
  mode: string;
  azimuth: number | null;
  slots: number;
  through: number;
  goods: Record<string, number>;
  partners: Record<string, number>;
}
interface Sample {
  date: string;
  ledger?: { decays: number };
  world: Record<string, number>;
  burgs?: { id: number; pop: number }[];
  routes?: { id: number; group: string; traffic: number; pavedShare: number }[];
  approaches?: ApproachRow[];
  corridors?: { a: number; b: number; slots: number }[];
}

export interface ApproachMetric {
  channel: string;
  burg: number;
  approach: string;
  mode: string;
  route: number | null;
  azimuth: number | null;
  flow: number;
  through: number;
  share: number;
  stability: number | null;
  diversity: number;
  partnerWeight: number;
  potential: number;
  rankInBurg: number;
}

const readSamples = (file: string): Sample[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line) as Sample);

/** Flow of one keyed stock between two samples, undoing the yearly decays in between. */
function flows<T>(samples: Sample[], rows: (s: Sample) => T[] | undefined, key: (row: T) => string, value: (row: T) => number) {
  const periods: Map<string, number>[] = [];
  for (let i = 1; i < samples.length; i++) {
    const kept = RETENTION ** Math.max(0, (samples[i].ledger?.decays ?? 0) - (samples[i - 1].ledger?.decays ?? 0));
    const before = new Map((rows(samples[i - 1]) ?? []).map(row => [key(row), value(row)]));
    const period = new Map<string, number>();
    for (const row of rows(samples[i]) ?? []) {
      const delta = value(row) - (before.get(key(row)) ?? 0) * kept;
      if (delta > 1e-6) period.set(key(row), delta);
    }
    periods.push(period);
  }
  return periods;
}

/** Kendall τ-a between two equally keyed score maps; null with fewer than two keys. */
export function kendallTau(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number | null {
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  if (keys.length < 2) return null;
  let score = 0;
  let pairs = 0;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const x = Math.sign((a.get(keys[i]) ?? 0) - (a.get(keys[j]) ?? 0));
      const y = Math.sign((b.get(keys[i]) ?? 0) - (b.get(keys[j]) ?? 0));
      score += x * y;
      pairs++;
    }
  return score / pairs;
}

export function shannon(record: Record<string, number>): number {
  const values = Object.values(record).filter(v => v > 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return 0;
  return -values.reduce((sum, v) => sum + (v / total) * Math.log(v / total), 0);
}

/** Splits the periods into windows of about a year (at least two windows when possible). */
function windows<T>(periods: T[]): T[][] {
  const size = periods.length >= 24 ? 12 : Math.max(1, Math.floor(periods.length / 2));
  const out: T[][] = [];
  for (let i = 0; i < periods.length; i += size) out.push(periods.slice(i, i + size));
  return out;
}

export function approachMetrics(channel: string, samples: Sample[]): ApproachMetric[] {
  if (samples.length < 2) return [];
  const last = samples.at(-1)!;
  const slotPeriods = flows(samples, s => s.approaches, r => r.id, r => r.slots);
  const throughPeriods = flows(samples, s => s.approaches, r => r.id, r => r.through);
  const rows = new Map((last.approaches ?? []).map(row => [row.id, row]));
  for (const sample of samples) for (const row of sample.approaches ?? []) if (!rows.has(row.id)) rows.set(row.id, row);
  const pop = new Map((last.burgs ?? []).map(b => [b.id, b.pop]));
  const sum = (periods: Map<string, number>[], id: string) => periods.reduce((total, p) => total + (p.get(id) ?? 0), 0);

  const byBurg = new Map<number, ApproachRow[]>();
  for (const row of rows.values()) byBurg.set(row.burg, [...(byBurg.get(row.burg) ?? []), row]);

  const metrics: ApproachMetric[] = [];
  for (const [burg, approaches] of byBurg) {
    const flow = new Map(approaches.map(a => [a.id, sum(slotPeriods, a.id)]));
    const total = [...flow.values()].reduce((s, v) => s + v, 0);
    // Stability: τ between the in-burg shares of consecutive windows, averaged.
    const shares = windows(slotPeriods).map(group => new Map(approaches.map(a => [a.id, group.reduce((s, p) => s + (p.get(a.id) ?? 0), 0)])));
    const taus = shares.slice(1).map((share, i) => kendallTau(shares[i], share)).filter((t): t is number => t !== null);
    const stability = taus.length ? taus.reduce((s, t) => s + t, 0) / taus.length : null;
    const rowsOfBurg = approaches.map(a => {
      const f = flow.get(a.id) ?? 0;
      const share = total > 0 ? f / total : 0;
      const partnerWeight = Object.entries(a.partners ?? {}).reduce((s, [id, slots]) => s + slots * (pop.get(Number(id)) ?? 0), 0);
      return {
        channel,
        burg,
        approach: a.id,
        mode: a.mode,
        route: a.route,
        azimuth: a.azimuth,
        flow: f,
        through: sum(throughPeriods, a.id),
        share,
        stability,
        diversity: shannon(a.goods ?? {}),
        partnerWeight,
        // §7.1 initial definition; to be calibrated against CE ribbons (§7.3).
        potential: share * (0.5 + 0.5 * (stability ?? 0)) * Math.log1p(f),
        rankInBurg: 0
      };
    });
    rowsOfBurg.sort((a, b) => b.potential - a.potential).forEach((row, i) => (row.rankInBurg = i + 1));
    metrics.push(...rowsOfBurg);
  }
  return metrics;
}

/** Spearman ρ with average ranks for ties; null with fewer than 3 items or a constant side. */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length < 3) return null;
  const ranks = (v: number[]) => {
    const order = v.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
    const r = new Array<number>(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
      for (let k = i; k <= j; k++) r[order[k].i] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(x);
  const ry = ranks(y);
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

/** Index of the single largest value; null when the top is tied or all zero. */
function argmaxUnique(values: number[]): number | null {
  const max = Math.max(...values);
  if (!(max > 0)) return null;
  const at = values.flatMap((v, i) => (v === max ? [i] : []));
  return at.length === 1 ? at[0] : null;
}

interface ProbeApproach {
  approachId: string;
  routeId: number;
  group: string;
  sharedRouteIds: number[] | null;
  ribbonBudget: number;
  ribbonLength: number;
  lots: number;
  gateInns: number;
  cobbled: boolean;
}
interface ProbeFile {
  burgs: { burgId: number; status: string; usesTraffic: boolean | null; approaches: ProbeApproach[] }[];
}

/** §7.3: does the FMG potential P (and the route-level traffic CE gets today) rank CE's ribbons? */
function ceAgreement(runDir: string, samplesOf: (channel: string) => Sample[]) {
  const dir = join(runDir, "ce");
  const rows: Record<string, unknown>[] = [];
  const towns: { probe: string; burg: number; usesTraffic: boolean | null; top1P: boolean | null; top1Route: boolean | null; rhoP: number | null; rhoRoute: number | null }[] = [];
  if (!existsSync(dir)) return { rows, towns };
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const tag = file.replace(/\.json$/, "");
    const [channel, date] = tag.split("@");
    const samples = samplesOf(channel).filter(s => s.date <= date);
    const metrics = approachMetrics(channel, samples);
    const routeTraffic = new Map((samples.at(-1)?.routes ?? []).map(r => [r.id, r.traffic]));
    const probe = JSON.parse(readFileSync(join(dir, file), "utf8")) as ProbeFile;
    for (const burg of probe.burgs) {
      if (burg.status !== "generated") continue;
      const own = metrics.filter(m => m.burg === burg.burgId);
      const gates = burg.approaches.filter(a => a.group !== "searoutes");
      const potential = gates.map(a => {
        const exact = own.find(m => m.approach === a.approachId);
        if (exact) return exact.potential;
        // A shared crossing bundles routes; the ledger keys their gates by route edge.
        const routes = a.sharedRouteIds ?? [];
        return own.filter(m => m.route !== null && routes.includes(m.route)).reduce((sum, m) => sum + m.potential, 0);
      });
      const traffic = gates.map(a => Math.max(...(a.sharedRouteIds ?? [a.routeId]).map(id => routeTraffic.get(id) ?? 0)));
      const budget = gates.map(a => a.ribbonBudget);
      gates.forEach((a, i) =>
        rows.push({ probe: tag, burg: burg.burgId, approach: a.approachId, group: a.group, potential: potential[i], routeTraffic: traffic[i], ribbonBudget: a.ribbonBudget, ribbonLength: a.ribbonLength, lots: a.lots, gateInns: a.gateInns, cobbled: a.cobbled })
      );
      const top = argmaxUnique(budget);
      const pTop = argmaxUnique(potential);
      const rTop = argmaxUnique(traffic);
      towns.push({
        probe: tag,
        burg: burg.burgId,
        usesTraffic: burg.usesTraffic,
        top1P: top === null || pTop === null ? null : top === pTop,
        top1Route: top === null || rTop === null ? null : top === rTop,
        rhoP: spearman(potential, budget),
        rhoRoute: spearman(traffic, budget)
      });
    }
  }
  return { rows, towns };
}

function agreementSummary(towns: ReturnType<typeof ceAgreement>["towns"]) {
  const rate = (values: (boolean | null)[]) => {
    const known = values.filter((v): v is boolean => v !== null);
    return { n: known.length, value: known.length ? known.filter(Boolean).length / known.length : NaN };
  };
  const mean = (values: (number | null)[]) => {
    const known = values.filter((v): v is number => v !== null);
    return { n: known.length, value: known.length ? known.reduce((s, v) => s + v, 0) / known.length : NaN };
  };
  return {
    towns: towns.length,
    usingTraffic: towns.filter(t => t.usesTraffic).length,
    top1P: rate(towns.map(t => t.top1P)),
    top1Route: rate(towns.map(t => t.top1Route)),
    rhoP: mean(towns.map(t => t.rhoP)),
    rhoRoute: mean(towns.map(t => t.rhoRoute))
  };
}

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${columns.join(",")}\n${rows.map(row => columns.map(c => cell(row[c])).join(",")).join("\n")}\n`;
}

const esc = (text: unknown) => String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "–");

/** Polar bars of approach flow by bearing; sea/river approaches are listed beside it. */
function rose(rows: ApproachMetric[]): string {
  const max = Math.max(...rows.map(r => r.flow), 1e-9);
  const bars = rows
    .filter(r => r.azimuth !== null && r.flow > 0)
    .map(r => {
      const a = ((r.azimuth! - 90) * Math.PI) / 180;
      const len = 8 + (r.flow / max) * 50;
      return `<line x1="60" y1="60" x2="${fmt(60 + Math.cos(a) * len)}" y2="${fmt(60 + Math.sin(a) * len)}" class="${r.rankInBurg === 1 ? "top" : "bar"}"><title>${esc(r.approach)} ${fmt(r.flow)}</title></line>`;
    })
    .join("");
  return `<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="approach rose"><circle cx="60" cy="60" r="58" class="ring"/><text x="60" y="10" class="n">N</text>${bars}</svg>`;
}

function line(values: number[], label: string): string {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1e-9);
  const points = values.map((v, i) => `${fmt((i / (values.length - 1)) * 300)},${fmt(80 - (v / max) * 70)}`).join(" ");
  return `<figure><svg viewBox="0 0 300 84" width="300" height="84" role="img" aria-label="${esc(label)}"><polyline points="${points}" class="series"/></svg><figcaption>${esc(label)} (max ${fmt(max)})</figcaption></figure>`;
}

export function buildReport(runDir: string): Record<string, string> {
  const run = existsSync(join(runDir, "run.json")) ? JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) : { runId: runDir };
  const files = readdirSync(join(runDir, "samples")).filter(f => f.endsWith(".ndjson"));
  const approaches: ApproachMetric[] = [];
  const routes: Record<string, unknown>[] = [];
  const corridors: Record<string, unknown>[] = [];
  const sections: string[] = [];
  for (const file of files) {
    const channel = file.replace(/\.ndjson$/, "");
    const samples = readSamples(join(runDir, "samples", file));
    const metrics = approachMetrics(channel, samples);
    approaches.push(...metrics);

    const routeFlow = flows(samples, s => s.routes, r => String(r.id), r => r.traffic);
    const last = samples.at(-1);
    const channelRoutes = (last?.routes ?? []).map(r => ({
      channel,
      route: r.id,
      group: r.group,
      pavedShare: r.pavedShare,
      departures: routeFlow.reduce((s, p) => s + (p.get(String(r.id)) ?? 0), 0),
      trafficStock: r.traffic
    }));
    channelRoutes.sort((a, b) => b.departures - a.departures);
    routes.push(...channelRoutes);

    const corridorFlow = flows(samples, s => s.corridors, c => `${c.a}:${c.b}`, c => c.slots);
    const corridorRows = (last?.corridors ?? []).map(c => ({
      channel,
      a: c.a,
      b: c.b,
      slots: corridorFlow.reduce((s, p) => s + (p.get(`${c.a}:${c.b}`) ?? 0), 0),
      slotsStock: c.slots
    }));
    corridorRows.sort((a, b) => b.slots - a.slots);
    corridors.push(...corridorRows);

    const totals = flows(samples, s => s.approaches, r => r.id, r => r.slots).map(p => [...p.values()].reduce((s, v) => s + v, 0));
    const pop = new Map((last?.burgs ?? []).map(b => [b.id, b.pop]));
    const topBurgs = [...pop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    const burgCards = topBurgs
      .map(id => {
        const rows = metrics.filter(m => m.burg === id).sort((a, b) => a.rankInBurg - b.rankInBurg);
        if (!rows.length) return "";
        const table = rows
          .slice(0, 6)
          .map(r => `<tr><td>${r.rankInBurg}</td><td>${esc(r.approach.replace(`burg:${id}:`, ""))}</td><td>${fmt(r.flow)}</td><td>${fmt(r.share * 100, 0)}%</td><td>${fmt(r.through)}</td><td>${fmt(r.potential, 2)}</td></tr>`)
          .join("");
        const stability = rows[0].stability;
        return `<div class="card"><h3>Burg ${id} <small>pop ${fmt(pop.get(id) ?? 0)} · τ ${stability === null ? "–" : fmt(stability, 2)}</small></h3>${rose(rows)}<table><tr><th>#</th><th>approach</th><th>flow</th><th>share</th><th>through</th><th>P</th></tr>${table}</table></div>`;
      })
      .join("");
    const routeTable = channelRoutes
      .slice(0, 15)
      .map(r => `<tr><td>${r.route}</td><td>${esc(r.group)}</td><td>${fmt(r.departures)}</td><td>${r.pavedShare ? "paved" : ""}</td></tr>`)
      .join("");
    sections.push(`<section><h2>${esc(channel)} <small>${samples.length} samples · ${esc(samples[0]?.date ?? "")} → ${esc(last?.date ?? "")}</small></h2>
<div class="charts">${line(totals, "approach cargo slots per period")}${line(samples.map(s => s.world.caravansActive ?? 0), "active caravans")}${line(samples.map(s => s.world.urbanPopulation ?? 0), "urban population")}</div>
<h3>Largest burgs: approaches by potential P</h3><div class="cards">${burgCards || "<p>No approach traffic recorded (is the economy extension enabled?).</p>"}</div>
<h3>Busiest routes (departures in the period)</h3><table><tr><th>route</th><th>group</th><th>departures</th><th></th></tr>${routeTable}</table></section>`);
  }

  const samplesByChannel = new Map(files.map(f => [f.replace(/\.ndjson$/, ""), readSamples(join(runDir, "samples", f))]));
  const agreement = ceAgreement(runDir, channel => samplesByChannel.get(channel) ?? []);
  const summary = agreementSummary(agreement.towns);
  const ceSection = agreement.towns.length
    ? `<section><h2>CE agreement <small>${summary.towns} towns probed · ${summary.usingTraffic} with traffic-driven roads</small></h2>
<p>Do the approaches with the highest FMG potential P get CE's largest suburb ribbon? Compared with ranking by route-level traffic, the input CE receives today (§7.3).</p>
<table><tr><th></th><th>Top-1 match</th><th>Spearman ρ (mean)</th></tr>
<tr><td>Potential P (approach ledger)</td><td>${fmt(summary.top1P.value * 100, 0)}% <small>n=${summary.top1P.n}</small></td><td>${fmt(summary.rhoP.value, 2)} <small>n=${summary.rhoP.n}</small></td></tr>
<tr><td>Route traffic</td><td>${fmt(summary.top1Route.value * 100, 0)}% <small>n=${summary.top1Route.n}</small></td><td>${fmt(summary.rhoRoute.value, 2)} <small>n=${summary.rhoRoute.n}</small></td></tr></table>
<p><small>Towns whose top ribbon or top predictor is tied are left out of Top-1; ρ needs three or more approaches. Rows: ce.csv.</small></p></section>`
    : "";
  sections.unshift(ceSection);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Approach Traffic Report</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a65;--line:#d9d6cf;--accent:#2f6f8f;--top:#c4572b}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--muted:#9a988f;--line:#3a3935;--accent:#7fb7d4;--top:#f08a5d}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
h1{font-size:22px}h2{font-size:18px;border-top:1px solid var(--line);padding-top:16px}h3{font-size:15px}small{color:var(--muted);font-weight:normal}
table{border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:2px 8px;border-bottom:1px solid var(--line);text-align:left}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}.card{border:1px solid var(--line);border-radius:6px;padding:8px;overflow-x:auto}
.charts{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}figcaption{color:var(--muted);font-size:12px}
.series{fill:none;stroke:var(--accent);stroke-width:1.5}.ring{fill:none;stroke:var(--line)}.bar{stroke:var(--accent);stroke-width:4;stroke-linecap:round}.top{stroke:var(--top);stroke-width:5;stroke-linecap:round}.n{fill:var(--muted);font-size:9px;text-anchor:middle}
</style></head><body><h1>Approach Traffic Report <small>${esc(run.runId)}</small></h1>
<p>Flows are per-period differences of the decayed ledgers (0.7/yr undone). P = share × (0.5 + 0.5·τ) × ln(1 + flow), uncalibrated (§7.1). CSV: approaches.csv, routes.csv, corridors.csv.</p>
${sections.join("\n")}</body></html>`;

  return {
    "approaches.csv": csv(approaches as unknown as Record<string, unknown>[]),
    "routes.csv": csv(routes),
    "corridors.csv": csv(corridors),
    "ce.csv": csv(agreement.rows),
    "ce-summary.json": `${JSON.stringify({ summary, towns: agreement.towns }, null, 2)}\n`,
    "report.html": html
  };
}
