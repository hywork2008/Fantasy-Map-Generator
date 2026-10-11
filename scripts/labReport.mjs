#!/usr/bin/env node
// River-Port Lab L4 (docs/plan/river-port-lab.md §7): summarizes lab:collect NDJSON samples as a
// Markdown report — intended→actual confusion, port/waterfront rates per site kind, river
// geometry distributions, bridge skew, and a comparison with a control run (lab disabled).
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const usage = "Usage: npm run lab:report -- <run.ndjson> [--control control.ndjson] [--json]";
const args = process.argv.slice(2);
const flagValue = name => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args.splice(at, 2)[1];
};
const controlPath = flagValue("control");
const asJson = args.includes("--json");
const runPath = args.find(arg => !arg.startsWith("--"));
if (!runPath || args.includes("--help")) {
  console.log(usage);
  process.exit(runPath ? 0 : 1);
}

const KINDS = ["estuary", "deltaBranch", "confluence", "confluenceBelow", "lakeOutlet", "meander", "riverBank", "coastNoRiver", "inland"];
const SKEW_BUCKETS = [5, 10, 15, 20, 25, 30, Infinity];

async function load(path) {
  const maps = new Map();
  const burgs = [];
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const { map, burg } = JSON.parse(line);
    if (!maps.has(map.seed)) maps.set(map.seed, map);
    // The descriptor is only read for bridge crossings and is too large to keep.
    const crossings = burg.descriptor?.fixedCrossings?.crossings ?? null;
    delete burg.descriptor;
    burgs.push({ ...burg, seed: map.seed, descriptorRead: crossings !== null || "descriptor" in burg, crossings });
  }
  return { maps: [...maps.values()], burgs };
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const quantile = (values, q) => {
  const sorted = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;
};
const fmt = value => (value == null ? "–" : Number.isInteger(value) ? String(value) : value.toFixed(1));
const table = (header, rows) =>
  [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map(r => `| ${r.join(" | ")} |`)].join("\n");
const countBy = (items, key) => items.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] ?? 0) + 1), acc), {});

function portRates(burgs) {
  const n = burgs.length;
  const count = test => burgs.filter(test).length;
  const ports = burgs.filter(b => b.port);
  return {
    n,
    port: count(b => b.port),
    seaPort: count(b => b.seaPort),
    riverPort: count(b => b.riverPort),
    both: count(b => b.seaPort && b.riverPort),
    lakePort: count(b => b.lakePort),
    navigable: count(b => (b.river?.flux ?? 0) >= 100),
    waterfrontFailed: ports.filter(b => !b.waterfrontCheck?.ok).length,
    ports: ports.length
  };
}

