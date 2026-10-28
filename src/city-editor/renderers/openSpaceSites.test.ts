import { expect, it } from "vitest";
import { BURIAL_CULTURE_PRESETS } from "../../data/burialCultures";
import { layoutCemetery } from "../generators/cemeteryLayout";
import { cemeteryPlots } from "../generators/cemeteryPlots";
import type { CemeteryPlan, CityDocument, Point } from "../types/document";
import { collectOpenSpacePlan } from "./openSpaceSites";

const ring: Point[] = [
  [-45, -45],
  [45, -45],
  [45, 45],
  [-45, 45]
];
const city: CityDocument = {
  format: "fmg-city-editor",
  version: 2,
  frame: { extentMeters: 150, cityRadiusMeters: 60, blockSizeMeters: 20 },
  mesh: { vertices: {}, edges: {}, faces: {} },
  featureGroups: [],
  gates: [],
  elements: []
};
function cemetery(): CemeteryPlan {
  return {
    id: "c",
    version: 1,
    seed: "open-spaces",
    form: "churchyard",
    faceId: "f",
    boundary: ring,
    courtyards: [ring],
    parts: [],
    accesses: [],
    trees: [],
    provenance: "generated",
    locked: false,
    gatePoint: [0, -45]
  };
}

it("shares legacy burial plots with SVG, including path, monument and tree exclusions", () => {
  const plan = cemetery();
  plan.parts = [
    { id: "graves", role: "graves", footprint: ring, entrances: [], locked: false },
    {
      id: "cross",
      role: "calvary",
      footprint: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ],
      entrances: [],
      locked: false
    }
  ];
  plan.accesses = [
    {
      points: [
        [0, -45],
        [0, 45]
      ],
      widthMeters: 3
    }
  ];
  plan.trees = [[15, 15]];
  const before = JSON.stringify(plan);
  const plots = cemeteryPlots(plan, plan.parts[0]);
  const result = collectOpenSpacePlan([], [plan]);
  expect(result.sites.filter(s => s.model === "headstone").map(s => s.point)).toEqual(plots.map(p => p.point));
  expect(result.sites.filter(s => s.model === "ledger")).toHaveLength(plots.filter(p => p.slab).length);
  expect(plots.every(p => Math.abs(p.point[0]) >= 1.95 && Math.hypot(p.point[0] - 15, p.point[1] - 15) >= 2.2)).toBe(
    true
  );
  expect(JSON.stringify(plan)).toBe(before);
  const walls = result.sites.filter(s => s.model === "high_stone_wall");
  expect(walls).toHaveLength(5);
  expect(walls.filter(s => s.point[1] === -45).every(s => Math.abs(s.point[0]) - (s.width ?? 0) / 2 >= 1.5)).toBe(true);
});

it.each(Object.values(BURIAL_CULTURE_PRESETS))(
  "preserves the saved $id culture without adding ground graves or foreign symbols",
  profile => {
    const input = { ...cemetery(), burialProfile: profile };
    const saved = layoutCemetery(city, input)!;
    expect(saved).not.toBeNull();
    const result = collectOpenSpacePlan([], [saved]);
    expect(result.sites.length).toBeGreaterThan(0);
    if (profile.vegetation === "barren_gravel")
      expect(result.sites.some(s => s.model === "garden_parkland" || s.model === "sacred_yew")).toBe(false);
    expect(result.sites.filter(s => s.model === "headstone")).toHaveLength(
      saved.parts.filter(p => p.kind === "headstone_grid" || p.kind === "crowded_jumble").length
    );
    expect(result.sites.filter(s => s.model === "preaching_cross_calvary")).toHaveLength(
      saved.parts.filter(p => p.kind === "preaching_cross_calvary").length
    );
    if (profile.id === "edo_temple_town") expect(result.sites.some(s => s.model === "chapel")).toBe(false);
    if (profile.boundary === "open_desert_field")
      expect(result.sites.some(s => s.model === "high_stone_wall")).toBe(false);
    expect(result.sites.every(s => s.point.every(Number.isFinite) && Number.isFinite(s.angle))).toBe(true);
  }
);

