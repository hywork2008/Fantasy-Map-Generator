// node scripts/lib/ceGiantCompare.mjs BASE.jsonl NEW.jsonl — time and fingerprint per population/seed.
import { readFileSync } from "node:fs";
const load = f => readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l));
const [base, next] = process.argv.slice(2).map(load);
for (const n of next) {
  const b = base.find(r => r.population === n.population && r.seed === n.seed);
  if (!b) continue;
  const same = Object.keys(b.fingerprint ?? {}).filter(k => b.fingerprint[k] !== n.fingerprint?.[k]);
  console.log(`${n.seed} ${n.population}: ${(b.totalMs / 1000).toFixed(2)} -> ${(n.totalMs / 1000).toFixed(2)} s (${((n.totalMs / b.totalMs - 1) * 100).toFixed(1)}%), fingerprint ${same.length ? `DIFF ${same.join(",")}` : "identical"}`);
}
