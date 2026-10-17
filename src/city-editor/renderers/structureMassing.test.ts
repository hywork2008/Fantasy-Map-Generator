import { describe, expect, it } from "vitest";
import type { CityDocument, EdgeFeatureGroup, Point } from "../types/document";
import { collectCityStructures, cutWallOpenings, landmarkLotStructures } from "./structureMassing";

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

  it("gives a basilica a spire and a landmark lot a gable", () => {
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
    const temple = structures.find(item => item.id.startsWith("temple:"));
    expect(temple?.spire).toBe(true);
    expect(temple?.roof).toBe("gable");
    expect(temple?.heightMeters).toBeCloseTo(11.2, 1);
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
