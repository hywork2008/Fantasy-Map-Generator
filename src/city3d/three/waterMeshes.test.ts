import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityDocument, Mesh, Point, WaterKind } from "../../city-editor/types/document";
import { LAND_Y } from "../core/waterGeometry";
import { createTownFarms } from "./farmMeshes";
import { roadStampChanged } from "./roadMeshes";
import { createTownWater, planCity3dRefresh, townWaterHeightAt, waterStampChanged } from "./waterMeshes";

function document(partial: Partial<CityDocument> & Pick<CityDocument, "mesh">): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 4,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 40 },
    featureGroups: [],
    gates: [],
    elements: [],
    ...partial
  } as CityDocument;
}

function emptyMesh(): Mesh {
  return { vertices: {}, edges: {}, faces: {} };
}

function addRect(mesh: Mesh, id: string, x0: number, y0: number, x1: number, y1: number, water: WaterKind): void {
  addPolygon(
    mesh,
    id,
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1]
    ],
    water
  );
}

function addPolygon(mesh: Mesh, id: string, points: Point[], water: WaterKind): void {
  const ids = points.map((_, index) => `${id}v${index}`);
  ids.forEach((vertexId, index) => {
    mesh.vertices[vertexId] = { id: vertexId, point: points[index], locked: false };
  });
  const edgeIds = points.map((_, index) => `${id}e${index}`);
  edgeIds.forEach((edgeId, index) => {
    mesh.edges[edgeId] = {
      id: edgeId,
      a: ids[index],
      b: ids[(index + 1) % ids.length],
      leftFace: id,
      rightFace: null,
      locked: false
    };
  });
  mesh.faces[id] = {
    id,
    boundary: edgeIds.map(edgeId => ({ edgeId, forward: true })),
    properties: { elevation: water === "land" ? 1 : 0, water, ward: null, buildable: water === "land", locked: false }
  };
}

function colorOf(mesh: THREE.Mesh): number {
  return (mesh.material as THREE.MeshLambertMaterial).color.getHex();
}

function sideOf(mesh: THREE.Mesh): THREE.Side {
  return (mesh.material as THREE.MeshLambertMaterial).side;
}

describe("planCity3dRefresh", () => {
  it("builds nothing while the view is closed", () => {
    expect(planCity3dRefresh({ fabricChanged: true, stampChanged: true, roadStampChanged: true, open: false })).toEqual(
      {
        buildings: false,
        water: false,
        roads: false
      }
    );
  });

  it("rebuilds water only when the caller reports a stamp change", () => {
    expect(
      planCity3dRefresh({ fabricChanged: false, stampChanged: true, roadStampChanged: false, open: true })
    ).toEqual({
      buildings: false,
      water: true,
      roads: false
    });
  });

  it("rebuilds water when the parent is absent even if the stamp string matches", () => {
    const stamp = "same";
    expect(waterStampChanged(stamp, stamp, false)).toBe(true);
    expect(
      planCity3dRefresh({
        fabricChanged: false,
        stampChanged: waterStampChanged(stamp, stamp, false),
        roadStampChanged: false,
        open: true
      })
    ).toEqual({ buildings: false, water: true, roads: false });
  });

  it("does not rebuild when the stamp matches and the parent is present", () => {
    const stamp = "same";
    expect(waterStampChanged(stamp, stamp, true)).toBe(false);
    expect(
      planCity3dRefresh({ fabricChanged: false, stampChanged: false, roadStampChanged: false, open: true })
    ).toEqual({
      buildings: false,
      water: false,
      roads: false
    });
  });

  it("does not treat missing water children or a cleared building cache as a water rebuild", () => {
    expect(waterStampChanged("same", "same", true)).toBe(false);
    expect(
      planCity3dRefresh({ fabricChanged: true, stampChanged: false, roadStampChanged: false, open: true })
    ).toEqual({
      buildings: true,
      water: false,
      roads: false
    });
  });

  it("rebuilds roads only from the road stamp", () => {
    expect(roadStampChanged("same", "same", false)).toBe(true);
    expect(roadStampChanged("same", "same", true)).toBe(false);
    expect(
      planCity3dRefresh({ fabricChanged: false, stampChanged: false, roadStampChanged: true, open: true })
    ).toEqual({
      buildings: false,
      water: false,
      roads: true
    });
  });
});

