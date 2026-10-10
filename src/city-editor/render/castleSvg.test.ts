import { describe, expect, it } from "vitest";
import { getBurialCulturePreset } from "../../data/burialCultures";
import type { BurgCivilization } from "../../data/civilizationTraditions";
import type { CastlePart, CastlePlan, CityDocument, DefenseCircuit, Point } from "../core/types";
import { buildFortressPlan } from "./castleLayoutBuilder";
import { CASTLE_STYLE_PROFILES, resolveCastleStyle } from "./castlePatterns";
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
    [60, 0],
    [60, 60],
    [0, 60]
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
          boundary: [
            { edgeId: 0, forward: true },
            { edgeId: 1, forward: true },
            { edgeId: 2, forward: true },
            { edgeId: 3, forward: true }
          ],
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
        [55, 5],
        [55, 55],
        [5, 55]
      ]
    ],
    parts: [
      {
        id: "gc:castle-0:keep",
        role: "keep",
        footprint: [
          [25, 25],
          [45, 25],
          [45, 45],
          [25, 45]
        ],
        entrances: [[25, 35]],
        locked: false
      },
      ...(["hall", "range", "service", "chapel"] as const).map(
        (role, i): CastlePart => ({
          id: `gc:castle-0:${role}`,
          role,
          footprint: [
            [6 + i * 10, 6],
            [14 + i * 10, 6],
            [14 + i * 10, 14],
            [6 + i * 10, 14]
          ],
          entrances: [[10 + i * 10, 6]],
          locked: false
        })
      )
    ],
    accesses: [
      {
        gateId: "gate-0",
        points: [
          [0, 30],
          [25, 35]
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
  const civilization = (fortification: BurgCivilization["fortification"]): BurgCivilization => ({
    tradition: "test",
    period: "highMedieval",
    faith: "latinCatholic",
    cultureFaith: "latinCatholic",
    fortification,
    culture: { id: 1, name: "Test", nameBase: 0 }
  });

  it("follows the FMG culture's fortification lineage before the burial profile", () => {
    const islamicBurial = getBurialCulturePreset("ottoman_turbe");
    const european = mockDocument({
      historicalPeriod: "lateMedieval",
      burialProfile: islamicBurial,
      civilization: civilization("european")
    });
    expect(resolveCastleStyle(european).style).toBe("concentric");
    const islamic = mockDocument({ historicalPeriod: "highMedieval", civilization: civilization("islamic") });
    expect(resolveCastleStyle(islamic).style).toBe("islamic-qalat");
    expect(resolveCastleStyle({ ...islamic, historicalPeriod: "steamEra" }).style).toBe("bastion-citadel");
  });

  it("does not read a Roman roadside necropolis as an Islamic town", () => {
    const doc = mockDocument({
      historicalPeriod: "highMedieval",
      burialProfile: getBurialCulturePreset("roman_via_appia")
    });
    expect(resolveCastleStyle(doc).style).toBe("norman-keep");
  });

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
        bodyFate: "cremation_ritual",
        monuments: "cairns_and_steles",
        vegetation: "oriental_evergreen",
        ritualFacilities: ["caretaker_cottage"],
        mechanics: {
          remainFraction: 0,
          zombieRatio: 0,
          resourceCostPerCapita: {},
          sanitationRisk: 0,
          pilgrimageAppeal: 0
        },
        name: "Shinto",
        description: ""
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
        bodyFate: "inhumation_shrouded",
        monuments: "flat_ground_markers",
        vegetation: "mediterranean_cypress",
        ritualFacilities: ["ablution_fountain"],
        mechanics: {
          remainFraction: 1,
          zombieRatio: 0.1,
          resourceCostPerCapita: {},
          sanitationRisk: 0,
          pilgrimageAppeal: 0
        },
        name: "Sunni",
        description: ""
      }
    });
    expect(resolveCastleStyle(doc).style).toBe("islamic-qalat");
  });
});

