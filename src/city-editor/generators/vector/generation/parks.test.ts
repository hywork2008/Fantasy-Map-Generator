import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { polygonArea } from "../../geom";
import { MIN_FORTIFIED_PARK_TREE_AREA } from "../../parkFabric";
import { defaultPopulationSettings } from "../../populationPlan";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { validateVectorUrban } from "../validation/urban";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { streetBlockOf } from "./wards";

describe("park wards laid out by the mesh editor's park fabric (feature parity P7c)", () => {
  const build = (wall: "ellipse" | "none", seed: string, mode = DEFAULT_VECTOR_URBAN.mode) => {
    const settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(3000),
        historicalPeriod: "lateMedieval" as const,
        buildingPattern: "medieval" as const,
        // A straight river, as the default `through` river was when these cases were set (it is now a gentle
        // meander, docs/plan/ce-outskirts-workshop-sizes.md §8.21).
        config: { ...defaultGenerationSettings().config, riverForms: ["straight" as const] }
      },
      input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      });
    return generateVectorUrban(generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall }).document, {
      ...DEFAULT_VECTOR_URBAN,
      mode,
      population: 3000,
      lotOccupancy: 1
    });
  };
  it("turns each park ward into a lawn with no house, trees kept off the wall", () => {
    // A town whose parks include one planted with trees (the seed decides whether a park is large and clear of
    // the wall; seed p7c-f's parks are small esplanades along the wall since the interior is sized to be built out).
    const doc = build("ellipse", "p7c-c"),
      parkBlocks = new Set(doc.urban!.districts.filter(d => d.ward === "park").map(d => streetBlockOf(d.id))),
      parks = doc.urban!.parks ?? [];
    expect(parkBlocks.size).toBeGreaterThan(0);
    // This town houses everyone without its park blocks, so each stays a park.
    expect(new Set(parks.map(p => p.id))).toEqual(parkBlocks);
    expect(validateVectorUrban(doc)).toEqual([]);
    const walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => samplePath(p).map(s => s.point));
    for (const park of parks) {
      const cell = doc.fabric?.cells[park.id];
      expect(cell ? cell.houses.offsets.length - cell.detached.length : 0).toBe(0);
      for (const t of park.trees) {
        for (const line of walls)
          for (let i = 1; i < line.length; i++)
            expect(pointSegmentDistance(t.center, line[i - 1], line[i])).toBeGreaterThanOrEqual(11 - 1e-6);
      }
    }
    // A small park along the wall stays a bare esplanade, as the mesh editor leaves it. "Small" is the mesh rule's
    // measure, the park's outline (`MIN_FORTIFIED_PARK_TREE_AREA`), not its lawns: wall setbacks can leave a large
    // park with little lawn, and the mesh editor plants that one.
    for (const park of parks)
      if (
        doc
          .urban!.districts.filter(d => streetBlockOf(d.id) === park.id)
          .reduce((n, d) => n + Math.abs(polygonArea(d.polygon.outer)), 0) < MIN_FORTIFIED_PARK_TREE_AREA &&
        park.lawns
          .flat()
          .some(q => walls.some(line => line.slice(1).some((b, i) => pointSegmentDistance(q, line[i], b) < 15)))
      )
        expect(park.trees).toEqual([]);
    expect(parks.some(p => p.trees.length > 0)).toBe(true);
    expect(doc.urban!.report.unplacedPopulation).toBe(0);
  });
  it("keeps facilities off the park lawns in facility mode", () => {
    // Seed c3 once put a weaving workshop on a park block; the lawn was laid over it. Since the roadside ribbon
    // bends with its road (pre-acceptance U4) c3 draws no park ward, so the check runs on a1, which draws two.
    const doc = build("ellipse", "a1", "medieval-facilities"),
      parks = doc.urban!.parks ?? [];
    expect(parks.length).toBeGreaterThan(0);
    for (const p of doc.urban!.ownedPlacements.map(id => doc.placements[id]))
      if (p.building?.kind === "facility")
        for (const park of parks)
          for (const lawn of park.lawns)
            expect(
              regionBoolean([p.site], [{ outer: lawn, holes: [] }], "intersection").reduce(
                (n, r) => n + regionArea(r),
                0
              )
            ).toBeLessThan(1e-3);
  });
});
