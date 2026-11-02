import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { facePoints } from "../mesh";
import { cellConversionError, cellsToFieldRecipe } from "./cellsToField";

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
});
