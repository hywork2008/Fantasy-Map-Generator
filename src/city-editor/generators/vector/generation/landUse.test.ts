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

describe("open-field furlongs on the arable (pre-acceptance U5c)", () => {
  it("cuts the arable into bundles of long narrow strips that keep headlands between them", () => {
    const doc = town("temperateDeciduousForest"),
      use = doc.environment!.landUse!,
      arable = use.zones.find(z => z.kind === "arable")!.regions,
      furlongs = use.furlongs!;
    expect(validateVectorLandUse(doc)).toEqual([]);
    expect(furlongs.length).toBeGreaterThan(5);
    const outlines = furlongs.flatMap(f => f.outline),
      covered = outlines.reduce((n, r) => n + regionArea(r), 0);
    // Bundles lie on the arable and do not overlap; headlands and gores are left between them.
    expect(regionBoolean(outlines, arable, "difference").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1);
    expect(covered - regionBoolean(outlines, [], "union").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1);
    expect(covered / area(doc, "arable")).toBeGreaterThan(0.4);
    expect(covered / area(doc, "arable")).toBeLessThan(0.97);
    // Strips are long and narrow.
    const strips = furlongs.flatMap(f => f.strips);
    const narrow = strips.filter(r => {
      const xs = r.outer;
      let d = 0;
      for (const a of xs) for (const b of xs) d = Math.max(d, Math.hypot(a[0] - b[0], a[1] - b[1]));
      return d * d > regionArea(r) * 4;
    });
    expect(narrow.length / strips.length).toBeGreaterThan(0.8);
    // Three great fields, each in its own course of the rotation.
    expect(new Set(furlongs.map(f => f.course))).toEqual(new Set(["winter", "spring", "fallow"]));
    for (const field of new Set(furlongs.map(f => f.field)))
      expect(new Set(furlongs.filter(f => f.field === field).map(f => f.course)).size).toBe(1);
  });
});
