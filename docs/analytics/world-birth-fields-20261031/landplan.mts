/** World-birth land plan: where staple fields fall short of the people they must feed, and why. */
import { readFileSync } from "node:fs";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { getRuralFoodCapacity, getCultivableArea } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/agriculture";
import { getCroplandConstraints } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/agriculturalLandUse";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
const raw = (host as any);
const snap = (label: string) => {
  const w = getWorldContext(); const lu = w.pack.landUse; const rate = w.populationRate || 1;
  const t: Record<string, number> = { cells: 0, demandPeople: 0, requiredHa: 0, targetHa: 0, allocatedHa: 0, unallocatedHa: 0, shortCells: 0, shortHa: 0, atCeiling: 0, atCeilingShortHa: 0, wetlandShortHa: 0, forestShortHa: 0, capacityPeople: 0, ceilingHa: 0, physicalHa: 0 };
  const diag: Record<string, number> = {};
  const cap = getRuralFoodCapacity(); const cultivable = getCultivableArea();
  for (const [id, c] of Object.entries(lu?.cells ?? {}) as any) {
    t.cells++; t.demandPeople += c.foodDemandPeople; t.requiredHa += c.requiredAreaHa; t.targetHa += c.policyTargetAreaHa; t.allocatedHa += c.allocatedAreaHa; t.unallocatedHa += c.unallocatedAreaHa; t.physicalHa += c.physicalLandAreaHa;
    t.capacityPeople += (cap[+id] ?? 0) * rate;
    const k = getCroplandConstraints(w, +id); const ceiling = k?.terrainAndBiomeCeiling ?? 0; t.ceilingHa += ceiling;
    const short = Math.max(0, c.requiredAreaHa - c.allocatedAreaHa - (c.transportAllocations ?? []).reduce((s: number, a: any) => s + a.areaHa, 0));
    if (short > 1) { t.shortCells++; t.shortHa += short; const tags = w.biomesData.tags?.[w.pack.cells.biomeCode[+id]] ?? [];
      if (c.allocatedAreaHa >= ceiling * 0.98) { t.atCeiling++; t.atCeilingShortHa += short; }
      if (tags.includes("wetland")) t.wetlandShortHa += short; if (tags.includes("forest")) t.forestShortHa += short;
      for (const d of c.diagnostics ?? []) diag[d] = (diag[d] ?? 0) + short; }
  }
  return { label, year: lu?.year, revision: lu?.revision, provenance: lu?.provenance, totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])), shortByDiagnostic: Object.fromEntries(Object.entries(diag).map(([k, v]) => [k, Math.round(v)]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 12)) };
};
const out = [snap("loaded")];
await host.prepare(); applyConflictAutonomyFromEnv();
out.push(snap("prepared"));
await advanceWorld(host, { months: 12 });
out.push(snap("month12"));
console.log(JSON.stringify(out));
host.dispose();
