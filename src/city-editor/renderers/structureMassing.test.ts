import { describe, expect, it } from "vitest";
import { concatPositions, meshIsClosed } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import type { CityDocument, EdgeFeatureGroup, Point } from "../types/document";
import { collectCityStructures, cutWallOpenings, landmarkLotStructures } from "./structureMassing";
import { renderWallStructure } from "./wallSvg";

function vertex(id: string, point: Point) {
  return { id, point, locked: false };
}

function edge(id: string, a: string, b: string) {
  return { id, a, b, leftFace: null, rightFace: null, locked: false };
}

function wallGroup(id: string, edgeIds: string[], width = 4): EdgeFeatureGroup {
  return {
    id,
    kind: "wall",
    name: "Wall",
    segments: edgeIds.map(edgeId => ({ edgeId, forward: true })),
    style: { widthMeters: width, color: "#342a22" },
    locked: false,
    wallMaterial: "stone"
  };
}

function town(parts: Partial<CityDocument>): CityDocument {
  return {
    appearance: "town",
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 30 },
    mesh: {
      vertices: {
        v1: vertex("v1", [-40, 0]),
        v2: vertex("v2", [0, 0]),
        v3: vertex("v3", [40, 0])
      },
      edges: {
        e1: edge("e1", "v1", "v2"),
        e2: edge("e2", "v2", "v3")
      },
      faces: {}
    },
    featureGroups: [wallGroup("w", ["e1", "e2"])],
    gates: [{ id: "g", vertexId: "v2", locked: false }],
    elements: [{ id: "plz", kind: "plaza", faceIds: [], point: [0, -40], locked: false }],
    ...parts
  } as CityDocument;
}