describe("town water meshes", () => {
  it("leaves the oblique mouth from shared city 1ftwp9z open across its full width", () => {
    const mesh = emptyMesh();
    const tip: Point = [62.68570004058118, 199.17868876752703];
    const shore: Point = [80.6112223401968, 180.92537282517813];
    addPolygon(
      mesh,
      "sea",
      [
        tip,
        shore,
        [104.21636738595961, 237.5091087209978],
        [100.15700084555431, 242.27633932034638],
        [53.870735873164094, 222.936819334696]
      ],
      "sea"
    );
    addPolygon(mesh, "land", [tip, shore, [35, 170]], "land");
    mesh.vertices.up = { id: "up", point: [38.399217032609116, 183.5611342402933], locked: false };
    mesh.vertices.mouth = { id: "mouth", point: tip, locked: false };
    const drawn = createTownWater(
      document({
        mesh,
        featureGroups: [
          {
            id: "river",
            kind: "river",
            name: "River",
            vertices: ["up", "mouth"],
            source: null,
            mouth: null,
            style: { widthMeters: 9.141790033315084, color: "#527f8b" },
            locked: false
          }
        ]
      })
    );
    const raycaster = new THREE.Raycaster(new THREE.Vector3(65.3, 10, -196), new THREE.Vector3(0, -1, 0));
    // Bypass the deliberate no-picking override to inspect actual surface coverage.
    const landHits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(drawn.land!, raycaster, landHits);
    expect(landHits).toHaveLength(0);
    const river = drawn.parent.getObjectByName("ce-water-river") as THREE.Mesh;
    const waterHits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(river, raycaster, waterHits);
    expect(waterHits.length).toBeGreaterThan(0);
    expect(waterHits[0].point.y).toBeLessThan(0);
    // A saved field can predate the river-mouth extension. Its elevated soil
    // must have the same physical opening as the rendered river below it.
    const farms = createTownFarms(
      [
        {
          faceId: "land",
          polygon: [
            [20, 150],
            [120, 150],
            [120, 250],
            [20, 250]
          ],
          rows: []
        }
      ],
      undefined,
      drawn.wetPolygons
    );
    const soil = farms.parent.getObjectByName("ce-field-surfaces") as THREE.Mesh;
    soil.updateMatrixWorld(true);
    const soilHits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(soil, raycaster, soilHits);
    expect(soilHits).toHaveLength(0);
    farms.dispose();
    const bank = drawn.bank!.geometry.getAttribute("position");
    const direction: Point = [tip[0] - 38.399217032609116, tip[1] - 183.5611342402933];
    for (let i = 0; i < bank.count; i += 3) {
      const onOldCap = [0, 1, 2].every(
        j => Math.abs((bank.getX(i + j) - tip[0]) * direction[0] + (-bank.getZ(i + j) - tip[1]) * direction[1]) < 1e-3
      );
      expect(onOldCap).toBe(false);
    }
    drawn.dispose();
  });

  it("does not build a land-height bank across the river's connection to the sea", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 10, 0, 110, 40, "land");
    addRect(mesh, "sea", 10, -20, 110, 0, "sea");
    const drawn = createTownWater(
      document({
        mesh,
        waterAreas: [
          {
            kind: "river",
            polygon: [
              [20, 0],
              [30, 0],
              [30, 30],
              [20, 30]
            ]
          }
        ]
      })
    );
    expect(drawn.parent.getObjectByName("ce-water-ocean")).toBeTruthy();
    expect(drawn.parent.getObjectByName("ce-water-channel")).toBeTruthy();
    const bank = drawn.bank!.geometry.getAttribute("position");
    let shoreTriangles = 0;
    for (let i = 0; i < bank.count; i += 3) {
      if (![0, 1, 2].every(j => Math.abs(bank.getZ(i + j)) < 1e-6)) continue;
      shoreTriangles++;
      const xs = [0, 1, 2].map(j => bank.getX(i + j));
      expect(Math.max(...xs) <= 20 || Math.min(...xs) >= 30).toBe(true);
    }
    expect(shoreTriangles).toBeGreaterThan(0);
    drawn.dispose();
  });

  it("places the sea at zero elevation and rivers and surveyed channels 1 m below land", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", -40, -40, 40, 40, "land");
    mesh.faces.land.properties.elevation = 30;
    addRect(mesh, "sea", 50, 10, 70, 30, "sea");
    // Water depth describes the bed, not the river's drop below the bank.
    mesh.faces.sea.properties.depth = 12;
    mesh.vertices.up = { id: "up", point: [10, 30], locked: false };
    mesh.vertices.down = { id: "down", point: [10, -30], locked: false };
    const drawn = createTownWater(
      document({
        mesh,
        waterAreas: [
          {
            kind: "river",
            polygon: [
              [20, 10],
              [24, 10],
              [24, 30],
              [20, 30]
            ]
          }
        ],
        featureGroups: [
          {
            id: "river",
            kind: "river",
            name: "River",
            vertices: ["up", "down"],
            source: null,
            mouth: null,
            style: { widthMeters: 4, color: "#527f8b" },
            locked: false
          }
        ]
      })
    );
    for (const [kind, expectedY] of [
      ["ocean", LAND_Y - 30],
      ["river", LAND_Y - 1],
      ["channel", LAND_Y - 1]
    ] as const) {
      const water = drawn.parent.getObjectByName(`ce-water-${kind}`) as THREE.Mesh;
      const positions = water.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThan(0);
      for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBeCloseTo(expectedY, 5);
    }
    const bank = drawn.bank!.geometry.getAttribute("position");
    const levels = new Set(Array.from({ length: bank.count }, (_, index) => bank.getY(index)));
    expect([...levels].sort((a, b) => a - b)).toEqual([LAND_Y - 30, LAND_Y - 1, LAND_Y].map(Math.fround));
    drawn.dispose();
  });

  it("keeps an empty water parent for an inland town and does not pick any mesh", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 0, 0, 20, 20, "land");
    const drawn = createTownWater(document({ mesh }));
    expect(drawn.pickables).toEqual([]);
    expect(drawn.replacesDisc).toBe(true);
    expect(drawn.parent.name).toBe("ce-water");
    expect(drawn.parent.children).toEqual([]);
    expect(drawn.land?.name).toBe("ce-land");
    expect(drawn.bank).toBeNull();
    const landY = drawn.land!.geometry.getAttribute("position").getY(0);
    expect(landY).toBeCloseTo(LAND_Y, 5);
    const hits: THREE.Intersection[] = [];
    drawn.land!.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    drawn.dispose();
  });

  it("paints ocean water from above and a double-sided bank, with nothing pickable", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 0, 0, 10, 10, "land");
    addRect(mesh, "sea", 20, 0, 30, 10, "sea");
    const drawn = createTownWater(document({ mesh }));
    const ocean = drawn.parent.getObjectByName("ce-water-ocean") as THREE.Mesh;
    expect(ocean).toBeTruthy();
    expect(drawn.parent.getObjectByName("ce-water-lake")).toBeUndefined();
    expect(colorOf(ocean)).toBe(0x456d7f);
    expect(sideOf(ocean)).toBe(THREE.FrontSide);
    expect(drawn.bank?.name).toBe("ce-bank");
    expect(sideOf(drawn.bank!)).toBe(THREE.DoubleSide);
    expect(drawn.pickables).toEqual([]);
    const hits: THREE.Intersection[] = [];
    ocean.raycast(new THREE.Raycaster(), hits);
    drawn.bank!.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    drawn.dispose();
  });
});

