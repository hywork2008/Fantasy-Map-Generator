import { describe, expect, it } from "vitest";
import { frontAxisOf, rotationFromFacing } from "../../../buildings/placementContract";
import { placementFootprint } from "../../../buildings/placementModels";
import type { CityDocument } from "../../types/document";
import type { TerrainPlatform, TerrainRiverCorridor } from "../../types/terrain";
import { createGridDocument } from "../document";
import { cityTerrain } from "../terrainElevation";
import { validateTerrainLayer } from "../terrainValidation";
import { commitPlacement, previewPlacement } from "./commitPlacement";
import { commitWay, removeWay } from "./commitWay";
import { buildingFrontPoint, connectEntrance } from "./entrance";
import { maxGrade } from "./slopeWay";
import { WAY_RISER_METERS } from "./steppedWay";

const footprint = { halfX: 4, halfZ: 6, centerX: 0, centerZ: 0, groundY: 0 };

function fieldDocument(meters = 4): CityDocument {
  const document = createGridDocument({ size: "micro", seed: "freeform-f2", grid: "hex" });
  document.historicalPeriod = "highMedieval";
  document.terrain = {
    version: 1,
    features: [],
    field: {
      version: 1,
      template: "noise",
      seed: 1,
      sampleMeters: 8,
      parts: [{ kind: "offset", meters }]
    }
  };
  return document;
}

function pad(id: string, level: number, x0: number, x1: number): TerrainPlatform {
  return {
    kind: "platform",
    id,
    role: "pad",
    summit: {
      kind: "polygon",
      points: [
        [x0, -2],
        [x1, -2],
        [x1, 2],
        [x0, 2]
      ]
    },
    levelMeters: level,
    edge: { kind: "slope", runMeters: 0 }
  };
}

const river: TerrainRiverCorridor = {
  kind: "riverCorridor",
  id: "river-1",
  sourceId: "river-1",
  centerline: [
    [0, -40],
    [0, 40]
  ],
  widthsMeters: [8, 8],
  bedMeters: [1, 1],
  depthMeters: 1,
  bank: { kind: "slope", runMeters: 4 }
};

