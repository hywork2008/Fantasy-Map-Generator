import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { heightmapTemplates } from "../data";
import { VolcanoConstants } from "../data/constants";
import { useOptionsState } from "../store/optionsState";
import { generateGrid } from "../utils/graphUtils";
import { HeightmapGenerator } from "./heightmap-generator";

/**
 * Regression coverage for the volcano-tagging guarantee (docs/plan brainstorm, see
 * finalizeVolcanoes/registerFallbackVolcanoCandidate): volcanismChance = 100 must tag a volcano
 * on every template whose generated terrain has a peak at or above
 * VolcanoConstants.FALLBACK_MIN_PEAK_HEIGHT (just above the land line — a freshly-emerged vent
 * that hasn't built up its cone yet is still academically a volcano), and volcanismChance = 0
 * must tag none, for every template — not just the few whose Hill calls happen to match the
 * single-dominant-peak signature.
 */
// points: 1 (2500 cells) instead of the default 10K — this test drives full grid + heightmap
// generation dozens of times (seeds × templates × 2 chance levels); cell count doesn't change
// which logic paths are exercised, only keeps CI runtime sane.
async function generateHeights(seed: string, template: string, volcanismChance: number, volcanoActiveChance = 50) {
  worldContext.graphWidth = 960;
  worldContext.graphHeight = 540;
  useOptionsState.getState().setOptions({ points: 1, template, volcanismChance, volcanoActiveChance });
  const grid = generateGrid(seed, worldContext.graphWidth, worldContext.graphHeight);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  grid.cells.h = heights;
  return grid;
}

describe("HeightmapGenerator volcano tagging", () => {
  it("tags a volcano on every template with a tall enough peak at 100% chance, none at 0%", async () => {
    // A couple of arbitrary seeds so this isn't tuned to one lucky/unlucky draw.
    for (const seed of ["98948141", "42424242"]) {
      for (const id of Object.keys(heightmapTemplates)) {
        const zero = await generateHeights(seed, id, 0);
        expect(Math.max(...(zero.cells.h as unknown as number[])), `${seed}/${id} @ 0%`).toBeGreaterThanOrEqual(0);
        expect(zero.cells.volcanic?.some(v => v > 0) ?? false, `${seed}/${id} @ 0% should have no volcano`).toBe(false);

        const full = await generateHeights(seed, id, 100);
        const peakHeight = Math.max(...(full.cells.h as unknown as number[]));
        const hasVolcano = full.cells.volcanic?.some(v => v >= VolcanoConstants.CORE_MIN_INTENSITY) ?? false;

        // One-directional: a tall-enough final peak MUST have a volcano (this is the
        // guarantee registerFallbackVolcanoCandidate exists to provide). The converse
        // doesn't hold — the primary single-dominant-Hill mechanism can tag a volcano whose
        // *raw* placement height qualified even if a later template step (e.g. lowIsland's
        // final "Multiply 0.4 ...") scales the whole island down afterward, leaving a modest
        // final peak. That's correct, deliberate behavior (see registerVolcanoCandidate's
        // own doc comment), not something this test asserts against.
        if (peakHeight >= VolcanoConstants.FALLBACK_MIN_PEAK_HEIGHT) {
          expect(hasVolcano, `${seed}/${id} @ 100% (peak ${peakHeight}) should have a volcano`).toBe(true);
        }
      }
    }
  }, 20000);

  it("tags a low-relief 'atoll' template's peak too (regression: seed 98948141 previously had none)", async () => {
    // atoll's tallest point for this seed is only 32 — comfortably above land (20) but nowhere
    // near a "dramatic mountain". Before FALLBACK_MIN_PEAK_HEIGHT was lowered to just above the
    // land line, this seed/template combination silently produced no volcano at 100% chance.
    const grid = await generateHeights("98948141", "atoll", 100);
    expect(Math.max(...(grid.cells.h as unknown as number[]))).toBeLessThan(40);
    expect(grid.cells.volcanic?.some(v => v >= VolcanoConstants.CORE_MIN_INTENSITY)).toBe(true);
  });

  it("clears stale volcano tags when re-generating the same grid object with chance lowered to 0", async () => {
    // Mirrors main.ts's prepareGenerationStage(): reusing the same Grid instance across a
    // "Regenerate climate and waterways" press, deleting only cells.h between runs.
    worldContext.graphWidth = 960;
    worldContext.graphHeight = 540;
    const seed = "98948141";
    useOptionsState.getState().setOptions({ points: 1, template: "highIsland", volcanismChance: 100 });
    const grid = generateGrid(seed, worldContext.graphWidth, worldContext.graphHeight);

    grid.cells.h = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
    expect(grid.cells.volcanic?.some(v => v >= VolcanoConstants.CORE_MIN_INTENSITY)).toBe(true);

    useOptionsState.getState().setOption("volcanismChance", 0);
    delete (grid.cells as { h?: unknown }).h;
    grid.cells.h = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);

    expect(grid.cells.volcanic?.some(v => v > 0) ?? false).toBe(false);
    expect(grid.cells.volcanicActive?.some(v => v > 0) ?? false).toBe(false);
  });
});
