import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { CaravanMovement } from "./caravanMovement";
import { bakeCaravanTravelLegs } from "./caravans";
import type { TradeRouteSegment } from "./marketTypes";
import { calculateRouteDurationDays, getWaterSegmentSpeedKmPerDay } from "./tradeRouteDuration";

/** A 600 km sea leg due east from pack cell 0 (grid cell 0) to pack cell 1. */
const SEA: TradeRouteSegment = {
  type: "sea",
  points: [
    [0, 0, 0],
    [600, 0, 1]
  ]
};

describe("trade ETA includes ocean current and wind", () => {
  const { pack, grid, distanceScale } = worldContext;

  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { currentMonth: 7 } } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = { cells: { h: [5, 5], g: [0, 1] } } as unknown as PackedGraph;
    // A full-speed current flowing east (0° = east in grid.cells.currentAngle), no wind field.
    worldContext.grid = {
      cells: { currentAngle: [0, 0], currentSpeed: [255, 255] }
    } as unknown as typeof grid;
    CaravanMovement.configure({ seaKmPerDay: 60, seaCurrentStrength: 0.3, seaWindStrength: 0.5 });
  });

  afterEach(() => {
    Object.assign(worldContext, { pack, grid, distanceScale });
    clearEconomyContext();
  });

  it("is shorter with the current and longer against it", () => {
    expect(calculateRouteDurationDays([SEA], 1)).toBe(Math.ceil(600 / (60 * 1.3)));
    const back: TradeRouteSegment = {
      type: "sea",
      points: [
        [600, 0, 1],
        [0, 0, 0]
      ]
    };
    expect(calculateRouteDurationDays([back], 1)).toBe(Math.ceil(600 / (60 * 0.7)));
  });

  it("quotes the same sea speed the caravan then sails at", () => {
    const quoted = getWaterSegmentSpeedKmPerDay(SEA, 7);
    const legs = bakeCaravanTravelLegs([SEA], 1, "horse", CaravanMovement.getOptions(), 7, null, 1, worldContext);
    expect(legs[0].speedKmPerDay).toBeCloseTo(quoted, 9);
  });

  it("returns to the plain sea speed when both corrections are off", () => {
    CaravanMovement.configure({ seaCurrentStrength: 0, seaWindStrength: 0 });
    expect(calculateRouteDurationDays([SEA], 1)).toBe(10);
  });
});

describe("sea current default migration", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("lifts a pre-v2 stored 0 to the new default but keeps a deliberate v2 0", async () => {
    localStorage.setItem("caravan-movement", JSON.stringify({ seaCurrentStrength: 0, landKmPerDay: 40 }));
    vi.resetModules();
    let module = await import("./caravanMovement");
    expect(module.CaravanMovement.getOptions().seaCurrentStrength).toBe(0.3);
    expect(module.CaravanMovement.getOptions().landKmPerDay).toBe(40);

    localStorage.setItem("caravan-movement", JSON.stringify({ seaCurrentStrength: 0, settingsVersion: 2 }));
    vi.resetModules();
    module = await import("./caravanMovement");
    expect(module.CaravanMovement.getOptions().seaCurrentStrength).toBe(0);
  });
});
