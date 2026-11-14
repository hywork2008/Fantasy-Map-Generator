import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { VectorLandUseKind } from "../../../types/vector/landUse";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { validateVectorLandUse } from "../landUse";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";

const town = (biome: string) => {
  const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
  d.biome = { ...(d.biome ?? { id: 0, name: biome, color: "#000" }), key: biome };
  return generateVectorSkeleton(vectorInputFromDescriptor(d), {
    ...DEFAULT_VECTOR_GENERATION,
    seed: "w1",
    wall: "ellipse"
  }).document;
};
const area = (doc: ReturnType<typeof town>, kind: VectorLandUseKind) =>
  doc.environment?.landUse?.zones.find(z => z.kind === kind)?.areaM2 ?? 0;

describe("open land by use beyond the town (pre-acceptance U5b)", () => {
  it("ploughs round a temperate town and along its roads, grazes beyond, apart from roads and water", () => {
    const doc = town("temperateDeciduousForest"),
      zones = doc.environment!.landUse!.zones;
    expect(validateVectorLandUse(doc)).toEqual([]);
    expect(area(doc, "arable")).toBeGreaterThan(area(doc, "pasture"));
    expect(area(doc, "pasture")).toBeGreaterThan(0);
    const all = zones.flatMap(z => z.regions),
      sum = zones.reduce((n, z) => n + z.areaM2, 0),
      union = regionBoolean(all, [], "union").reduce((n, r) => n + regionArea(r), 0);
    // The zones do not overlap.
    expect(sum - union).toBeLessThan(1);
    const obstacles = [
      ...allVectorWater(doc),
      ...Object.values(doc.paths)
        .filter(p => p.role === "road")
        .map(pathSurface)
    ];
    expect(regionBoolean(all, obstacles, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1);
  });

  it("farms a desert only round the town and leaves the rest barren", () => {
    const desert = town("hotDesert");
    expect(desert.environment!.landUse!.landClass).toBe("desert");
    expect(area(desert, "pasture")).toBe(0);
    expect(area(desert, "arable")).toBeLessThan(area(town("temperateDeciduousForest"), "arable") / 4);
    expect(area(desert, "wild")).toBeGreaterThan(area(desert, "arable"));
  });
});