it("keeps a rotated saved marker's position, orientation and dimensions", () => {
  const angle = 0.37,
    point: Point = [15, 24];
  const footprint: Point[] = [
    [-0.4, -0.65],
    [0.4, -0.65],
    [0.4, 0.65],
    [-0.4, 0.65]
  ].map(([x, y]) => [
    point[0] + x * Math.cos(angle) - y * Math.sin(angle),
    point[1] + x * Math.sin(angle) + y * Math.cos(angle)
  ]);
  const saved = cemetery();
  saved.parts = [{ id: "m", role: "monument", kind: "crowded_jumble", footprint, entrances: [], locked: false }];
  const marker = collectOpenSpacePlan([], [saved]).sites.find(s => s.model === "headstone")!;
  expect(marker.point[0]).toBeCloseTo(point[0]);
  expect(marker.point[1]).toBeCloseTo(point[1]);
  expect(marker.angle).toBeCloseTo(angle);
  expect(marker.width).toBeCloseTo(0.8);
  expect(marker.depth).toBeCloseTo(1.3);
});

it("uses saved park lawns, paths and canopy centers and radii", () => {
  const park = {
    faceId: "park",
    lawnPolygons: [ring],
    paths: [
      [
        [0, 0],
        [10, 0]
      ] as Point[]
    ],
    grassTufts: [[4, 5] as Point],
    trees: [{ center: [15, 20] as Point, radius: 4, subCircles: [] }]
  };
  const result = collectOpenSpacePlan([park], []);
  expect(result.sites).toEqual([{ model: "garden_parkland", point: [15, 20], radius: 4, angle: 0 }]);
  expect(result.surfaces[0].ring).toBe(park.lawnPolygons[0]);
  expect(result.surfaces.some(s => s.color === "#d8d1bf")).toBe(true);
  expect(result.surfaces.some(s => s.color === "#5d8249")).toBe(true);
});

it("derives solid water-terrace steps with increasing heights", () => {
  const saved = { ...cemetery(), burialProfile: BURIAL_CULTURE_PRESETS.varanasi_ghat };
  saved.accesses = [0, 0.8, 1.6].map(y => ({
    points: [
      [0, y],
      [20, y]
    ] as Point[],
    widthMeters: 0.3
  }));
  const steps = collectOpenSpacePlan([], [saved]).sites.filter(
    s => s.model === "flat_ground_markers" && s.depth === 0.85
  );
  expect(steps.map(s => s.height)).toEqual([0.2, 0.4, 0.6000000000000001]);
  expect(steps.every(s => s.width === 20 && s.depth === 0.85)).toBe(true);
});

it("uses boreal BV species for cold taiga parks and cemeteries while retaining saved footprints", () => {
  const document = {
    ...city,
    biome: { id: 9, key: "taiga", name: "Taiga", color: "green" },
    buildingAppearanceContext: {
      period: "ageOfExploration",
      temperatureC: 1,
      forest: true,
      arid: false,
      wetland: false
    }
  };
  const park = {
    faceId: "park",
    lawnPolygons: [ring],
    paths: [],
    grassTufts: [],
    trees: Array.from({ length: 12 }, (_, i) => ({ center: [i * 7, 10] as Point, radius: 3, subCircles: [] }))
  };
  const saved = cemetery();
  saved.trees = [[15, 15]];
  const before = JSON.stringify({ park, saved });
  const result = collectOpenSpacePlan([park], [saved], document);
  const trees = result.sites.filter(site => site.model === "norway_spruce" || site.model === "silver_birch");
  expect(trees).toHaveLength(13);
  expect(trees.some(tree => tree.model === "silver_birch")).toBe(true);
  expect(trees.find(tree => tree.point[0] === 15 && tree.point[1] === 15)?.model).toBe("norway_spruce");
  expect(trees.filter(tree => tree.radius).map(tree => tree.radius)).toEqual(park.trees.map(tree => tree.radius));
  expect(JSON.stringify({ park, saved })).toBe(before);
  const barren = {
    ...saved,
    burialProfile: Object.values(BURIAL_CULTURE_PRESETS).find(profile => profile.vegetation === "barren_gravel")!
  };
  expect(collectOpenSpacePlan([], [barren], document).sites.some(site => site.model === "norway_spruce")).toBe(false);
});
