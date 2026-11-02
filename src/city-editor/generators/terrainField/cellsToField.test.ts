import { describe, expect, it } from "vitest";
import type { Point } from "../../types/primitives";
import { createDocument, createGridDocument } from "../document";
import { generateCityOnDocument } from "../generation/generateCity";
import { facePoints } from "../mesh";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { cityTerrain } from "../terrainElevation";
import { classifyTownWater } from "../townWater";
import { cellConversionError, cellsToFieldRecipe, convertCellsToField } from "./cellsToField";

describe("cell elevation conversion", () => {
  it("rebuilds a sloped cell surface within a few metres", () => {
    const document = createGridDocument({ size: "micro", seed: "cells-to-field", grid: "hex" });
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water !== "land") continue;
      const ring = facePoints(document.mesh, face);
      const mean = ring.reduce((sum, point) => sum + point[0], 0) / Math.max(1, ring.length);
      face.properties.elevation = 12 + mean * 0.02;
    }
    const recipe = cellsToFieldRecipe(document, 20, 8);
    expect(recipe?.template).toBe("cells");
    expect(recipe?.parts[0]?.kind).toBe("coarse");
    const error = cellConversionError(document, recipe!);
    expect(error.samples).toBeGreaterThan(10);
    expect(error.max).toBeLessThan(3);
    expect(error.rms).toBeLessThan(1);
  });

  it("cuts a falling river valley through a converted high-centre hill", () => {
    const seed = "convert-river-hill";
    const city = generateCityOnDocument(
      createDocument(seed, 600),
      { config: { ...DEFAULT_SITE_CONFIG, rivers: ["through"] }, elevationPreset: "dome", elevationRelief: 2 },
      seed
    );
    expect(city).not.toBeNull();
    const converted = convertCellsToField(city!)!;
    const corridor = converted.terrain!.features.find(feature => feature.kind === "riverCorridor");
    expect(corridor?.kind).toBe("riverCorridor");
    if (corridor?.kind !== "riverCorridor") return;
    const terrain = cityTerrain(converted, { renderSpacing: 8 });
    const levels = corridor.centerline.map(point => terrain.waterAt!(point)!);
    expect(levels.every(level => level !== null)).toBe(true);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1e-6);
    // On the hill the banks stand well above the water, so the river runs in a valley.
    const crest = corridor.centerline.reduce((best, point) =>
      terrain.heightAt(offset(corridor.centerline, point, 15)) > terrain.heightAt(offset(corridor.centerline, best, 15))
        ? point
        : best
    );
    expect(terrain.heightAt(offset(corridor.centerline, crest, 15)) - terrain.waterAt!(crest)!).toBeGreaterThan(5);
    // Every vertex of the drawn river water reads the corridor surface, not the ground.
    for (const part of classifyTownWater(converted).parts)
      if (part.kind === "river") for (const point of part.polygon) expect(terrain.waterAt!(point)).not.toBeNull();
  }, 120000);
});

/** A point `meters` to the left of the centre line at `point`. */
function offset(line: readonly Point[], point: Point, meters: number): Point {
  const index = Math.max(1, line.indexOf(point));
  const a = line[index - 1];
  const b = line[index];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [point[0] - ((b[1] - a[1]) / length) * meters, point[1] + ((b[0] - a[0]) / length) * meters];
}
