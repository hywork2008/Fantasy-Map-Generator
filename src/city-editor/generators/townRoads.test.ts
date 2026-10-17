import { describe, expect, it } from "vitest";
import type { BurgCivilization } from "../../data/civilizationTraditions";
import type { UrbanMorphologyProfile } from "../../types/urbanMorphology";
import type { RoadRibbon } from "../../utils/roadSurface";
import type { CityDocument, EdgeFeatureGroup, Mesh, Point } from "../types/document";
import type { GenerationSettings } from "../types/generationSettings";
import { collectTownRoads, townRoadStamp } from "./townRoads";

function document(partial: Partial<CityDocument> = {}): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 4,
    frame: { extentMeters: 400, cityRadiusMeters: 160, blockSizeMeters: 40 },
    featureGroups: [],
    gates: [],
    elements: [],
    mesh: { vertices: {}, edges: {}, faces: {} },
    ...partial
  } as CityDocument;
}

function vertex(mesh: Mesh, id: string, x: number, y: number): void {
  mesh.vertices[id] = { id, point: [x, y], locked: false };
}

function edge(mesh: Mesh, id: string, a: string, b: string, leftFace: string | null, rightFace: string | null): void {
  mesh.edges[id] = { id, a, b, leftFace, rightFace, locked: false };
}

function landFace(
  mesh: Mesh,
  id: string,
  boundary: { edgeId: string; forward: boolean }[],
  settlement?: "core" | "outskirts"
): void {
  mesh.faces[id] = {
    id,
    boundary,
    properties: {
      elevation: 1,
      water: "land",
      ward: null,
      buildable: true,
      locked: false,
      ...(settlement ? { settlement } : {})
    }
  };
}

function squareWall(mesh: Mesh, size: number): EdgeFeatureGroup {
  vertex(mesh, "w0", -size, -size);
  vertex(mesh, "w1", size, -size);
  vertex(mesh, "w2", size, size);
  vertex(mesh, "w3", -size, size);
  edge(mesh, "we0", "w0", "w1", null, null);
  edge(mesh, "we1", "w1", "w2", null, null);
  edge(mesh, "we2", "w2", "w3", null, null);
  edge(mesh, "we3", "w3", "w0", null, null);
  return {
    id: "wall",
    kind: "wall",
    name: "wall",
    segments: [
      { edgeId: "we0", forward: true },
      { edgeId: "we1", forward: true },
      { edgeId: "we2", forward: true },
      { edgeId: "we3", forward: true }
    ],
    style: { widthMeters: 2, color: "#222" },
    locked: false
  };
}

function road(
  mesh: Mesh,
  id: string,
  a: Point,
  b: Point,
  widthMeters: number,
  sourceRoad?: { index: number; routeId: number }
): EdgeFeatureGroup {
  vertex(mesh, `${id}a`, a[0], a[1]);
  vertex(mesh, `${id}b`, b[0], b[1]);
  edge(mesh, `${id}e`, `${id}a`, `${id}b`, null, null);
  return {
    id,
    kind: "road",
    name: id,
    segments: [{ edgeId: `${id}e`, forward: true }],
    style: { widthMeters, color: "#d5cfbf" },
    locked: false,
    ...(sourceRoad ? { sourceRoad } : {})
  };
}

function romanRich(period: CityDocument["historicalPeriod"]): Partial<CityDocument> {
  return {
    historicalPeriod: period,
    urbanMorphology: { baselinePopulation: 50000 } as UrbanMorphologyProfile,
    civilization: {
      tradition: "roman",
      period: "classicalAntiquity",
      faith: "latinCatholic",
      cultureFaith: "latinCatholic",
      fortification: "classical",
      culture: { id: 1, name: "Roman", nameBase: 1 }
    } as BurgCivilization
  };
}

function hasPoint(ribbon: RoadRibbon, x: number, y: number, tolerance = 0.2): boolean {
  const line = ribbon.centerline;
  for (let i = 0; i < line.length; i++) {
    if (Math.hypot(line[i][0] - x, line[i][1] - y) <= tolerance) return true;
    const next = line[i + 1];
    if (!next) continue;
    const dx = next[0] - line[i][0];
    const dy = next[1] - line[i][1];
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-12) continue;
    const t = Math.min(1, Math.max(0, ((x - line[i][0]) * dx + (y - line[i][1]) * dy) / length2));
    if (Math.hypot(line[i][0] + t * dx - x, line[i][1] + t * dy - y) <= tolerance) return true;
  }
  return false;
}

