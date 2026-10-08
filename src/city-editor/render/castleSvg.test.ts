import { describe, expect, it } from "vitest";
import type { CastlePlan, CityDocument, DefenseCircuit, Point } from "../core/types";
import { resolveCastleStyle } from "./castlePatterns";
import { renderCastle } from "./castleSvg";

function mockDocument(overrides?: Partial<CityDocument>): CityDocument {
  const circuit: DefenseCircuit = {
    id: "gc:defense-castle-0",
    scope: "castle",
    areaFaceIds: [1],
    wallGroupIds: [],
    naturalBarriers: [],
    locked: false
  };

  const ringPoints: Point[] = [
    [0, 0],
    [40, 0],
    [40, 40],
    [0, 40]
  ];

  const doc: CityDocument = {
    version: 2,
    seed: "test-seed",
    historicalPeriod: "highMedieval",
    frame: {
      centerMeters: [0, 0],
      extentMeters: 500,
      blockSizeMeters: 25,
      buildingSpreadMeters: 50,
      buildingSpreadMultiplier: 1
    },
    mesh: {
      vertices: [
        { id: 0, point: ringPoints[0] },
        { id: 1, point: ringPoints[1] },
        { id: 2, point: ringPoints[2] },
        { id: 3, point: ringPoints[3] }
      ],
      edges: [
        { id: 0, a: 0, b: 1, leftFace: 1, rightFace: null },
        { id: 1, a: 1, b: 2, leftFace: 1, rightFace: null },
        { id: 2, a: 2, b: 3, leftFace: 1, rightFace: null },
        { id: 3, a: 3, b: 0, leftFace: 1, rightFace: null }
      ],
      faces: {
        1: {
          id: 1,
          edgeIds: [0, 1, 2, 3],
          vertexIds: [0, 1, 2, 3],
          properties: {
            elevation: 10,
            water: "land",
            ward: "castle",
            buildable: true,
            locked: false
          }
        }
      }
    },
    featureGroups: [],
    elements: [],
    gates: [],
    defenseCircuits: [circuit],
    ...overrides
  };
  return doc;
}

function mockCastle(overrides?: Partial<CastlePlan>): CastlePlan {
  return {
    id: "gc:castle-0",
    version: 1,
    seed: "castle-seed",
    position: "edge",
    relationship: "integrated",
    form: "keep-bailey",
    circuitId: "gc:defense-castle-0",
    courtyards: [
      [
        [5, 5],
        [35, 5],
        [35, 35],
        [5, 35]
      ]
    ],
    parts: [
      {
        id: "gc:castle-0:keep",
        role: "keep",
        footprint: [
          [20, 20],
          [32, 20],
          [32, 32],
          [20, 32]
        ],
        entrances: [[20, 26]],
        locked: false
      },
      {
        id: "gc:castle-0:hall",
        role: "hall",
        footprint: [
          [8, 8],
          [22, 8],
          [22, 14],
          [8, 14]
        ],
        entrances: [[15, 14]],
        locked: false
      }
    ],
    accesses: [
      {
        gateId: "gate-0",
        points: [
          [0, 20],
          [10, 20],
          [20, 26]
        ],
        widthMeters: 3.5
      }
    ],
    provenance: "generated",
    locked: false,
    ...overrides
  };
}

