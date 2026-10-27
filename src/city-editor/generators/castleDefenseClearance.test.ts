import { describe, expect, it } from "vitest";
import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric, clearBlockFabricCache } from "./blockInfill";
import { buildCityBuildings } from "./buildingLots";
import { CastleDefenseClearance } from "./castleDefenseClearance";
import { buildFortressPlan } from "./castleLayoutBuilder";
import { resolveCastleStyle } from "./castlePatterns";
import { boundaryEdges } from "./fortifications";
import { polygonCentroid } from "./geom";
import { meshFromCells } from "./mesh";
import { MoatReservation } from "./moats";

function square(x: number, y: number, half = 2): Point[] {
  return [
    [x - half, y - half],
    [x + half, y - half],
    [x + half, y + half],
    [x - half, y + half]
  ];
}

function fixture(): CityDocument {
  const polygons: Point[][] = [
    square(0, 0, 80),
    [
      [80, -80],
      [240, -80],
      [240, 80],
      [80, 80]
    ]
  ];
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [1 - id],
      onBorder: true
    }))
  );
  for (const face of Object.values(mesh.faces))
    Object.assign(face.properties, { ward: "craftsmen", settlement: "core", buildable: true });
  mesh.faces.f0.properties.ward = "castle";
  return {
    format: "fmg-city-editor",
    version: 2,
    appearance: "town",
    historicalPeriod: "ageOfExploration",
    mesh,
    frame: { extentMeters: 600, cityRadiusMeters: 200, blockSizeMeters: 50 },
    featureGroups: [
      {
        id: "castle-wall",
        kind: "wall",
        name: "Castle curtain",
        segments: boundaryEdges(mesh, ["f0"]),
        style: { widthMeters: 12, color: "black" },
        locked: false
      }
    ],
    gates: [],
    elements: [],
    defenseCircuits: [
      {
        id: "castle-circuit",
        scope: "castle",
        ownerCastleId: "gc:castle-0",
        areaFaceIds: ["f0"],
        wallGroupIds: ["castle-wall"],
        naturalBarriers: [],
        locked: false
      }
    ],
    castles: [
      {
        id: "gc:castle-0",
        version: 1,
        seed: "clearance",
        position: "central",
        relationship: "detached",
        form: "keep-bailey",
        circuitId: "castle-circuit",
        courtyards: [polygons[0]],
        parts: [],
        accesses: [],
        provenance: "generated",
        locked: false
      }
    ]
  };
}

function addStreet(document: CityDocument): void {
  const street = Object.values(document.mesh.edges).find(
    edge => document.mesh.vertices[edge.a].point[0] === 240 && document.mesh.vertices[edge.b].point[0] === 240
  )!;
  document.featureGroups.push({
    id: "street",
    kind: "road",
    name: "Street",
    segments: [{ edgeId: street.id, forward: true }],
    style: { widthMeters: 5, color: "black" },
    locked: false
  });
}

describe("castle defense clearance", () => {
  it("clears city-core housing outside a castle without a town wall, gate or approach road", () => {
    const clearance = new CastleDefenseClearance(fixture());
    expect(clearance.clears(square(95, 0))).toBe(false);
    expect(clearance.clears(square(150, 0))).toBe(true);
    // The same exterior buffer must not empty the interior barracks area.
    expect(clearance.clears(square(60, 0))).toBe(true);
    expect(clearance.clears(square(78, 0))).toBe(false);
  });

  it("reserves the actual scaled bastion footprint and its exterior clearance", () => {
    const document = fixture();
    const castle = document.castles![0];
    const plan = buildFortressPlan(document, castle, resolveCastleStyle(document, castle));
    const tower = plan.towers.find(tower => tower.point[0] === 80 && tower.point[1] === 80)!;
    const tip = tower.polygon![0];
    expect(tip[0]).toBeGreaterThan(100);
    const clearance = new CastleDefenseClearance(document);
    expect(clearance.clears(square(tip[0] - 1, tip[1] - 1, 0.2))).toBe(false);
    // This lot clears the straight curtains by >25 m but not the bastion.
    expect(clearance.clears(square(120, 120))).toBe(false);
    expect(clearance.clears(square(160, 160))).toBe(true);
    // A lot fully enclosing a tower must also be rejected.
    expect(clearance.clears(square(80, 80, 45))).toBe(false);
  });

  it("uses the existing defense profile distance", () => {
    const document = fixture();
    const clearance = new CastleDefenseClearance(document, [
      {
        points: [
          [80, 0],
          [240, 0]
        ],
        clearance: 70
      }
    ]);
    expect(clearance.clears(square(140, 0))).toBe(false);
    expect(clearance.clears(square(170, 0))).toBe(true);
  });

  it("does not reserve razed castle defenses", () => {
    const document = fixture();
    document.defenseCircuits![0].state = "razed";
    expect(new CastleDefenseClearance(document).clears(square(95, 0))).toBe(true);
  });

  it.each([false, true])("filters building output and preserves moat reservations (block fabric: %s)", modern => {
    const document = fixture();
    if (modern) document.buildingPattern = "medieval";
    addStreet(document);
    const clearance = new CastleDefenseClearance(document);
    const plainBuildings = buildCityBuildings(document);
    expect(plainBuildings.length).toBeGreaterThan(0);
    expect(plainBuildings.every(building => clearance.clears(building.polygon))).toBe(true);
    document.defenseCircuits![0].moat = { enabled: true, widthMeters: 45 };
    const moat = new MoatReservation(document, 2);
    const buildings = buildCityBuildings(document);
    expect(buildings.length).toBeGreaterThan(0);
    expect(buildings.every(building => clearance.clears(building.polygon) && !moat.hitsPolygon(building.polygon))).toBe(
      true
    );
  });

  it("rebuilds cached fabric when the castle style changes", () => {
    const document = fixture();
    document.buildingPattern = "medieval";
    addStreet(document);
    document.castles![0].castleStyle = "classic";
    const before = buildBlockFabric(document);
    document.castles![0].castleStyle = "bastion-citadel";
    const after = buildBlockFabric(document);
    expect(before.buildings.length).toBeGreaterThan(0);
    expect(after.buildings.length).toBeGreaterThan(0);
    expect(after.buildings).not.toBe(before.buildings);
    expect(after.buildings.every(building => new CastleDefenseClearance(document).clears(building.polygon))).toBe(true);
    clearBlockFabricCache(document);
  });
});