describe("renderCastle (authentic fortress ground plans)", () => {
  it("renders Japanese Shiro with multiple ramparts, tenshu complex, tamon yagura, and masugata gate", () => {
    const doc = mockDocument();
    const castle = mockCastle({ castleStyle: "japanese-shiro" });
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--japanese-shiro");
    // 1. Honmaru and ramparts
    expect(g.querySelector(".ce-stone-rampart-slope")).toBeTruthy();
    expect(g.querySelector(".ce-inner-curtain-wall")).toBeTruthy();
    // 2. Tenshu complex (Main, Small, Watari gallery)
    expect(g.querySelector(".ce-building--main_keep")).toBeTruthy();
    expect(g.querySelector(".ce-building--small_keep")).toBeTruthy();
    expect(g.querySelector(".ce-building--watari_yagura")).toBeTruthy();
    // 3. Tamon-yagura and Honmaru Palace
    expect(g.querySelector(".ce-building--tamon_yagura")).toBeTruthy();
    expect(g.querySelector(".ce-building--palace_wing")).toBeTruthy();
    // 4. Masugata gate
    expect(g.querySelector(".ce-masugata-gate")).toBeTruthy();
  });

  it("renders Concentric Fortress with inner/outer curtains, drum towers, and barbican", () => {
    const doc = mockDocument();
    const castle = mockCastle({ castleStyle: "concentric" });
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--concentric");
    expect(g.querySelector(".ce-inner-curtain-wall")).toBeTruthy();
    expect(g.querySelector(".ce-outer-curtain-wall")).toBeTruthy();
    expect(g.querySelector(".ce-drum-tower")).toBeTruthy();
    expect(g.querySelector(".ce-barbican")).toBeTruthy();
    expect(g.querySelector(".ce-building--great_hall")).toBeTruthy();
  });

  it("renders Bastion Citadel with star bastions, glacis slope, and parade ground", () => {
    const doc = mockDocument();
    const castle = mockCastle({ castleStyle: "bastion-citadel" });
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--bastion-citadel");
    expect(g.querySelector(".ce-star-bastion")).toBeTruthy();
    expect(g.querySelector(".ce-bastion-glacis")).toBeTruthy();
    expect(g.querySelector(".ce-court--parade_ground")).toBeTruthy();
    expect(g.querySelector(".ce-building--barracks")).toBeTruthy();
  });

  it("renders Motte-and-Bailey with motte mound slope, timber keep, and palisade", () => {
    const doc = mockDocument();
    const castle = mockCastle({ castleStyle: "motte-bailey" });
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--motte-bailey");
    expect(g.querySelector(".ce-motte-mound-slope")).toBeTruthy();
    expect(g.querySelector(".ce-timber-palisade")).toBeTruthy();
    expect(g.querySelector(".ce-motte-timber-ramp")).toBeTruthy();
    expect(g.querySelector(".ce-building--main_keep")).toBeTruthy();
  });

  it("renders Norman Keep with square towers, forebuilding, and great hall", () => {
    const doc = mockDocument();
    const castle = mockCastle({ castleStyle: "norman-keep" });
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--norman-keep");
    expect(g.querySelector(".ce-square-tower")).toBeTruthy();
    expect(g.querySelector(".ce-building--main_keep")).toBeTruthy();
    expect(g.querySelector(".ce-building--great_hall")).toBeTruthy();
    expect(g.querySelector(".ce-building--chapel")).toBeTruthy();
  });

  it("renders classic style with legacy access paths between parts (種類がひとつだけだった時の描画)", () => {
    const doc = mockDocument();
    const castle = mockCastle({ castleStyle: "classic" });
    const g = renderCastle(doc, castle);

    expect(g.getAttribute("class")).toContain("ce-castle--classic");
    const path = g.querySelector(".ce-castle-access-path");
    const keep = g.querySelector(".ce-castle-keep");
    expect(path).toBeTruthy();
    expect(keep).toBeTruthy();
  });

  it("does not render legacy access paths over newly added castle styles", () => {
    const doc = mockDocument();
    // Default or newly added style (japanese-shiro, concentric, etc.)
    const shiroCastle = mockCastle({ castleStyle: "japanese-shiro" });
    const shiroG = renderCastle(doc, shiroCastle);
    expect(shiroG.querySelector(".ce-castle-access-path")).toBeNull();

    const normanCastle = mockCastle({ castleStyle: "norman-keep" });
    const normanG = renderCastle(doc, normanCastle);
    expect(normanG.querySelector(".ce-castle-access-path")).toBeNull();

    const concentricCastle = mockCastle({ castleStyle: "concentric" });
    const concentricG = renderCastle(doc, concentricCastle);
    expect(concentricG.querySelector(".ce-castle-access-path")).toBeNull();
  });

  it("identifies new style castle walls and circuits vs classic style", async () => {
    const { isNewStyleCastleWall, isNewStyleCastleCircuit } = await import("./svg");
    const doc = mockDocument();
    doc.castles = [mockCastle({ id: "c1", circuitId: "circ1", castleStyle: "japanese-shiro" })];
    doc.defenseCircuits = [
      {
        id: "circ1",
        scope: "castle",
        areaFaceIds: ["f1"],
        wallGroupIds: ["w1"],
        ownerCastleId: "c1",
        locked: false
      }
    ];

    expect(isNewStyleCastleCircuit(doc, "circ1")).toBe(true);
    expect(isNewStyleCastleWall(doc, "w1")).toBe(true);

    // Classic style castle
    doc.castles[0].castleStyle = "classic";
    expect(isNewStyleCastleCircuit(doc, "circ1")).toBe(false);
    expect(isNewStyleCastleWall(doc, "w1")).toBe(false);
  });

  it("identifies new style castle gates and prevents legacy gatehouse rendering", async () => {
    const { isNewStyleCastleGate } = await import("./svg");
    const doc = mockDocument();
    doc.castles = [mockCastle({ id: "c1", circuitId: "gc:defense-castle-0", castleStyle: "bastion-citadel" })];

    // Case 1: Direct ownerCastleId
    expect(isNewStyleCastleGate(doc, { id: "g1", vertexId: 99, locked: false, ownerCastleId: "c1" })).toBe(true);

    // Case 2: Gate ID prefix
    expect(isNewStyleCastleGate(doc, { id: "c1:gate", vertexId: 99, locked: false })).toBe(true);

    // Case 3: Gate on defense circuit boundary vertex (even without ownerCastleId)
    expect(isNewStyleCastleGate(doc, { id: "town-gate-1", vertexId: 1, locked: false })).toBe(true);

    // Case 4: Gate geographically close to castle precinct (point [0, 2] is 2m from [0, 0])
    doc.mesh.vertices[99] = { id: 99, point: [0, 2] };
    expect(isNewStyleCastleGate(doc, { id: "random-gate", vertexId: 99, locked: false })).toBe(true);

    // Case 5: Gate far away from castle
    doc.mesh.vertices[100] = { id: 100, point: [300, 300] };
    expect(isNewStyleCastleGate(doc, { id: "far-gate", vertexId: 100, locked: false })).toBe(false);

    // Case 6: Classic castle style should not suppress legacy gatehouse
    doc.castles[0].castleStyle = "classic";
    expect(isNewStyleCastleGate(doc, { id: "g1", vertexId: 99, locked: false, ownerCastleId: "c1" })).toBe(false);
    expect(isNewStyleCastleGate(doc, { id: "town-gate-1", vertexId: 1, locked: false })).toBe(false);
  });
});