describe("freeform ways", () => {
  it("holds a cart road to 10% and a castle approach to 8%", () => {
    const document = fieldDocument(0);
    document.terrain = {
      version: 1,
      features: [],
      field: {
        version: 1,
        template: "noise",
        seed: 1,
        sampleMeters: 8,
        parts: [
          { kind: "offset", meters: 0 },
          { kind: "hill", center: [0, 0], radiusMeters: 80, heightMeters: 16 }
        ]
      }
    };
    const centerline = [
      [0, 0],
      [40, 0]
    ] as [number, number][];
    const cart = commitWay(document, {
      id: "slope-cart",
      centerline,
      widthMeters: 4,
      profile: "slope",
      surface: "dirt",
      grade: "cart"
    });
    expect(cart.preview.ok).toBe(true);
    expect(maxGrade(centerline, cart.preview.elevations ?? [])).toBeLessThanOrEqual(0.1 + 1e-3);
    const approach = commitWay(document, {
      id: "slope-approach",
      centerline,
      widthMeters: 4,
      profile: "slope",
      surface: "paved",
      grade: "approach"
    });
    expect(maxGrade(centerline, approach.preview.elevations ?? [])).toBeLessThanOrEqual(0.08 + 1e-3);
    expect(approach.document.terrain?.ways?.[0].landings).toBeUndefined();
  });

  it("accepts a square bridge and rejects a diagonal or a bend in the channel", () => {
    const document = fieldDocument();
    document.terrain = { ...document.terrain!, features: [river] };
    const square = commitWay(document, {
      id: "bridge-square",
      centerline: [
        [-20, 0],
        [20, 0]
      ],
      widthMeters: 4,
      profile: "slope",
      surface: "paved",
      grade: "cart"
    });
    expect(square.preview.ok).toBe(true);
    expect(square.preview.skewDegrees).toBeCloseTo(0, 4);
    const diagonal = commitWay(document, {
      id: "bridge-diagonal",
      centerline: [
        [-20, -20],
        [20, 20]
      ],
      widthMeters: 4,
      profile: "slope",
      surface: "paved"
    });
    expect(diagonal.preview.reason).toBe("skew");
    expect(diagonal.preview.limitDegrees).toBe(15);
    expect(diagonal.document.terrain?.ways).toBeUndefined();
    const along = commitWay(document, {
      id: "bridge-along",
      centerline: [
        [0, -20],
        [0, 20]
      ],
      widthMeters: 3,
      profile: "slope",
      surface: "dirt"
    });
    expect(along.preview.reason).toBe("bend");
    expect(along.document).toBe(document);
  });

  it("stores landings, raises the ground, and keeps them after a reload", () => {
    const end = 4 + 10 * WAY_RISER_METERS;
    const document = fieldDocument(2);
    document.terrain = {
      ...document.terrain!,
      features: [pad("plot:a", 4, -6, -4), pad("plot:b", end, 10, 12)]
    };
    const placed = commitWay(document, {
      id: "stair-way",
      centerline: [
        [-5, 0],
        [11, 0]
      ],
      widthMeters: 2,
      profile: "stepped",
      surface: "dirt"
    });
    expect(placed.preview.ok).toBe(true);
    const way = placed.document.terrain?.ways?.[0];
    expect(way?.flights?.length).toBeGreaterThan(0);
    expect(validateTerrainLayer(placed.document)).toEqual([]);
    const landing = way?.landings?.[0];
    expect(landing).toBeTruthy();
    const terrain = cityTerrain(placed.document);
    const sample = (landing!.fromMeters + landing!.toMeters) / 2;
    const point: [number, number] = [-5 + sample, 0];
    if (point[0] > -4) expect(terrain.heightAt(point) + terrain.datumMeters).toBeCloseTo(landing!.levelMeters, 2);
    expect(terrain.roads?.stairs.length).toBeGreaterThan(0);
    expect(terrain.roads?.stairs[0].riserMeters).toBe(WAY_RISER_METERS);

    const reloaded = fieldDocument(9);
    reloaded.terrain = JSON.parse(JSON.stringify(placed.document.terrain));
    reloaded.terrain.field = {
      version: 1,
      template: "noise",
      seed: 2,
      sampleMeters: 8,
      parts: [{ kind: "offset", meters: 9 }]
    };
    const again = cityTerrain(reloaded);
    const kept = reloaded.terrain?.ways?.[0].landings?.[0];
    expect(again.heightAt([-5 + (kept!.fromMeters + kept!.toMeters) / 2, 0]) + again.datumMeters).toBeCloseTo(
      kept!.levelMeters,
      2
    );
    const cleared = removeWay(placed.document, "stair-way");
    expect(cleared.terrain?.ways).toEqual([]);
    const restored = cityTerrain(cleared);
    expect(Math.abs(restored.heightAt([3, 0]) + restored.datumMeters - 2)).toBeLessThan(0.5);
  });

  it("rejects a plot on a way and a way through a plot", () => {
    const way = commitWay(fieldDocument(), {
      id: "road-1",
      centerline: [
        [-30, 0],
        [30, 0]
      ],
      widthMeters: 4,
      profile: "slope",
      surface: "dirt"
    }).document;
    const onRoad = previewPlacement(way, {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint
    });
    expect(onRoad.reason).toBe("way");
    const house = commitPlacement(fieldDocument(), {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint
    }).document;
    const through = commitWay(house, {
      id: "through",
      centerline: [
        [-30, 0],
        [30, 0]
      ],
      widthMeters: 4,
      profile: "slope",
      surface: "cobble"
    });
    expect(through.preview.reason).toBe("overlap");
  });

  it("joins a building front to the nearest way", () => {
    const box = placementFootprint("house:mediterranean");
    expect(box).not.toBeNull();
    const front = buildingFrontPoint(
      [0, 0],
      rotationFromFacing(frontAxisOf("house:mediterranean"), 0),
      box!,
      frontAxisOf("house:mediterranean")
    );
    const roadY = front[1] + 16;
    const withWay = commitWay(fieldDocument(), {
      id: "north-road",
      centerline: [
        [-20, roadY],
        [20, roadY]
      ],
      widthMeters: 3,
      profile: "slope",
      surface: "dirt"
    }).document;
    const house = commitPlacement(withWay, {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint: box!
    }).document;
    const joined = connectEntrance(house, "house-1");
    expect("document" in joined).toBe(true);
    if (!("document" in joined)) return;
    const spur = joined.document.terrain?.ways?.find(item => item.id !== "north-road");
    expect(spur?.profile).toBe("stepped");
    expect(spur?.centerline[0][0]).toBeCloseTo(front[0], 3);
    expect(spur?.centerline[0][1]).toBeCloseTo(front[1], 3);
    const end = spur!.centerline[spur!.centerline.length - 1];
    expect(end[1]).toBeCloseTo(roadY, 3);
    const absent = connectEntrance(withWay, "missing");
    expect("error" in absent && absent.error).toBe("missing");
    expect(connectEntrance(fieldDocument(), "house-1")).toEqual({ error: "missing" });
  });
});
