import { describe, expect, it } from "vitest";
import { createVectorDocument } from "./document";
import { reconcileVectorEdit } from "./editing/dependencies";
import { rebuildRoadGraph } from "./editing/network";
import { curveSource } from "./editing/paths";
import { setVectorRegion } from "./editing/regions";
import { addVectorFeature } from "./features";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./generation/urban";
import { regionArea, regionBoolean } from "./geometry/regions";

const site = () => {
  const doc = createVectorDocument("m8-integration", 400);
  doc.paths.main = {
    id: "main",
    revision: 0,
    role: "road",
    origin: "manual",
    editPolicy: "editable",
    source: curveSource(
      [
        [0, -160],
        [0, 160]
      ],
      "polyline",
      false
    ),
    width: { leftMeters: 3, rightMeters: 3, stations: [] }
  };
  rebuildRoadGraph(doc);
  doc.site = {
    kind: "synthetic",
    id: "m8-site",
    revision: 0,
    transform: { originMapUnits: [0, 0], metersPerMapUnit: 1, localAxes: "east-north" },
    center: [0, 0],
    domain: [
      {
        outer: [
          [-150, -150],
          [150, -150],
          [150, 150],
          [-150, 150]
        ],
        holes: []
      }
    ],
    fixedPaths: [],
    crossings: [],
    water: []
  };
  return generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, wall: "none", branches: 0 }).document;
};
describe("M8 generation ownership", () => {
  it("reserves landscape before housing and reconciles a later feature without displacing fixed input", () => {
    const input = site();
    const urban = generateVectorUrban(input, {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval",
      population: 40,
      maxLanes: 0
    });
    const feature = addVectorFeature(urban, {
      kind: "forest",
      roadId: "main",
      boundary: {
        outer: [
          [20, 40],
          [60, 40],
          [60, 80],
          [20, 80]
        ],
        holes: []
      },
      density: 0.7,
      heightMeters: 12,
      activity: "closed",
      culture: "timber",
      moatWidthMeters: 0
    });
    const result = reconcileVectorEdit(urban, feature).document;
    expect(result.paths.main).toEqual(input.paths.main);
    const f = Object.values(result.environment!.features)[0];
    expect(result.urban).toBeDefined();
    for (const p of Object.values(result.placements))
      expect(regionBoolean([p.site], [f.boundary], "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(
        1e-5
      );
  });
  it("reconciles a new density limit instead of retaining housing in the changed district", () => {
    const input = site(),
      urban = generateVectorUrban(input, { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 40, maxLanes: 0 });
    expect(Object.keys(urban.placements).length).toBeGreaterThan(0);
    const edit = setVectorRegion(urban, urban.site!.domain[0], { kind: "district", density: 0, maxHeightMeters: 30 });
    const result = reconcileVectorEdit(urban, edit).document;
    expect(Object.values(result.placements)).toHaveLength(0);
    expect(result.urban!.report.unplacedPopulation).toBe(40);
  });
  it("promotes a generated lane used by an authored site to persistent input", () => {
    const input = site(),
      // Medieval lanes are fabric records (detached as paths in S2.1e); the house-placement route adopts lane paths.
      urban = generateVectorUrban(
        input,
        {
          ...DEFAULT_VECTOR_URBAN,
          mode: "medieval-facilities",
          population: 40,
          maxLanes: 4
        },
        undefined,
        // Lane paths are the house-placement route's (a housing search budget keeps facility mode on it).
        { housingAttempts: 40000 }
      );
    const id = urban.urban!.ownedPaths[0],
      path = urban.paths[id];
    expect(path).toBeDefined();
    if (path.source.kind !== "curve") throw Error("test-path");
    const end = path.source.segments.at(-1)!.to,
      x = end[0],
      y = end[1] + 12;
    const edit = addVectorFeature(urban, {
      kind: "forest",
      roadId: id,
      boundary: {
        outer: [
          [x - 5, y - 5],
          [x + 5, y - 5],
          [x + 5, y + 5],
          [x - 5, y + 5]
        ],
        holes: []
      },
      density: 0.7,
      heightMeters: 12,
      activity: "closed",
      culture: "timber",
      moatWidthMeters: 0
    });
    const result = reconcileVectorEdit(urban, edit).document;
    expect(result.paths[id].origin).toBe("manual");
    expect(result.urban!.ownedPaths).not.toContain(id);
    expect(result.environment!.features[Object.keys(result.environment!.features)[0]].access.pathId).toBe(id);
  });
  it("honors a zero-density district and reports unmet housing instead of filling it anyway", () => {
    const doc = site();
    const district = setVectorRegion(doc, doc.site!.domain[0], {
      kind: "district",
      use: "residential",
      density: 0,
      maxHeightMeters: 30
    });
    district.generation!.inputRevision = district.revision;
    const result = generateVectorUrban(district, {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval",
      population: 40,
      maxLanes: 0
    });
    expect(Object.values(result.placements)).toHaveLength(0);
    expect(result.urban!.report.unplacedPopulation).toBe(40);
  });
});