it("samples the rendered sea and inland water surfaces at ship locations", () => {
  const mesh = emptyMesh();
  addRect(mesh, "land", -50, -50, 0, 50, "land");
  mesh.faces.land.properties.elevation = 8;
  addRect(mesh, "sea", 0, -50, 50, 0, "sea");
  addRect(mesh, "lake", 0, 0, 50, 50, "lake");
  const water = createTownWater(document({ mesh }));
  expect(townWaterHeightAt(water, [25, -25])).toBeCloseTo(LAND_Y - 8);
  expect(townWaterHeightAt(water, [25, 25])).toBeCloseTo(LAND_Y - 1);
  water.dispose();
});

it("keeps a river surface level across banks of different cell elevation", () => {
  const mesh = emptyMesh();
  addRect(mesh, "high", -60, -40, 20, 40, "land");
  mesh.faces.high.properties.elevation = 10;
  addRect(mesh, "low", 24, -40, 80, 40, "land");
  mesh.faces.low.properties.elevation = 2;
  mesh.vertices.up = { id: "up", point: [22, 30], locked: false };
  mesh.vertices.down = { id: "down", point: [22, -30], locked: false };
  const drawn = createTownWater(
    document({
      mesh,
      waterAreas: [
        {
          kind: "river",
          polygon: [
            [20, -30],
            [24, -30],
            [24, 30],
            [20, 30]
          ]
        }
      ],
      featureGroups: [
        {
          id: "river",
          kind: "river",
          name: "River",
          vertices: ["up", "down"],
          source: null,
          mouth: null,
          style: { widthMeters: 4, color: "#527f8b" },
          locked: false
        }
      ]
    })
  );
  const water = drawn.parent.getObjectByName("ce-water-channel") as THREE.Mesh;
  const positions = water.geometry.getAttribute("position");
  const ys = Array.from({ length: positions.count }, (_, i) => positions.getY(i));
  // The 8 m step between the banks must not tilt the water.
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.5);
  drawn.dispose();
});

