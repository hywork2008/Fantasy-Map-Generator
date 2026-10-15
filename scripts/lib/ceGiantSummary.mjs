// Summarise benchmarkCeGiant JSONL: top self-time stages and whole-document op totals.
import { readFileSync } from "node:fs";
const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").map(line => JSON.parse(line));
const top = Number(process.argv[3] ?? 25);
for (const row of rows) {
  console.log(`\n# ${row.seed} ${row.population}: ${(row.totalMs / 1000).toFixed(2)} s, faces ${row.faces}, success ${row.success}, report pop ${row.report?.assignedPopulation} unplaced ${row.report?.unplacedPopulation} buildings ${row.report?.estimatedBuildings}`);
  console.log("## self time by stage");
  for (const t of [...row.breakdown].sort((a, b) => b.selfMs - a.selfMs).slice(0, top))
    console.log(`${(t.selfMs / 1000).toFixed(2).padStart(7)} s  ${String(t.calls).padStart(4)}x  ${t.path}`);
  if (!row.ops.length) continue;
  console.log("## whole-document ops (inclusive; moveVertices contains clone/validate/...)");
  const byOp = new Map();
  for (const s of row.ops) { const o = byOp.get(s.op) ?? { calls: 0, ms: 0 }; o.calls += s.calls; o.ms += s.ms; byOp.set(s.op, o); }
  for (const [op, o] of [...byOp].sort((a, b) => b[1].ms - a[1].ms))
    console.log(`${(o.ms / 1000).toFixed(2).padStart(7)} s  ${String(o.calls).padStart(7)}x  ${(o.ms / o.calls).toFixed(2).padStart(7)} ms/call  ${op}`);
  console.log("## by op x stage (top)");
  for (const s of [...row.ops].sort((a, b) => b.ms - a.ms).slice(0, top))
    console.log(`${(s.ms / 1000).toFixed(2).padStart(7)} s  ${String(s.calls).padStart(6)}x  ${s.op.padEnd(22)} ${s.stage}`);
}