describe("resolveCastleStyle", () => {
  it("resolves styles correctly based on historical periods", () => {
    expect(resolveCastleStyle(mockDocument({ historicalPeriod: "classicalAntiquity" })).style).toBe("ancient-castra");
    expect(resolveCastleStyle(mockDocument({ historicalPeriod: "earlyMedieval" })).style).toBe("motte-bailey");
    expect(resolveCastleStyle(mockDocument({ historicalPeriod: "highMedieval" })).style).toBe("norman-keep");
    expect(resolveCastleStyle(mockDocument({ historicalPeriod: "lateMedieval" })).style).toBe("concentric");
    expect(resolveCastleStyle(mockDocument({ historicalPeriod: "ageOfExploration" })).style).toBe("bastion-citadel");
    expect(resolveCastleStyle(mockDocument({ historicalPeriod: "preIndustrialEra" })).style).toBe("bastion-citadel");
  });

  it("resolves Japanese shiro style for East Asian / Shinto culture profile", () => {
    const doc = mockDocument({
      historicalPeriod: "highMedieval",
      burialProfile: {
        id: "shinto_reien",
        zoning: "topographic_hill",
        boundary: "monumental_gate_pylon",
        sanctuary: "ancestral_hall",
        treatment: "cremation_ritual",
        monuments: "cairns_and_steles",
        flora: "oriental_evergreen",
        facility: "caretaker_cottage",
        mechanics: { remainFraction: 0, zombieRatio: 0 }
      }
    });
    expect(resolveCastleStyle(doc).style).toBe("japanese-shiro");
  });

  it("resolves Islamic qalat style for Middle Eastern / Moorish culture profile", () => {
    const doc = mockDocument({
      historicalPeriod: "lateMedieval",
      burialProfile: {
        id: "sunni_wahhabi",
        zoning: "extramural_sanitary",
        boundary: "low_curb_or_hedge",
        sanctuary: "mausoleum_dome",
        treatment: "inhumation_shrouded",
        monuments: "flat_ground_markers",
        flora: "mediterranean_cypress",
        facility: "ablution_fountain",
        mechanics: { remainFraction: 1, zombieRatio: 0.1 }
      }
    });
    expect(resolveCastleStyle(doc).style).toBe("islamic-qalat");
  });

  it("honors explicit castleStyle override", () => {
    const doc = mockDocument({ historicalPeriod: "highMedieval" });
    const castle = mockCastle();
    (castle as unknown as { castleStyle: string }).castleStyle = "bastion-citadel";
    expect(resolveCastleStyle(doc, castle).style).toBe("bastion-citadel");
  });
});

describe("renderCastle", () => {
  it("renders Norman keep castle with turrets, buttresses, and hall", () => {
    const doc = mockDocument({ historicalPeriod: "highMedieval" });
    const castle = mockCastle();
    const g = renderCastle(doc, castle);

    expect(g.tagName.toLowerCase()).toBe("g");
    expect(g.getAttribute("class")).toContain("ce-castle--norman-keep");
    expect(g.querySelector(".ce-keep-body")).toBeTruthy();
    expect(g.querySelector(".ce-keep-turret")).toBeTruthy();
    expect(g.querySelector(".ce-castle-hall")).toBeTruthy();
    expect(g.querySelector(".ce-castle-roof-ridge")).toBeTruthy();
    expect(g.querySelector(".ce-castle-well")).toBeTruthy();
  });

  it("renders Japanese shiro castle with rampart base, yagura corners, and shoin hall", () => {
    const doc = mockDocument({
      historicalPeriod: "highMedieval",
      burialProfile: {
        id: "shinto_reien",
        zoning: "topographic_hill",
        boundary: "monumental_gate_pylon",
        sanctuary: "ancestral_hall",
        treatment: "cremation_ritual",
        monuments: "cairns_and_steles",
        flora: "oriental_evergreen",
        facility: "caretaker_cottage",
        mechanics: { remainFraction: 0, zombieRatio: 0 }
      }
    });
    const castle = mockCastle();
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--japanese-shiro");
    expect(g.querySelector(".ce-keep-rampart-base")).toBeTruthy();
    expect(g.querySelector(".ce-keep-tenshu-yagura")).toBeTruthy();
  });

  it("renders Motte-and-bailey with rampart base and motte slope hatching", () => {
    const doc = mockDocument({ historicalPeriod: "earlyMedieval" });
    const castle = mockCastle();
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--motte-bailey");
    expect(g.querySelector(".ce-keep-rampart-base")).toBeTruthy();
    // Multiple concentric circles for motte terrace hatching
    const circles = g.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThan(2);
  });

  it("renders Islamic qalat with pool and flat dome", () => {
    const doc = mockDocument({
      historicalPeriod: "lateMedieval",
      burialProfile: {
        id: "sunni_wahhabi",
        zoning: "extramural_sanitary",
        boundary: "low_curb_or_hedge",
        sanctuary: "mausoleum_dome",
        treatment: "inhumation_shrouded",
        monuments: "flat_ground_markers",
        flora: "mediterranean_cypress",
        facility: "ablution_fountain",
        mechanics: { remainFraction: 1, zombieRatio: 0.1 }
      }
    });
    const castle = mockCastle();
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--islamic-qalat");
    expect(g.querySelector(".ce-castle-pool")).toBeTruthy();
  });

  it("adds ce-is-selected class when inspectedId matches castle id", () => {
    const doc = mockDocument({ historicalPeriod: "highMedieval" });
    const castle = mockCastle();
    const g = renderCastle(doc, castle, castle.id);

    expect(g.getAttribute("class")).toContain("ce-is-selected");
  });
});
