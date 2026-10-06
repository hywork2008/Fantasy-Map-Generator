import { describe, expect, it } from "vitest";
import { buildVoronoiSandboxDescriptor, DEFAULT_SANDBOX_OPTIONS, generateVoronoiSandbox } from "./voronoiSandbox";

describe("voronoi sandbox", () => {
  it("returns the requested number of cells", () => {
    for (const n of [1, 3, 7]) {
      const d = buildVoronoiSandboxDescriptor({ ...DEFAULT_SANDBOX_OPTIONS, cellCount: n });
      expect(d.cells).toHaveLength(n);
    }
  });

  it("gives forest biomes a forest canopy and non-forest biomes none", () => {
    const doc = generateVoronoiSandbox({
      ...DEFAULT_SANDBOX_OPTIONS,
      cellCount: 2,
      biomeKeys: ["taiga", "grassland"]
    });
    const [forest, plain] = doc.biomes;
    expect(forest.kind).toBe("coniferous_forest");
    expect(forest.forestPolygons?.length).toBeGreaterThan(0);
    expect(plain.forestPolygons).toBeUndefined();
  });
});
