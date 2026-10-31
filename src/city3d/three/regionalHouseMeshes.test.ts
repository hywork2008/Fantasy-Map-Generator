import * as THREE from "three";
import { expect, it } from "vitest";
import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import type { BuildingAppearanceProfile } from "../../buildings/appearance/types";
import { assignBuildingAppearances, withBuildingAppearance } from "../../city-editor/generators/buildingAppearance";
import { buildingAppearancePreview } from "../../city-editor/generators/buildingAppearancePreview";
import { createBuildingFrontageResolver } from "../../city-editor/generators/buildingFrontage";
import { createDocument } from "../../city-editor/generators/document";
import { createBvPrototypeCache } from "./bvInstances";
import { createCityMassing } from "./cityMeshes";
import { createTownRegionalHouses, regionalHouseSite } from "./regionalHouseMeshes";

const PROFILES: BuildingAppearanceProfile[] = [
  "mediterranean",
  "atlantic",
  "northern-wooded",
  "northern-urban",
  "stone-upland"
];

it("replaces regional lots with detailed houses that stay on their lot, and keeps legacy massing", () => {
  const cache = createBvPrototypeCache();
  for (const profile of PROFILES) {
    const lots = buildingAppearancePreview(profile);
    const layer = createTownRegionalHouses(lots, cache, () => 2);
    expect([...layer.replaced].sort()).toEqual([0, 1, 2]);
    for (const mesh of layer.pickables) {
      for (let i = 0; i < mesh.count; i++) {
        const site = layer.resolve({ object: mesh, instanceId: i })!;
        const lot = lots[site.lotIndex];
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(i, matrix);
        const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        expect(bounds.min.y).toBeCloseTo(2, 5);
        // Walls fill the lot; only eaves, verges, steps and balconies may overhang it.
        const xs = lot.polygon.map(p => p[0]);
        const zs = lot.polygon.map(p => -p[1]);
        expect(bounds.min.x).toBeGreaterThan(Math.min(...xs) - 1.8);
        expect(bounds.max.x).toBeLessThan(Math.max(...xs) + 1.8);
        expect(bounds.min.z).toBeGreaterThan(Math.min(...zs) - 1.8);
        expect(bounds.max.z).toBeLessThan(Math.max(...zs) + 1.8);
        const eave = lot.massing!.eaveHeightMeters;
        expect(bounds.max.y - 2).toBeGreaterThan(eave + 2);
      }
    }
    layer.dispose();
  }
  const legacy = buildingAppearancePreview("legacy");
  const layer = createTownRegionalHouses(legacy, cache);
  expect(layer.replaced.size).toBe(0);
  layer.dispose();
  expect(cache.size).toBe(0);
});

it("uses measured dimensions, floor heights, coverings and ground-floor use without stretching the BV model", () => {
  const lot = buildingAppearancePreview("northern-wooded")[0];
  lot.polygon = [
    [-3, -6],
    [3, -6],
    [3, 6],
    [-3, 6]
  ];
  lot.massing!.jettyMeters = 0;
  lot.massing!.storeys = 3;
  lot.massing!.floors = [
    { level: 0, use: "retail", heightMeters: 3.5 },
    { level: 1, use: "residential", heightMeters: 2.8 },
    { level: 2, use: "residential", heightMeters: 3.0 }
  ];
  lot.massing!.eaveHeightMeters = 9.3;
  lot.massing!.baseElevationMeters = 1;
  lot.massing!.roof.pitchDeg = 28;
  const cache = createBvPrototypeCache();
  for (const material of ["turf", "shingle", "slate", "lead", "thatch", "tile"] as const) {
    lot.massing!.roof.material = material;
    const site = regionalHouseSite(lot, 7, 12, "high")!;
    const scale = new THREE.Vector3().setFromMatrixScale(site.matrix);
    expect(scale.toArray()).toEqual([1, 1, 1]);
    const prototype = cache.acquire(site.definition)!;
    // The main ridge/eave intersection remains at the measured slope, with no pitch quantization.
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 30, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(new THREE.Mesh(prototype.geometry, prototype.material))[0];
    expect(hit).toBeDefined();
    if (material === "lead")
      expect(Math.abs(hit.face!.normal.x / hit.face!.normal.y)).toBeCloseTo(Math.tan((28 * Math.PI) / 180), 1);
    const bounds = prototype.bounds.clone().applyMatrix4(site.matrix);
    expect(bounds.min.y).toBeCloseTo(13);
    expect(bounds.max.y).toBeGreaterThan(13 + 9.3);
    expect(bounds.max.x - bounds.min.x).toBeLessThan(6.6);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(12.6);
    // Different coverings and uses must never reuse a stale prototype.
    lot.massing!.floors[0].use = "craft";
    expect(regionalHouseSite(lot, 7, 12, "high")!.definition).not.toBe(site.definition);
    lot.massing!.floors[0].use = "retail";
    prototype.release();
  }
  expect(cache.size).toBe(0);
});

