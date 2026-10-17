#!/usr/bin/env node
// O4 visual comparison (docs/plan/approach-traffic-observatory.md §11): for every
// <burg>-neighbors.svg / <burg>-traffic.svg pair under a CE probe folder, writes <burg>-diff.svg
// (houses only in the traffic variant in blue, only in the neighbors variant in red) and an
// index.html that lists the towns by how much changed, with the per-gate numbers.
//
//   node scripts/observeSvgDiff.mjs <ce-dir>
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: node scripts/observeSvgDiff.mjs <ce-dir>");

const BUILDING = /<path d="([^"]+)" class="ce-building"[^>]*\/>/g;
const buildings = svg => new Set([...svg.matchAll(BUILDING)].map(m => m[1]));
const esc = text => String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const rows = [];
for (const probe of readdirSync(dir).filter(name => statSync(join(dir, name)).isDirectory())) {
  const folder = join(dir, probe);
  const json = join(dir, `${probe}.json`);
  const probes = existsSync(json) ? JSON.parse(readFileSync(json, "utf8")).burgs : [];
  for (const file of readdirSync(folder).filter(name => name.endsWith("-neighbors.svg"))) {
    const burg = file.replace("-neighbors.svg", "");
    const trafficFile = join(folder, `${burg}-traffic.svg`);
    if (!existsSync(trafficFile)) continue;
    const before = readFileSync(join(folder, file), "utf8");
    const after = readFileSync(trafficFile, "utf8");
    const a = buildings(before);
    const b = buildings(after);
    const added = [...b].filter(d => !a.has(d));
    const removed = [...a].filter(d => !b.has(d));
    if (added.length || removed.length) {
      // Base: the traffic town with every house faded; changed houses drawn on top.
      const overlay = `<g id="o4-diff">${removed.map(d => `<path d="${d}" fill="#d0342c" stroke="#7a0f0a" stroke-width="0.4"/>`).join("")}${added.map(d => `<path d="${d}" fill="#1f6fd1" stroke="#0b3b78" stroke-width="0.4"/>`).join("")}</g>`;
      const diff = after
        .replace(/class="ce-building"/g, 'class="ce-building" opacity="0.35"')
        .replace(/<\/svg>\s*$/, `${overlay}</svg>`);
      writeFileSync(join(folder, `${burg}-diff.svg`), diff);
    }
    const pair = Object.fromEntries(probes.filter(p => String(p.burgId) === burg).map(p => [p.variant, p]));
    const gates = (pair.neighbors?.approaches ?? []).map(gate => {
      const other = pair.traffic?.approaches.find(g => g.approachId === gate.approachId);
      return {
        gate: gate.approachId.split(":").slice(2).join(":"),
        share: other?.approachShare ?? gate.approachShare,
        lots: [gate.lots, other?.lots ?? 0]
      };
    });
    rows.push({ probe, burg, total: a.size, added: added.length, removed: removed.length, gates });
  }
}
rows.sort((x, y) => y.added + y.removed - (x.added + x.removed));

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>O4 Suburb Changes</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a65;--line:#d9d6cf}@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--muted:#9a988f;--line:#3a3935}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:16px}table{border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:3px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}small{color:var(--muted)}
.add{color:#1f6fd1}.rem{color:#d0342c}</style></head><body>
<h1>O4: what <code>approachGrowthSource: "traffic"</code> changes</h1>
<p>Each diff image is the traffic-variant town with unchanged houses faded. <span class="rem">Red</span>: houses only in the current (neighbors) town. <span class="add">Blue</span>: houses only in the traffic town. Look outside the walls, along the roads: the suburb should move to the gate with the larger traffic share.</p>
<table><tr><th>Town</th><th>Changed houses</th><th>Gates: traffic share · suburb lots neighbors → traffic</th><th></th></tr>
${rows
  .map(
    r => `<tr><td>${esc(r.probe)}<br>burg ${esc(r.burg)}</td><td><span class="rem">−${r.removed}</span> <span class="add">+${r.added}</span><br><small>of ${r.total}</small></td><td>${r.gates
      .map(g => `${esc(g.gate)} · ${g.share === null || g.share === undefined ? "–" : `${Math.round(g.share * 100)}%`} · ${g.lots[0]} → ${g.lots[1]}`)
      .join("<br>")}</td><td>${r.added + r.removed ? `<a href="${esc(r.probe)}/${esc(r.burg)}-diff.svg">diff</a> · ` : "identical · "}<a href="${esc(r.probe)}/${esc(r.burg)}-neighbors.svg">neighbors</a> · <a href="${esc(r.probe)}/${esc(r.burg)}-traffic.svg">traffic</a></td></tr>`
  )
  .join("\n")}
</table></body></html>`;
writeFileSync(join(dir, "index.html"), html);
console.error(`[observe:diff] ${rows.length} pairs, ${rows.filter(r => r.added + r.removed).length} changed; ${join(dir, "index.html")}`);
