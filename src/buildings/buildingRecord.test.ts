import { describe, expect, it } from "vitest";
import { canonicalJson, sealRecord } from "./canonicalJson";
import type { BuildingRecord, LevelRecord, Point } from "./record";
import { sha256Hex } from "./sha256";
import { validateBuildingRecord } from "./validate";

function square(size: number, origin: Point = [0, 0]): Point[] {
  const [cx, cy] = origin;
  const h = size / 2;
  return [
    [cx - h, cy - h],
    [cx + h, cy - h],
    [cx + h, cy + h],
    [cx - h, cy + h]
  ];
}

function circle(count: number, radius: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as Point;
  });
}

function level(outer: Point[], holes: Point[][] = []): LevelRecord {
  return {
    id: "ground",
    name: "Ground",
    elevationMeters: 0,
    floorToFloorMeters: 8,
    plates: [{ id: "hall", use: "hall", outer, holes, kind: "hall", roof: "covered" }],
    walls: [{ id: "keep", kind: "keep", outer, holes, thicknessMeters: 2 }],
    openings: [],
    fixtures: []
  };
}

function castle(outer: Point[], holes: Point[][] = [], extra: Partial<BuildingRecord> = {}): BuildingRecord {
  const record: BuildingRecord = {
    format: "fmg-building-record",
    version: 1,
    id: "sample-keep",
    revision: 1,
    contentHash: "",
    name: "Sample keep",
    kind: "castle",
    period: "highMedieval",
    planFamily: "rectangular-keep",
    region: "fixture",
    occupancyMeters: { width: 10, depth: 10 },
    approachAzimuthRadians: -Math.PI / 2,
    placementStyles: ["classic"],
    levels: [level(outer, holes)],
    verticalLinks: [],
    roofs: [{ baseId: "keep", form: "flat", pitchDeg: 0 }],
    materials: { wall: "stone", roof: "tile" },
    provenance: {
      constructionPeriod: "fixture",
      depictedPhase: "fixture",
      omitted: ["battlements"],
      dimensionSource: "authored for the schema test",
      planClass: "published-dimensions",
      confidence: "approximate",
      note: "Schematic. Not a surveyed castle."
    },
    ...extra
  };
  const width = Math.max(...outer.map(point => point[0])) - Math.min(...outer.map(point => point[0]));
  const depth = Math.max(...outer.map(point => point[1])) - Math.min(...outer.map(point => point[1]));
  record.occupancyMeters = extra.occupancyMeters ?? { width, depth };
  return sealRecord(record);
}

describe("building records", () => {
  it("spells canonical numbers without trailing zeros or a negative zero", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(canonicalJson({ b: 16, a: 16.5, c: -0 })).toBe('{"a":16.5,"b":16,"c":0}');
  });

  it("accepts a centred keep and rejects a hash that no longer matches", () => {
    const record = castle(square(10));
    expect(validateBuildingRecord(record).ok).toBe(true);
    const moved = { ...record, levels: record.levels.map(item => ({ ...item, elevationMeters: 1 })) };
    expect(validateBuildingRecord(moved).ok).toBe(false);
  });

  it("accepts 280 vertices on a level and rejects 513", () => {
    const ring = (count: number) => {
      const record = castle(circle(count, 20), [], { planFamily: "polygonal-keep" });
      record.levels[0].plates = [];
      return sealRecord(record);
    };
    expect(validateBuildingRecord(ring(280)).ok).toBe(true);
    const huge = validateBuildingRecord(ring(513));
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.errors.some(error => error.includes("512"))).toBe(true);
  });

  it("requires a hole to sit inside the outer ring and allows an opening on that hole", () => {
    const hole: Point[] = [
      [2, -2],
      [-2, -2],
      [-2, 2],
      [2, 2]
    ];
    const outside: Point[] = [
      [12, 12],
      [8, 12],
      [8, 8],
      [12, 8]
    ];
    expect(validateBuildingRecord(castle(square(10), [outside])).ok).toBe(false);
    const withDoor = castle(square(10), [hole]);
    withDoor.levels[0].openings = [
      {
        id: "court-door",
        ring: { wallId: "keep", hole: 0 },
        offsetMeters: 0.2,
        widthMeters: 1,
        sillMeters: 0,
        heightMeters: 2,
        kind: "door"
      }
    ];
    expect(validateBuildingRecord(sealRecord(withDoor)).ok).toBe(true);
  });

  it("rejects a gable on a wall that has a hole", () => {
    const hole: Point[] = [
      [2, -2],
      [-2, -2],
      [-2, 2],
      [2, 2]
    ];
    const record = castle(square(10), [hole]);
    record.roofs = [{ baseId: "keep", form: "gable", pitchDeg: 40 }];
    const result = validateBuildingRecord(sealRecord(record));
    expect(result.ok).toBe(false);
  });

  it("rejects a multi-storey catalogue castle with no stair", () => {
    const record = castle(square(10));
    const upper = { ...record.levels[0], id: "upper", name: "Upper", elevationMeters: 8 };
    record.levels = [record.levels[0], upper];
    expect(validateBuildingRecord(sealRecord(record)).ok).toBe(false);
  });

  it("does not require a plan family on a house", () => {
    const record = castle(square(8));
    record.kind = "house";
    record.planFamily = undefined;
    record.approachAzimuthRadians = undefined;
    record.placementStyles = [];
    expect(validateBuildingRecord(sealRecord(record)).ok).toBe(true);
  });

  it("requires procedural-rooms and open joins on a dungeon", () => {
    const record = castle(square(12));
    record.kind = "dungeon";
    record.planFamily = "rectangular-keep";
    record.generation = {
      strategy: "room-corridor",
      seed: "dungeon-1",
      settings: {
        strategy: "room-corridor",
        seed: "dungeon-1",
        widthMeters: 12,
        depthMeters: 12,
        courtyardWidthMeters: 4,
        courtyardDepthMeters: 4,
        roomBandDepthMeters: 3,
        minRoomWidthMeters: 3,
        corridorWidthMeters: 2,
        entranceWidthMeters: 1.5,
        entranceSide: "south",
        symmetric: false,
        outerWallMeters: 0.6,
        partitionWallMeters: 0.3,
        roomCount: 4,
        loopCount: 0,
        fixtures: false
      }
    };
    expect(validateBuildingRecord(sealRecord(record)).ok).toBe(false);
    record.planFamily = "procedural-rooms";
    record.levels[0].openJoins = [];
    record.levels[0].plates[0].label = "Hall";
    record.levels[0].plates[0].locked = false;
    record.levels[0].walls[0].locked = false;
    record.levels[0].openings = [
      {
        id: "door",
        ring: { wallId: "keep", hole: null },
        offsetMeters: 4,
        widthMeters: 1.2,
        sillMeters: 0,
        heightMeters: 2.2,
        kind: "door",
        state: "closed",
        visibility: "visible",
        role: "main",
        locked: false
      }
    ];
    expect(validateBuildingRecord(sealRecord(record)).ok).toBe(true);
  });
});
