// node scripts/lib/cpuProfileTop.mjs PROFILE [ancestorFunctionName] [top]
// Self time by function (file:line), optionally restricted to samples under an ancestor frame.
import { readFileSync } from "node:fs";
const [file, ancestor, topArg] = process.argv.slice(2);
const top = Number(topArg ?? 30);
const profile = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const label = n => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/")}:${n.callFrame.lineNumber + 1}`;
const dt = new Map();
profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
const under = id => {
  if (!ancestor) return true;
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) if (nodes.get(cur).callFrame.functionName === ancestor) return true;
  return false;
};
const self = new Map(), incl = new Map();
let total = 0;
for (const [id, ms] of dt) {
  if (!under(id)) continue;
  total += ms;
  const key = label(nodes.get(id));
  self.set(key, (self.get(key) ?? 0) + ms);
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = label(nodes.get(cur));
    if (seen.has(k)) continue;
    seen.add(k);
    incl.set(k, (incl.get(k) ?? 0) + ms);
  }
}
console.log(`total ${(total / 1000).toFixed(2)} s${ancestor ? ` under ${ancestor}` : ""}`);
console.log("## self");
for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${(ms / 1000).toFixed(2).padStart(7)} s  ${k}`);
console.log("## inclusive");
for (const [k, ms] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${(ms / 1000).toFixed(2).padStart(7)} s  ${k}`);