it("replaces trapezoids and non-earthen flat roofs but keeps unsupported premises and floors in CE massing", () => {
  const lot = buildingAppearancePreview("atlantic")[0];
  for (const role of ["stable", "shed"] as const) {
    expect(regionalHouseSite({ ...lot, role }, 0)).toBeUndefined();
  }
  // The polygon model follows the walls instead of filling the bounding-box corners.
  expect(
    regionalHouseSite(
      {
        ...lot,
        polygon: [
          [-2.5, -4],
          [2.5, -4],
          [2, 4],
          [-2, 4]
        ]
      },
      0
    )
  ).toMatchObject({ definition: { id: expect.stringMatching(/^polygon-house:/) } });
  expect(regionalHouseSite({ ...lot, massing: { ...lot.massing!, storeys: 6 } }, 0)).toBeUndefined();
  expect(regionalHouseSite({ ...lot, massing: { ...lot.massing!, eaveHeightMeters: 20 } }, 0)).toBeUndefined();
  expect(
    regionalHouseSite({ ...lot, massing: { ...lot.massing!, roof: { ...lot.massing!.roof, form: "flat" } } }, 0)
  ).toMatchObject({ definition: { id: expect.stringMatching(/^polygon-house:/) } });
});

it.each([0, 0.61])(
  "places actual doors on either gable or eave street facade, with ridge angle %s unchanged",
  angle => {
    for (const [kind, flip] of [
      ["gable", false],
      ["gable", true],
      ["eave", false],
      ["eave", true]
    ] as const) {
      const lot = buildingAppearancePreview("northern-urban")[0];
      const centre = [70, -40];
      const r = [Math.cos(angle), Math.sin(angle)],
        p = [-Math.sin(angle), Math.cos(angle)];
      lot.polygon = [
        [-2.5, -4],
        [2.5, -4],
        [2.5, 4],
        [-2.5, 4]
      ].map(([x, y]) => [centre[0] + p[0] * x + r[0] * y, centre[1] + p[1] * x + r[1] * y]);
      lot.massing!.roof.ridgeAzimuth = angle;
      lot.massing!.floors[0].use = "retail";
      const normal = (kind === "gable" ? r : p).map(v => v * (flip ? -1 : 1));
      const tangent = [-normal[1], normal[0]];
      const reach = (kind === "gable" ? 4 : 2.5) + 3;
      const road = [-20, 20].map(
        t =>
          [centre[0] + normal[0] * reach + tangent[0] * t, centre[1] + normal[1] * reach + tangent[1] * t] as [
            number,
            number
          ]
      );
      const resolve = createBuildingFrontageResolver([{ centerline: road, widthMeters: 2 }], [lot]);
      const site = regionalHouseSite(lot, 0, 12, "high", resolve)!;
      expect(site.frontage).toMatchObject({ kind, flip, source: "street" });
      expect(site.frontage.normal[0]).toBeCloseTo(normal[0]);
      expect(site.frontage.normal[1]).toBeCloseTo(normal[1]);
      const ridge = new THREE.Vector3(0, 0, 1).transformDirection(site.matrix);
      expect(Math.abs(ridge.x * r[0] - ridge.z * r[1])).toBeCloseTo(1);
      const prototype = createBvPrototypeCache().acquire(site.definition)!;
      const mesh = new THREE.Mesh(prototype.geometry, prototype.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(site.matrix);
      mesh.updateMatrixWorld(true);
      const door = site.frontage.door;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(
          door[0] + normal[0] * 0.6 + tangent[0] * 0.12,
          13.2,
          -door[1] - normal[1] * 0.6 - tangent[1] * 0.12
        ),
        new THREE.Vector3(-normal[0], 0, normal[1])
      );
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      const color = prototype.geometry.getAttribute("color");
      const expected = new THREE.Color("#5A3B26");
      expect(color.getX(hit.face!.a)).toBeCloseTo(expected.r);
      expect(color.getY(hit.face!.a)).toBeCloseTo(expected.g);
      expect(color.getZ(hit.face!.a)).toBeCloseTo(expected.b);
      prototype.release();
    }
  }
);