function descriptor(roads: { routeId: number; group: string }[]): CityDocument["fabric"] {
  return {
    version: 4,
    seed: "s",
    districts: [],
    generation: {
      algorithm: "skeleton-city-v1",
      seed: "s",
      settings: { descriptor: { roads } } as GenerationSettings,
      input: {} as Omit<CityDocument, "fabric">
    }
  };
}

describe("collectTownRoads", () => {
  it("takes no surface override", () => {
    expect(collectTownRoads.length).toBe(2);
  });

  it("keeps gravel outside a Roman wall, setts inside, and flags in front of the plaza", () => {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    const wall = squareWall(mesh, 100);
    const street = road(mesh, "street", [-150, 0], [150, 0], 5);
    const city = document({
      ...romanRich("classicalAntiquity"),
      mesh,
      featureGroups: [wall, street],
      elements: [{ id: "plaza", kind: "plaza", faceIds: [], point: [0, 0], locked: false }]
    });
    const ribbons = collectTownRoads(city, []);
    const gravel = ribbons.filter(ribbon => ribbon.surface === "gravel");
    const setts = ribbons.filter(ribbon => ribbon.surface === "setts");
    const flags = ribbons.filter(ribbon => ribbon.surface === "flags");
    expect(gravel.some(ribbon => hasPoint(ribbon, -150, 0) && hasPoint(ribbon, -100, 0))).toBe(true);
    expect(setts.some(ribbon => hasPoint(ribbon, -100, 0) && hasPoint(ribbon, -70, 0))).toBe(true);
    expect(setts.some(ribbon => hasPoint(ribbon, 0, 0))).toBe(false);
    expect(flags.some(ribbon => hasPoint(ribbon, 0, 0))).toBe(true);
    expect(flags.some(ribbon => hasPoint(ribbon, -70, 0))).toBe(false);
  });

  it("leaves a highway gravel where it passes within 40 m of the plaza", () => {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    const city = document({
      ...romanRich("classicalAntiquity"),
      mesh,
      featureGroups: [squareWall(mesh, 15), road(mesh, "street", [-150, 0], [150, 0], 5)],
      elements: [{ id: "plaza", kind: "plaza", faceIds: [], point: [0, 0], locked: false }]
    });
    const ribbons = collectTownRoads(city, []);
    const highway = ribbons.find(ribbon => hasPoint(ribbon, 15, 0) && hasPoint(ribbon, 150, 0));
    expect(highway?.surface).toBe("gravel");
  });

  it("classifies a shared core edge by its faces and a faceless temple by its centroid", () => {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    vertex(mesh, "w00", 0, 0);
    vertex(mesh, "w10", 10, 0);
    vertex(mesh, "w11", 10, 120);
    vertex(mesh, "w01", 0, 120);
    vertex(mesh, "e10", 20, 0);
    vertex(mesh, "e11", 20, 120);
    edge(mesh, "bottomW", "w00", "w10", "west", null);
    edge(mesh, "shared", "w10", "w11", "west", "east");
    edge(mesh, "topW", "w11", "w01", "west", null);
    edge(mesh, "leftW", "w01", "w00", "west", null);
    edge(mesh, "bottomE", "w10", "e10", "east", null);
    edge(mesh, "rightE", "e10", "e11", "east", null);
    edge(mesh, "topE", "e11", "w11", "east", null);
    landFace(
      mesh,
      "west",
      [
        { edgeId: "bottomW", forward: true },
        { edgeId: "shared", forward: true },
        { edgeId: "topW", forward: true },
        { edgeId: "leftW", forward: true }
      ],
      "core"
    );
    landFace(
      mesh,
      "east",
      [
        { edgeId: "bottomE", forward: true },
        { edgeId: "rightE", forward: true },
        { edgeId: "topE", forward: true },
        { edgeId: "shared", forward: false }
      ],
      "core"
    );
    vertex(mesh, "t0", 8, 28);
    vertex(mesh, "t1", 12, 28);
    vertex(mesh, "t2", 12, 32);
    vertex(mesh, "t3", 8, 32);
    edge(mesh, "te0", "t0", "t1", "temple", null);
    edge(mesh, "te1", "t1", "t2", "temple", null);
    edge(mesh, "te2", "t2", "t3", "temple", null);
    edge(mesh, "te3", "t3", "t0", "temple", null);
    landFace(
      mesh,
      "temple",
      [
        { edgeId: "te0", forward: true },
        { edgeId: "te1", forward: true },
        { edgeId: "te2", forward: true },
        { edgeId: "te3", forward: true }
      ],
      "outskirts"
    );
    vertex(mesh, "h0", 10, -40);
    vertex(mesh, "h1", 10, -5);
    edge(mesh, "he", "h0", "h1", null, null);
    vertex(mesh, "o0", 40, 0);
    vertex(mesh, "o1", 50, 0);
    vertex(mesh, "o2", 50, 10);
    vertex(mesh, "o3", 40, 10);
    edge(mesh, "oe0", "o0", "o1", "out", null);
    edge(mesh, "oe1", "o1", "o2", "out", null);
    edge(mesh, "oe2", "o2", "o3", "out", null);
    edge(mesh, "oe3", "o3", "o0", "out", null);
    landFace(
      mesh,
      "out",
      [
        { edgeId: "oe0", forward: true },
        { edgeId: "oe1", forward: true },
        { edgeId: "oe2", forward: true },
        { edgeId: "oe3", forward: true }
      ],
      "outskirts"
    );
    const city = document({
      ...romanRich("classicalAntiquity"),
      mesh,
      featureGroups: [
        {
          id: "spine",
          kind: "road",
          name: "spine",
          segments: [{ edgeId: "shared", forward: true }],
          style: { widthMeters: 6, color: "#d5cfbf" },
          locked: false
        },
        {
          id: "approach",
          kind: "road",
          name: "approach",
          segments: [{ edgeId: "he", forward: true }],
          style: { widthMeters: 6, color: "#d5cfbf" },
          locked: false
        }
      ],
      elements: [{ id: "temple", kind: "temple", faceIds: ["temple"], locked: false }]
    });
    const ribbons = collectTownRoads(city, [
      {
        faceId: "west",
        points: [
          [2, 100],
          [2, 110]
        ],
        widthMeters: 3
      },
      {
        faceId: "out",
        points: [
          [42, 2],
          [42, 8]
        ],
        widthMeters: 3
      }
    ]);
    expect(ribbons.some(ribbon => ribbon.surface === "flags" && hasPoint(ribbon, 10, 60))).toBe(true);
    expect(
      ribbons.some(ribbon => ribbon.surface === "setts" && hasPoint(ribbon, 10, 100) && ribbon.widthMeters === 6)
    ).toBe(true);
    expect(ribbons.some(ribbon => ribbon.surface === "gravel" && hasPoint(ribbon, 10, 60))).toBe(false);
    const stub = ribbons.find(ribbon => hasPoint(ribbon, 10, -40) && hasPoint(ribbon, 10, -5));
    expect(stub?.surface).toBe("gravel");
    expect(ribbons.some(ribbon => ribbon.surface === "flags" && hasPoint(ribbon, 10, -5))).toBe(false);
    expect(ribbons.some(ribbon => ribbon.surface === "setts" && ribbon.widthMeters === 3)).toBe(true);
    expect(ribbons.some(ribbon => ribbon.surface === "track" && Math.abs(ribbon.widthMeters - 1.95) < 1e-6)).toBe(true);
  });

  it("keeps a matching trail, and a mismatched route id, as track inside a rich wall", () => {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    const wall = squareWall(mesh, 100);
    const matched = document({
      historicalPeriod: "lateMedieval",
      urbanMorphology: { baselinePopulation: 12000 } as UrbanMorphologyProfile,
      civilization: {
        tradition: "gallic",
        period: "lateMedieval",
        faith: "latinCatholic",
        cultureFaith: "latinCatholic",
        fortification: "european",
        culture: { id: 2, name: "Gallic", nameBase: 2 }
      } as BurgCivilization,
      fabric: descriptor([{ routeId: 7, group: "trails" }]),
      mesh,
      featureGroups: [wall, road(mesh, "leg", [-20, 0], [20, 0], 5, { index: 0, routeId: 7 })]
    });
    expect(collectTownRoads(matched, []).every(ribbon => ribbon.surface === "track")).toBe(true);

    const mismatched = document({
      ...matched,
      mesh: { vertices: {}, edges: {}, faces: {} },
      featureGroups: []
    });
    const again = mismatched.mesh;
    mismatched.featureGroups = [
      squareWall(again, 100),
      road(again, "leg", [-20, 0], [20, 0], 5, { index: 0, routeId: 99 })
    ];
    mismatched.fabric = descriptor([{ routeId: 7, group: "roads" }]);
    const ribbons = collectTownRoads(mismatched, []);
    expect(ribbons.length).toBeGreaterThan(0);
    expect(ribbons.every(ribbon => ribbon.surface === "track")).toBe(true);
    expect(ribbons.some(ribbon => ribbon.surface === "setts")).toBe(false);
  });

  it("drops a generated bridge span and keeps the dry pieces of an approach", () => {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    const bridge = road(mesh, "gc:bridge-1", [0, 0], [30, 0], 4);
    expect(collectTownRoads(document({ mesh, featureGroups: [bridge] }), [])).toEqual([]);

    const approachMesh = { vertices: {}, edges: {}, faces: {} };
    const approach = road(approachMesh, "gc:bridgeApproach-1", [-20, 0], [20, 0], 4);
    const wet = document({
      mesh: approachMesh,
      featureGroups: [approach],
      waterAreas: [
        {
          kind: "river",
          polygon: [
            [-3, -4],
            [3, -4],
            [3, 4],
            [-3, 4]
          ]
        }
      ]
    });
    const ribbons = collectTownRoads(wet, []);
    expect(ribbons.length).toBeGreaterThan(0);
    expect(
      ribbons.some(
        ribbon => ribbon.centerline.some(point => point[0] < -3) && ribbon.centerline.some(point => point[0] > 3)
      )
    ).toBe(false);
    expect(ribbons.some(ribbon => ribbon.centerline.some(point => point[0] <= -3))).toBe(true);
    expect(ribbons.some(ribbon => ribbon.centerline.some(point => point[0] >= 3))).toBe(true);
  });

  it("draws dry frame roads and river approaches, and omits bridge decks and banks", () => {
    const city = document({
      ...romanRich("classicalAntiquity"),
      fabric: descriptor([{ routeId: 3, group: "roads" }]),
      frameRoads: [
        {
          sourceIndex: 0,
          routeId: 3,
          pieces: [
            {
              kind: "bridge",
              points: [
                [500, 500],
                [520, 500]
              ]
            },
            {
              kind: "road",
              points: [
                [300, 10],
                [380, 10]
              ]
            }
          ]
        }
      ],
      riverConnections: [
        {
          sourceIndex: 0,
          townRoad: [
            [-80, 40],
            [-80, 90]
          ],
          farRoad: [
            [-80, -90],
            [-80, -40]
          ],
          banks: [
            [999, 999],
            [998, 998]
          ],
          crossing: {
            kind: "fixedBridge",
            widthMeters: 4,
            depthMeters: 2,
            navigationRequired: false,
            clearanceMeters: 4,
            openingMeters: 4,
            reason: "fixedClearance"
          }
        }
      ]
    });
    const ribbons = collectTownRoads(city, []);
    const dumped = JSON.stringify(ribbons);
    expect(dumped).not.toContain("500");
    expect(dumped).not.toContain("999");
    expect(dumped).not.toContain("998");
    const frame = ribbons.find(ribbon => hasPoint(ribbon, 300, 10) && hasPoint(ribbon, 380, 10));
    const town = ribbons.find(ribbon => hasPoint(ribbon, -80, 40) && hasPoint(ribbon, -80, 90));
    const far = ribbons.find(ribbon => hasPoint(ribbon, -80, -90) && hasPoint(ribbon, -80, -40));
    expect(frame?.surface).toBe("gravel");
    expect(frame?.widthMeters).toBe(3.5);
    expect(town?.surface).toBe("gravel");
    expect(town?.widthMeters).toBe(3.5);
    expect(far?.widthMeters).toBe(3.5);
  });

  it("reads the town biome for an off-mesh local highway", () => {
    const highway = (key: string, tradition: string | null): RoadRibbon[] => {
      const mesh = { vertices: {}, edges: {}, faces: {} };
      return collectTownRoads(
        document({
          historicalPeriod: tradition === "andean" ? "ageOfExploration" : "ageOfExploration",
          biome: { id: 1, name: key, color: "#333", key },
          ...(tradition
            ? {
                civilization: {
                  tradition,
                  period: "ageOfExploration",
                  faith: "latinCatholic",
                  cultureFaith: "latinCatholic",
                  fortification: tradition === "japanese" ? "japanese" : "earthwork",
                  culture: { id: 1, name: tradition, nameBase: 1 }
                } as BurgCivilization
              }
            : {}),
          mesh,
          featureGroups: [road(mesh, "lane", [200, 0], [260, 0], 4)]
        }),
        []
      );
    };
    expect(highway("montaneForest", "japanese").every(ribbon => ribbon.surface === "setts")).toBe(true);
    expect(highway("temperateDeciduousForest", "japanese").every(ribbon => ribbon.surface === "earth")).toBe(true);
    expect(highway("hotDesert", "andean").every(ribbon => ribbon.surface === "earth")).toBe(true);
    expect(highway("montaneForest", "andean").every(ribbon => ribbon.surface === "setts")).toBe(true);
  });

  it("keeps a rich town with no civilization on earth", () => {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    const city = document({
      historicalPeriod: "lateMedieval",
      urbanMorphology: { baselinePopulation: 30000 } as UrbanMorphologyProfile,
      mesh,
      featureGroups: [squareWall(mesh, 100), road(mesh, "street", [-50, 0], [50, 0], 5)],
      elements: [{ id: "plaza", kind: "plaza", faceIds: [], point: [0, 0], locked: false }]
    });
    const ribbons = collectTownRoads(city, []);
    expect(ribbons.length).toBeGreaterThan(0);
    expect(ribbons.every(ribbon => ribbon.surface === "earth")).toBe(true);
  });
});