describe("saved castle building geometry", () => {
  it.each(Object.values(CASTLE_STYLE_PROFILES).filter(profile => profile.style !== "classic"))(
    "renders saved and locked footprints for $style without changing the document",
    profile => {
      const doc = mockDocument();
      const castle = mockCastle({ castleStyle: profile.style });
      castle.parts[0].locked = true;
      const before = structuredClone(castle);
      const plan = buildFortressPlan(doc, castle, profile);
      const svg = renderCastle(doc, castle);
      for (const part of castle.parts) {
        expect(plan.buildings.find(building => building.id === part.id)?.polygon).toEqual(part.footprint);
        const path = `${part.footprint.map(([x, y], i) => `${i ? "L" : "M"}${x},${-y}`).join(" ")} Z`;
        expect([...svg.querySelectorAll(".ce-fortress-building")].some(node => node.getAttribute("d") === path)).toBe(
          true
        );
      }
      expect(castle).toEqual(before);
    }
  );
});

describe("castle wall thickness vs town wall", () => {
  it.each(Object.values(CASTLE_STYLE_PROFILES).filter(profile => profile.style !== "classic"))(
    "$style curtain matches the town wall while towers use the castle wall thickness",
    profile => {
      const doc = mockDocument();
      doc.defenseCircuits![0].wallGroupIds = ["castle-wall"];
      doc.featureGroups.push({
        id: "castle-wall",
        kind: "wall",
        name: "Castle palisade",
        segments: [],
        style: { widthMeters: 2.4, color: "#634327" },
        wallMaterial: "wood",
        locked: false
      });
      doc.defenseCircuits!.push({
        id: "town",
        scope: "town",
        areaFaceIds: [1],
        wallGroupIds: ["town-wall"],
        naturalBarriers: [],
        locked: false
      } as DefenseCircuit);
      doc.featureGroups.push({
        id: "town-wall",
        kind: "wall",
        name: "Town wall",
        segments: [],
        style: { widthMeters: 7.2, color: "#333" },
        wallMaterial: "stone",
        locked: false
      } as CityDocument["featureGroups"][number]);
      const plan = buildFortressPlan(doc, mockCastle({ castleStyle: profile.style }), profile);
      expect(plan.wallWidthMeters).toBe(7.2);
      for (const r of plan.ramparts.filter(r => r.kind === "outer_wall" || r.kind === "inner_wall"))
        expect(r.strokeWidth).toBe(7.2);
      for (const t of plan.towers.filter(t => t.radius !== undefined)) expect(t.radius!).toBe(2.4 * 1.05);
    }
  );
});