it("keeps a stable local facade when no usable street is known, independent of town-centre position", () => {
  const lot = buildingAppearancePreview("atlantic")[0];
  const first = regionalHouseSite(lot, 0)!;
  const translated = { ...lot, polygon: lot.polygon.map(([x, y]) => [x + 200, y - 200] as [number, number]) };
  const second = regionalHouseSite(translated, 0)!;
  expect(first.frontage.source).toBe("unknown");
  expect(second.frontage.source).toBe("unknown");
  expect(first.frontage.flip).toBe(second.frontage.flip);
  expect(first.definition).toBe(second.definition);
});

it("puts a polygon house door on its selected street wall without rotating the footprint", () => {
  const lot = buildingAppearancePreview("atlantic")[0];
  lot.polygon = [
    [-2.5, -4],
    [2.5, -4],
    [2, 4],
    [-2, 4]
  ];
  lot.massing!.jettyMeters = 0;
  const resolver = createBuildingFrontageResolver(
    [
      {
        centerline: [
          [-10, -7],
          [10, -7]
        ],
        widthMeters: 2
      }
    ],
    [lot]
  );
  const site = regionalHouseSite(lot, 0, 12, "high", resolver)!;
  expect(site.frontage).toMatchObject({ source: "street", door: [0, -4], normal: [0, -1] });
  const cache = createBvPrototypeCache();
  const prototype = cache.acquire(site.definition)!;
  const mesh = new THREE.Mesh(prototype.geometry, prototype.material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(site.matrix);
  mesh.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(0.02, 13, 5), new THREE.Vector3(0, 0, -1)).intersectObject(
    mesh
  )[0]!;
  expect(hit).toBeDefined();
  expect(prototype.geometry.getAttribute("color").getX(hit.face!.a)).toBeCloseTo(new THREE.Color("#5A3B26").r);
  prototype.release();
  expect(cache.size).toBe(0);
});

it("renders the selected white wall finish in both massing and detailed Mediterranean houses", () => {
  const document = withBuildingAppearance(
    { ...createDocument("white-walls", 400), buildingWallFinish: "limewash" },
    "mediterranean"
  );
  const lot = assignBuildingAppearances(document, buildingAppearancePreview("mediterranean"))[0];
  const expected = new THREE.Color(buildingAppearanceColors(lot.appearance)!.wall);
  const massing = createCityMassing([lot]);
  const wall = massing.pickables.find(mesh => mesh.userData.surface === "wall")!.geometry.getAttribute("color");
  expect(wall.getX(0)).toBeCloseTo(expected.r, 6);
  expect(wall.getY(0)).toBeCloseTo(expected.g, 6);
  expect(wall.getZ(0)).toBeCloseTo(expected.b, 6);
  const cache = createBvPrototypeCache();
  const site = regionalHouseSite(lot, 0, 0, "high")!;
  const prototype = cache.acquire(site.definition)!;
  const colors = prototype.geometry.getAttribute("color");
  let whiteVertices = 0;
  for (let i = 0; i < colors.count; i++) {
    if (
      Math.abs(colors.getX(i) - expected.r) < 1e-6 &&
      Math.abs(colors.getY(i) - expected.g) < 1e-6 &&
      Math.abs(colors.getZ(i) - expected.b) < 1e-6
    )
      whiteVertices++;
  }
  expect(whiteVertices).toBeGreaterThan(0);
  prototype.release();
  massing.dispose();
  expect(cache.size).toBe(0);
});