it("sets a river 1 m under its banks, or back at elevation 0 when the drop equals the land", () => {
  const mesh = emptyMesh();
  addRect(mesh, "high", -40, -12, -8, 12, "land");
  mesh.faces.high.properties.elevation = 100;
  addRect(mesh, "low", 8, -12, 40, 12, "land");
  mesh.faces.low.properties.elevation = 40;
  mesh.vertices.up = { id: "up", point: [-24, 0], locked: false };
  mesh.vertices.down = { id: "down", point: [24, 0], locked: false };
  const city = document({
    mesh,
    featureGroups: [
      {
        id: "river",
        kind: "river",
        name: "River",
        vertices: ["up", "down"],
        source: null,
        mouth: null,
        style: { widthMeters: 4, color: "#527f8b" },
        locked: false
      }
    ]
  });
  const shallow = createTownWater(city, undefined, 1);
  // Datum is the low bank, 40 m. Land at 100 m is 60 m above it; the river is 1 m under that land.
  expect(townWaterHeightAt(shallow, [-24, 1])).toBeCloseTo(LAND_Y + 59, 0);
  expect(townWaterHeightAt(shallow, [24, 1])).toBeLessThan(townWaterHeightAt(shallow, [-24, 1]));
  shallow.dispose();
  const deep = createTownWater(city, undefined, 100);
  expect(townWaterHeightAt(deep, [-24, 1])).toBeCloseTo(LAND_Y - 40, 0);
  expect(townWaterHeightAt(deep, [24, 1])).toBeCloseTo(LAND_Y - 40, 0);
  deep.dispose();
});
