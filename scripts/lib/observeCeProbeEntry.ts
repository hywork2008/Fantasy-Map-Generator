import { writeFileSync } from "node:fs";
import { join } from "node:path";

await import("../../src/test-setup");
const { loadArchiveWorld } = await import("../../src/city-editor/services/analysis/housingReport");
const { probeBurgGrowth, useLoadedApproachLedger } = await import(
  "../../src/city-editor/services/analysis/approachGrowthProbe"
);

type Variant = "neighbors" | "traffic";

/**
 * Loads a snapshot and probes the burgs (docs/plan/approach-traffic-observatory.md §7.2), once per
 * `approachGrowthSource` variant (O4). With `svgDir`, writes `<burg>-<variant>.svg` for each town.
 */
export async function probeArchive(archive: string, burgIds: number[], variants: Variant[] = ["neighbors"], svgDir?: string) {
  await loadArchiveWorld(archive);
  useLoadedApproachLedger();
  return burgIds.flatMap(id =>
    variants.map(variant =>
      probeBurgGrowth(id, variant, svgDir ? svg => writeFileSync(join(svgDir, `${id}-${variant}.svg`), svg) : undefined)
    )
  );
}
