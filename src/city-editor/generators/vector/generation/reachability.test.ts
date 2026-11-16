import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { polygonCentroid } from "../../geom";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { vectorReachableLand } from "./reachability";

const area = (polygons: { outer: [number, number][]; holes: [number, number][][] }[]) =>
  polygons.reduce((n, r) => n + regionArea(r), 0);

describe("land reachable from the town centre (pre-acceptance U5)", () => {
  it("leaves out the far bank once no road crosses the river", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    const doc = generateVectorSkeleton(vectorInputFromDescriptor(d), {
      ...DEFAULT_VECTOR_GENERATION,
      seed: "w1",
      wall: "ellipse"
    }).document;
    const wall = samplePath(doc.paths["auto-wall"]).map(s => s.point),
      centre = polygonCentroid(wall),
      water = allVectorWater(doc),
      bridged = area(vectorReachableLand(doc, centre)!);
    const cut = structuredClone(doc);
    for (const p of Object.values(cut.paths))
      if (p.role === "road" && area(regionBoolean([pathSurface(p)], water, "intersection")) > 1) delete cut.paths[p.id];
    const unbridged = vectorReachableLand(cut, centre)!;
    expect(area(unbridged)).toBeLessThan(bridged * 0.95);
    expect(containsRegion(unbridged, centre)).toBe(true);
  });
});
