await import("../../src/test-setup");
const { loadArchiveWorld } = await import("../../src/city-editor/services/analysis/housingReport");
const { probeBurgGrowth } = await import("../../src/city-editor/services/analysis/approachGrowthProbe");

/** Loads a snapshot and probes the burgs (docs/plan/approach-traffic-observatory.md §7.2). */
export async function probeArchive(archive: string, burgIds: number[]) {
  await loadArchiveWorld(archive);
  return burgIds.map(id => probeBurgGrowth(id));
}