function analyze({ maps, burgs }) {
  const lab = burgs.filter(b => b.siteKindIntended);
  const byActual = Object.groupBy(burgs, b => b.siteKindActual ?? "water");
  const byIntended = Object.groupBy(lab, b => b.siteKindIntended);
  const shortfall = {};
  for (const map of maps) for (const [kind, n] of Object.entries(map.shortfall ?? {})) shortfall[kind] = (shortfall[kind] ?? 0) + n;
  const quota = maps[0]?.labOptions?.enabled ? maps[0].labOptions.siteQuota : null;

  const skews = burgs.flatMap(b =>
    (b.crossings ?? []).map(c => {
      const axis = [c.deckB[0] - c.deckA[0], c.deckB[1] - c.deckA[1]];
      const t = c.tangent;
      const along = Math.abs(axis[0] * t[0] + axis[1] * t[1]) / (Math.hypot(...axis) * Math.hypot(...t) || 1);
      return (Math.asin(Math.min(1, along)) * 180) / Math.PI;
    })
  );
  const bridgeMaps = maps.filter(m => m.bridgeViolations);
  const alerts = countBy(
    burgs.flatMap(b => b.waterfrontCheck?.alerts ?? []),
    a => a.kind + (a.reason ? `:${a.reason}` : "")
  );
  return {
    maps: maps.length,
    burgs: burgs.length,
    labBurgs: lab.length,
    filteredToPorts: burgs.length > 0 && burgs.every(b => b.port || b.seaPort || b.riverPort || b.lakePort),
    pageErrorMaps: maps.filter(m => m.pageErrors?.length).map(m => ({ seed: m.seed, error: m.pageErrors[0] })),
    medianGenMs: quantile(maps.map(m => m.genMs), 0.5),
    medianRivers: quantile(maps.map(m => m.riverCount), 0.5),
    medianBurgsPerMap: quantile(maps.map(m => m.burgCount), 0.5),
    quota,
    shortfall,
    confusion: Object.fromEntries(Object.entries(byIntended).map(([kind, list]) => [kind, countBy(list, b => b.siteKindActual ?? "water")])),
    byActual: Object.fromEntries(
      Object.entries(byActual).map(([kind, list]) => [
        kind,
        {
          ...portRates(list),
          perMap: list.length / (maps.length || 1),
          distanceToMouthKm: [quantile(list.map(b => b.river?.distanceToMouthKm), 0.5), quantile(list.map(b => b.river?.distanceToMouthKm), 0.9)],
          flux: quantile(list.map(b => b.river?.flux), 0.5),
          widthM: quantile(list.map(b => b.river?.widthM), 0.5),
          curvatureDeg: quantile(list.map(b => b.river?.curvatureDeg), 0.5),
          confluenceOrder: countBy(list.filter(b => b.river), b => b.river.confluenceOrder),
          outflow: countBy(list.filter(b => b.river), b => b.river.outflow),
          bankSide: countBy(list.filter(b => b.river), b => b.river.bankSide)
        }
      ])
    ),
    byIntended: Object.fromEntries(Object.entries(byIntended).map(([kind, list]) => [kind, portRates(list)])),
    waterfrontAlerts: alerts,
    // Navigable river burgs by where their river ends: a terminus that never yields river ports
    // points at drain resolution (Rivers.resolveDrainFeature), not at the site.
    riverPortByOutflow: Object.fromEntries(
      Object.entries(Object.groupBy(burgs.filter(b => (b.river?.flux ?? 0) >= 100), b => b.river.outflow ?? "unknown")).map(
        ([outflow, list]) => [outflow, { n: list.length, riverPort: list.filter(b => b.riverPort).length }]
      )
    ),
    waterfrontFailByCapital: [true, false].map(capital => {
      const ports = burgs.filter(b => b.port && Boolean(b.capital) === capital);
      return { capital, ports: ports.length, failed: ports.filter(b => !b.waterfrontCheck?.ok).length };
    }),
    bridges: {
      descriptorBurgs: burgs.filter(b => b.descriptorRead).length,
      crossings: skews.length,
      histogram: SKEW_BUCKETS.map((limit, i) => ({
        range: `${i ? SKEW_BUCKETS[i - 1] : 0}–${limit === Infinity ? "" : limit}`,
        n: skews.filter(s => s >= (i ? SKEW_BUCKETS[i - 1] : 0) && s < limit).length
      })),
      maxSkewDeg: skews.length ? Math.max(...skews) : null,
      overPeriodLimit: bridgeMaps.reduce((n, m) => n + m.bridgeViolations.overPeriodLimit, 0),
      overMaxLimit: bridgeMaps.reduce((n, m) => n + m.bridgeViolations.overMaxLimit, 0),
      periodLimitDeg: bridgeMaps[0]?.bridgeViolations.periodLimitDeg ?? null
    }
  };
}