describe("city structures", () => {
  it.each(["stone", "wood"] as const)(
    "places %s castle parapets outside the precinct even on the side facing the town",
    material => {
      const document = town({});
      document.mesh.vertices.v4 = vertex("v4", [40, 40]);
      document.mesh.vertices.v5 = vertex("v5", [-40, 40]);
      document.mesh.edges.e3 = edge("e3", "v3", "v4");
      document.mesh.edges.e4 = edge("e4", "v4", "v5");
      document.mesh.edges.e5 = edge("e5", "v5", "v1");
      const edgeIds = ["e1", "e2", "e3", "e4", "e5"];
      for (const id of edgeIds) document.mesh.edges[id].leftFace = "castle-face";
      document.mesh.faces["castle-face"] = {
        id: "castle-face",
        edgeIds,
        vertexIds: ["v1", "v2", "v3", "v4", "v5"],
        boundary: edgeIds.map(edgeId => ({ edgeId, forward: true })),
        properties: { elevation: 0, water: "land", ward: "castle", buildable: true, locked: false }
      };
      document.defenseCircuits = [
        {
          id: "gc:defense-castle-0",
          ownerCastleId: "gc:castle-0",
          scope: "castle",
          areaFaceIds: ["castle-face"],
          wallGroupIds: ["w"],
          naturalBarriers: [],
          locked: false
        }
      ];
      const group = document.featureGroups[0] as EdgeFeatureGroup;
      group.wallMaterial = material;
      // The plaza is south of this curtain; the castle interior is north of it.
      for (const reverse of [false, true]) {
        group.segments = reverse
          ? [
              { edgeId: "e2", forward: false },
              { edgeId: "e1", forward: false }
            ]
          : [
              { edgeId: "e1", forward: true },
              { edgeId: "e2", forward: true }
            ];
        const run: Point[] = reverse
          ? [
              [40, 0],
              [0, 0],
              [-40, 0]
            ]
          : [
              [-40, 0],
              [0, 0],
              [40, 0]
            ];
        const svg = renderWallStructure(document, group, run, (name, attrs) => {
          const node = globalThis.document.createElementNS("http://www.w3.org/2000/svg", name);
          for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
          return node;
        });
        const parapet = svg.querySelector(material === "stone" ? ".ce-wall-stone-parapet" : ".ce-wall-wood-logs");
        const coordinates = parapet!
          .getAttribute("d")!
          .match(/-?\d+(?:\.\d+)?/g)!
          .map(Number);
        expect(coordinates.filter((_, i) => i % 2 === 1).every(y => y > 0)).toBe(true);

        // The gate splits this open curtain into two independently rendered runs.
        const walls = collectCityStructures(document).filter(part => part.id.startsWith("wall:w:"));
        expect(walls).toHaveLength(2);
        for (const wall of walls) {
          expect(wall.anchor).toEqual([0, 20]);
          const positions = structureSurfaces(wall)!.roofs.positions;
          const lipZ: number[] = [];
          for (let i = 0; i < positions.length; i += 3) {
            if (positions[i + 1] > wall.heightMeters + 0.1) lipZ.push(positions[i + 2]);
          }
          expect(lipZ.length).toBeGreaterThan(0);
          expect(lipZ.every(z => z > 0)).toBe(true);
        }
      }
    }
  );

  it.each(["walkway", "none"] as const)("keeps artillery curtains below bastions (walkway: %s)", walkway => {
    const document = town({
      gates: [],
      castles: [
        {
          id: "castle",
          version: 1,
          seed: "bastion",
          position: "edge",
          relationship: "integrated",
          form: "keep-bailey",
          castleStyle: "bastion-citadel",
          circuitId: "c",
          parts: [],
          courtyards: [
            [
              [-40, -40],
              [40, -40],
              [40, 40],
              [-40, 40]
            ]
          ]
        }
      ],
      defenseCircuits: [
        {
          id: "c",
          scope: "castle",
          state: "standing",
          areaFaceIds: [],
          wallGroupIds: ["w"],
          naturalBarriers: [],
          locked: false
        }
      ]
    });
    document.featureGroups[0].walkway = walkway;
    const structures = collectCityStructures(document);
    const walls = structures.filter(item => item.id.startsWith("wall:"));
    const bastions = structures.filter(item => item.id.startsWith("tower:castle:"));
    const parapets = structures.filter(item => item.id.startsWith("bastion-parapet:"));
    expect(walls.length).toBeGreaterThan(0);
    expect(bastions.length).toBeGreaterThan(0);
    expect(parapets).toHaveLength(bastions.length);
    for (const parapet of parapets) {
      expect(parapet.baseElevationMeters).toBeCloseTo(4.9);
      expect(parapet.heightMeters).toBeCloseTo(1.1);
      expect(parapet.centerline![0]).not.toEqual(parapet.centerline!.at(-1));
      expect(structureSurfaces(parapet)).not.toBeNull();
    }
    for (const wall of walls) {
      expect(wall.heightMeters + wall.parapetMeters).toBeCloseTo(6);
      for (const bastion of bastions) {
        expect(bastion.heightMeters).toBeCloseTo(4.9);
        if (walkway === "walkway") expect(wall.heightMeters).toBeCloseTo(bastion.heightMeters);
      }
    }
  });

  it("opens the curtain at a gate and flanks it with towers", () => {
    const structures = collectCityStructures(town({}));
    const walls = structures.filter(item => item.kind === "wall");
    expect(walls).toHaveLength(2);
    expect(walls.every(item => item.heightMeters === 8 && item.parapet === "outer")).toBe(true);
    const ends = walls.flatMap(item => [item.centerline![0][0], item.centerline!.at(-1)![0]]);
    const gap = ends.filter(x => Math.abs(x) < 10).sort((a, b) => a - b);
    expect(gap[1] - gap[0]).toBeGreaterThan(5);
    expect(gap[1] - gap[0]).toBeLessThan(6.5);
    expect(structures.filter(item => item.kind === "gate")).toHaveLength(3);
    expect(structures.filter(item => item.kind === "tower").length).toBeGreaterThan(0);
  });

  it("omits a razed curtain", () => {
    const structures = collectCityStructures(
      town({
        defenseCircuits: [
          {
            id: "c",
            scope: "town",
            state: "razed",
            areaFaceIds: [],
            wallGroupIds: ["w"],
            naturalBarriers: [],
            locked: false
          }
        ],
        gates: []
      })
    );
    expect(structures.some(item => item.kind === "wall" || item.kind === "tower")).toBe(false);
  });

  it("keeps a square bridge and drops a skewed crossing", () => {
    const document = town({
      gates: [],
      featureGroups: [
        {
          id: "river",
          kind: "river",
          name: "River",
          vertices: ["r0", "r1", "r2"],
          source: null,
          mouth: null,
          style: { widthMeters: 8, color: "#456d7f" },
          locked: false
        },
        {
          id: "road",
          kind: "road",
          name: "Road",
          segments: [
            { edgeId: "ra", forward: true },
            { edgeId: "rb", forward: true }
          ],
          style: { widthMeters: 4, color: "#d5cfbf" },
          locked: false
        },
        {
          id: "skew",
          kind: "road",
          name: "Skew",
          segments: [{ edgeId: "sk", forward: true }],
          style: { widthMeters: 4, color: "#d5cfbf" },
          locked: false
        }
      ],
      mesh: {
        vertices: {
          r0: vertex("r0", [-30, 0]),
          r1: vertex("r1", [0, 0]),
          r2: vertex("r2", [30, 0]),
          a: vertex("a", [0, -20]),
          b: vertex("b", [0, 20]),
          s0: vertex("s0", [-15, -15]),
          s1: vertex("s1", [15, 15])
        },
        edges: {
          ra: edge("ra", "a", "r1"),
          rb: edge("rb", "r1", "b"),
          sk: edge("sk", "s0", "s1")
        },
        faces: {}
      }
    });
    const bridges = collectCityStructures(document).filter(item => item.kind === "bridge");
    expect(bridges).toHaveLength(1);
    expect(bridges[0].widthMeters).toBe(4);
    expect(bridges[0].parapet).toBe("both");
    expect(bridges[0].baseElevationMeters).toBe(0.4);
  });

  it("replaces the simple basilica with catalogue masses and keeps a landmark lot gabled", () => {
    const structures = collectCityStructures(
      town({
        gates: [],
        featureGroups: [],
        elements: [
          { id: "plz", kind: "plaza", faceIds: [], point: [0, -40], locked: false },
          { id: "temple", kind: "temple", faceIds: [], point: [20, 10], sizeMeters: 40, locked: false }
        ]
      })
    );
    const temple = structures.filter(item => item.id.startsWith("temple:temple:"));
    expect(temple).toHaveLength(15);
    expect(structures.some(item => item.id === "temple:temple")).toBe(false);
    expect(temple.filter(item => item.id.endsWith("west-tower"))).toHaveLength(2);
    expect(temple.filter(item => item.id.includes("radiating-chapel"))).toHaveLength(3);
    expect(temple.find(item => item.id.endsWith(":nave"))?.roofMaterial).toBe("tile");
    for (const part of temple) {
      const surfaces = structureSurfaces(part);
      expect(surfaces, part.id).not.toBeNull();
      expect(meshIsClosed(concatPositions(surfaces!.walls, surfaces!.roofs)), part.id).toBe(true);
    }
    const lots = landmarkLotStructures([
      {
        faceId: "f",
        id: "lot",
        polygon: [
          [0, 0],
          [12, 0],
          [12, 6],
          [0, 6]
        ],
        landmark: true
      }
    ]);
    expect(lots[0].heightMeters).toBe(12);
    expect(lots[0].roof).toBe("gable");
  });

  it("places and scales each basilica around the same anchor and rotation as the CE symbol", () => {
    for (const length of [27, 54]) {
      for (const rotation of [0, Math.PI / 2]) {
        const structures = collectCityStructures(
          town({
            frame: { extentMeters: 2400, cityRadiusMeters: 1000, blockSizeMeters: 30 },
            gates: [],
            featureGroups: [],
            elements: [
              {
                id: "church",
                kind: "temple",
                templeType: "basilica",
                faceIds: [],
                point: [80, -30],
                sizeMeters: length,
                rotation,
                locked: false
              }
            ]
          })
        );
        const nave = structures.find(part => part.id === "temple:church:nave")!;
        const scale = length / 54;
        const [x, y] = [-18.9 * scale, -5.6 * scale];
        expect(nave.footprint![0][0]).toBeCloseTo(80 + x * Math.cos(rotation) - y * Math.sin(rotation), 5);
        expect(nave.footprint![0][1]).toBeCloseTo(-30 + x * Math.sin(rotation) + y * Math.cos(rotation), 5);
        expect(nave.heightMeters).toBeCloseTo(12 * scale, 5);
        expect(nave.ridgeAzimuth).toBeCloseTo(rotation, 5);
      }
    }
  });
});

describe("cutWallOpenings", () => {
  it("follows the perimeter in order across the ring origin between gates", () => {
    const runs = cutWallOpenings(
      [
        [0, 0],
        [40, 0],
        [40, 40],
        [0, 40],
        [0, 0]
      ],
      [
        { index: 1, half: 3 },
        { index: 3, half: 3 }
      ]
    );
    expect(runs).toEqual([
      [
        [40, 3],
        [40, 40],
        [3, 40]
      ],
      [
        [0, 37],
        [0, 0],
        [37, 0]
      ]
    ]);
  });

  it("removes a span around the gate vertex", () => {
    const runs = cutWallOpenings(
      [
        [-40, 0],
        [0, 0],
        [40, 0]
      ],
      [{ index: 1, half: 3 }]
    );
    expect(runs).toHaveLength(2);
    expect(runs[0].at(-1)?.[0]).toBeCloseTo(-3, 1);
    expect(runs[1][0][0]).toBeCloseTo(3, 1);
  });
});