describe("townRoadStamp", () => {
  function town(origin: Point, patch: Partial<CityDocument> = {}): CityDocument {
    const mesh = { vertices: {}, edges: {}, faces: {} };
    const street = road(mesh, "street", origin, [10, 0], 4, { index: 0, routeId: 1 });
    return document({ mesh, featureGroups: [street], ...patch });
  }

  it("changes when a vertex moves by 2 m and not when the move stays inside 1 m", () => {
    const before = town([0, 0]);
    const across = town([2, 0]);
    const inside = town([0.4, 0]);
    expect(before.featureGroups[0]).toMatchObject({ segments: [{ edgeId: "streete", forward: true }] });
    expect(across.featureGroups[0]).toMatchObject({ segments: [{ edgeId: "streete", forward: true }] });
    expect(townRoadStamp(before, [])).not.toBe(townRoadStamp(across, []));
    expect(townRoadStamp(before, [])).toBe(townRoadStamp(inside, []));
  });

  it("changes when a river, moat, wall, width, or route id changes and the road does not", () => {
    const base = town([0, 0]);
    const riverMesh = { vertices: {}, edges: {}, faces: {} };
    const street = road(riverMesh, "street", [0, 0], [10, 0], 4, { index: 0, routeId: 1 });
    vertex(riverMesh, "r0", 0, 30);
    vertex(riverMesh, "r1", 20, 30);
    const withRiver = document({
      mesh: riverMesh,
      featureGroups: [
        street,
        {
          id: "river",
          kind: "river",
          name: "river",
          vertices: ["r0", "r1"],
          source: null,
          mouth: null,
          style: { widthMeters: 8, color: "#527f8b" },
          locked: false
        }
      ]
    });
    const beforeRiver = townRoadStamp(withRiver, []);
    riverMesh.vertices.r0 = { id: "r0", point: [0, 32], locked: false };
    expect(beforeRiver).not.toBe(townRoadStamp(withRiver, []));
    expect(withRiver.featureGroups[0].kind === "road" && withRiver.featureGroups[0].segments).toHaveLength(1);

    const moat = (widthMeters: number) =>
      town([0, 0], {
        defenseCircuits: [
          {
            id: "moat",
            scope: "town",
            areaFaceIds: [],
            wallGroupIds: [],
            naturalBarriers: [],
            locked: false,
            moat: { enabled: true, widthMeters }
          }
        ]
      });
    expect(townRoadStamp(moat(4), [])).not.toBe(townRoadStamp(moat(6), []));

    const walled = (y: number) => {
      const mesh = { vertices: {}, edges: {}, faces: {} };
      const streetGroup = road(mesh, "street", [0, 0], [10, 0], 4, { index: 0, routeId: 1 });
      vertex(mesh, "wa", -20, y);
      vertex(mesh, "wb", 20, y);
      edge(mesh, "walle", "wa", "wb", null, null);
      return document({
        mesh,
        featureGroups: [
          streetGroup,
          {
            id: "curtain",
            kind: "wall",
            name: "curtain",
            segments: [{ edgeId: "walle", forward: true }],
            style: { widthMeters: 2, color: "#222" },
            locked: false
          }
        ]
      });
    };
    expect(townRoadStamp(walled(40), [])).not.toBe(townRoadStamp(walled(42), []));

    const wide = town([0, 0]);
    (wide.featureGroups[0] as EdgeFeatureGroup).style = { widthMeters: 6, color: "#d5cfbf" };
    expect(townRoadStamp(base, [])).not.toBe(townRoadStamp(wide, []));

    const retargeted = town([0, 0]);
    (retargeted.featureGroups[0] as EdgeFeatureGroup).sourceRoad = { index: 0, routeId: 9 };
    expect(townRoadStamp(base, [])).not.toBe(townRoadStamp(retargeted, []));
    expect(base.featureGroups[0].kind === "road" && base.featureGroups[0].segments).toHaveLength(1);
    expect(retargeted.featureGroups[0].kind === "road" && retargeted.featureGroups[0].segments).toHaveLength(1);
  });
});