/** Rule-based improvement candidates; thresholds are deliberately coarse pointers, not verdicts. */
function candidates(run, control) {
  const out = [];
  const a = run.byActual;
  const rate = (s, key) => (s?.n ? s[key] / s.n : null);
  const estuary = a.estuary;
  for (const [outflow, s] of Object.entries(run.riverPortByOutflow))
    if (s.n >= 20 && s.riverPort / s.n < 0.25)
      out.push(`Navigable burgs on rivers ending in "${outflow}" are river ports ${pct(s.riverPort, s.n)} of the time (${s.n} burgs): the drain feature is not resolved through that terminus.`);
  const [capitals, towns] = run.waterfrontFailByCapital;
  if (capitals.ports >= 10 && towns.ports >= 10 && towns.failed / towns.ports > 2 * (capitals.failed / capitals.ports))
    out.push(`Waterfront failures concentrate on towns (${pct(towns.failed, towns.ports)}) rather than capitals (${pct(capitals.failed, capitals.ports)}).`);
  if (estuary && rate(estuary, "both") < 0.8)
    out.push(`Estuary burgs are dual sea+river ports only ${pct(estuary.both, estuary.n)} of the time (sea ${pct(estuary.seaPort, estuary.n)}, river ${pct(estuary.riverPort, estuary.n)}): port selection or haven choice at river mouths.`);
  for (const kind of ["confluence", "confluenceBelow", "deltaBranch", "meander", "riverBank", "lakeOutlet"]) {
    const s = a[kind];
    if (s?.navigable >= 10 && s.riverPort / s.navigable < 0.5)
      out.push(`${kind}: only ${pct(s.riverPort, s.navigable)} of burgs on navigable rivers became river ports.`);
  }
  for (const [kind, s] of Object.entries(a))
    if (s.ports >= 10 && s.waterfrontFailed / s.ports > 0.05)
      out.push(`${kind}: ${pct(s.waterfrontFailed, s.ports)} of ports fail the waterfront check.`);
  if (run.quota)
    for (const [kind, missing] of Object.entries(run.shortfall)) {
      const wanted = (run.quota[kind] ?? 0) * run.maps;
      if (wanted && missing / wanted > 0.25)
        out.push(`${kind}: ${pct(missing, wanted)} of the quota found no candidate cell (river network / terrain supply).`);
    }
  for (const [intended, row] of Object.entries(run.confusion)) {
    const total = Object.values(row).reduce((n, v) => n + v, 0);
    if (total && (row[intended] ?? 0) / total < 0.95) out.push(`Lab placement drifts: ${intended} lands as ${intended} only ${pct(row[intended] ?? 0, total)}.`);
  }
  if (run.bridges.overMaxLimit || run.bridges.histogram.at(-1).n)
    out.push(`Bridges beyond ${SKEW_BUCKETS.at(-2)}° skew exist (${run.bridges.histogram.at(-1).n} crossings): AGENTS.md forbids them in every period.`);
  if (control) {
    for (const kind of ["estuary", "confluence", "lakeOutlet", "confluenceBelow"]) {
      const share = (r, k) => (r.byActual[k]?.n ?? 0) / (r.burgs || 1);
      if (share(control, kind) < 0.03)
        out.push(`Current algorithm (control) rarely settles ${kind} sites: ${pct(control.byActual[kind]?.n ?? 0, control.burgs)} of burgs. A site-score bonus could be considered (§9.3).`);
    }
    const cEst = control.byActual.estuary;
    if (cEst?.n >= 10 && estuary && rate(cEst, "both") + 0.15 < rate(estuary, "both"))
      out.push(`Control estuary burgs are dual ports ${pct(cEst.both, cEst.n)} vs lab ${pct(estuary.both, estuary.n)}: ordinary port thinning (one port per landmass) suppresses river-mouth ports.`);
  }
  return out;
}

function render(run, control) {
  const s = [];
  s.push(`# River-Port Lab report\n`);
  s.push(`Run: \`${runPath}\`${control ? ` · Control: \`${controlPath}\`` : ""}\n`);
  s.push(
    table(
      ["", "maps", "burgs", "lab burgs", "burgs/map", "rivers/map", "gen ms (median)", "page-error maps"],
      [run, control].filter(Boolean).map((r, i) => [
        i ? "control" : "run",
        r.maps,
        r.burgs,
        r.labBurgs,
        fmt(r.medianBurgsPerMap),
        fmt(r.medianRivers),
        fmt(r.medianGenMs),
        r.pageErrorMaps.length
      ])
    )
  );
  if (run.filteredToPorts) s.push(`\n> The run holds port burgs only (default filter): port rates below are 100% by construction. Collect with \`--filter '{"all":true}'\` for rates.`);
  if (run.pageErrorMaps.length) s.push(`\nPage errors: ${run.pageErrorMaps.map(e => `seed ${e.seed} (${e.error.slice(0, 80)})`).join("; ")}`);

  s.push(`\n## Intended → actual site kind (lab burgs)\n`);
  const actualKinds = [...KINDS, "water"].filter(k => Object.values(run.confusion).some(row => row[k]));
  s.push(
    table(
      ["intended \\ actual", ...actualKinds, "match", "shortfall"],
      KINDS.filter(k => run.confusion[k] || run.shortfall[k]).map(k => {
        const row = run.confusion[k] ?? {};
        const total = Object.values(row).reduce((n, v) => n + v, 0);
        return [k, ...actualKinds.map(a => row[a] ?? ""), pct(row[k] ?? 0, total), run.shortfall[k] ?? 0];
      })
    )
  );

  const rateRows = (r, groups) =>
    KINDS.filter(k => groups[k]).map(k => {
      const g = groups[k];
      return [k, g.n, pct(g.port, g.n), pct(g.seaPort, g.n), pct(g.riverPort, g.n), pct(g.both, g.n), pct(g.lakePort, g.n), g.navigable ? pct(g.riverPort, g.navigable) : "–", pct(g.waterfrontFailed, g.ports)];
    });
  const rateHeader = ["kind", "burgs", "port", "sea", "river", "sea+river", "lake", "river port / navigable", "waterfront fail"];
  s.push(`\n## Ports by actual site kind\n`);
  s.push(table(rateHeader, rateRows(run, run.byActual)));
  if (Object.keys(run.byIntended).length) {
    s.push(`\n### By intended kind (lab burgs only)\n`);
    s.push(table(rateHeader, rateRows(run, run.byIntended)));
  }
  s.push(`\nNavigable river burgs by river terminus: ${Object.entries(run.riverPortByOutflow).map(([o, v]) => `${o} ${v.riverPort}/${v.n} river ports`).join(", ")}`);
  s.push(`\nWaterfront failures: capitals ${run.waterfrontFailByCapital[0].failed}/${run.waterfrontFailByCapital[0].ports}, towns ${run.waterfrontFailByCapital[1].failed}/${run.waterfrontFailByCapital[1].ports}`);
  if (Object.keys(run.waterfrontAlerts).length)
    s.push(`\nWaterfront alerts: ${Object.entries(run.waterfrontAlerts).map(([k, n]) => `${k} ×${n}`).join(", ")}`);

  s.push(`\n## River geometry by actual kind\n`);
  s.push(
    table(
      ["kind", "to mouth km (p50/p90)", "flux p50", "width m p50", "curvature° p50", "confluence order", "outflow", "bank side"],
      KINDS.filter(k => run.byActual[k]?.n && k !== "coastNoRiver" && k !== "inland").map(k => {
        const g = run.byActual[k];
        const dict = d => Object.entries(d).map(([key, n]) => `${key}:${n}`).join(" ");
        return [k, `${fmt(g.distanceToMouthKm[0])} / ${fmt(g.distanceToMouthKm[1])}`, fmt(g.flux), fmt(g.widthM), fmt(g.curvatureDeg), dict(g.confluenceOrder), dict(g.outflow), dict(g.bankSide)];
      })
    )
  );

  const b = run.bridges;
  s.push(`\n## Bridge skew\n`);
  if (!b.descriptorBurgs) s.push("No descriptor in the samples: collect with `--include descriptor` to measure bridges.");
  else {
    s.push(`${b.crossings} crossings near ${b.descriptorBurgs} burgs (per-burg CE crossings; a shared bridge can count twice). Max ${fmt(b.maxSkewDeg)}°. Over the start-period limit (${b.periodLimitDeg}°): ${b.overPeriodLimit}; over the absolute maximum: ${b.overMaxLimit}.\n`);
    s.push(table(b.histogram.map(h => `${h.range}°`), [b.histogram.map(h => h.n)]));
  }

  if (control) {
    s.push(`\n## Control (current algorithm) vs run\n`);
    s.push(
      table(
        ["kind", "control share", "run share", "control sea+river", "run sea+river", "control river port / navigable", "run river port / navigable"],
        KINDS.map(k => {
          const c = control.byActual[k],
            r = run.byActual[k];
          return [k, pct(c?.n ?? 0, control.burgs), pct(r?.n ?? 0, run.burgs), c ? pct(c.both, c.n) : "–", r ? pct(r.both, r.n) : "–", c?.navigable ? pct(c.riverPort, c.navigable) : "–", r?.navigable ? pct(r.riverPort, r.navigable) : "–"];
        })
      )
    );
  }

  const list = candidates(run, control);
  s.push(`\n## Improvement candidates (rule-based)\n`);
  s.push(list.length ? list.map(c => `- ${c}`).join("\n") : "- none flagged");
  return `${s.join("\n")}\n`;
}

const run = analyze(await load(runPath));
const control = controlPath ? analyze(await load(controlPath)) : null;
if (asJson) console.log(JSON.stringify({ run, control, candidates: candidates(run, control) }, null, 2));
else process.stdout.write(render(run, control));
