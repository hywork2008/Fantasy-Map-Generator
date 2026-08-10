import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { River } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { applyRiverResidualFlows, getRiverCellHydrology, refreshRiverHydrology } from "./riverHydrology";

function createWorld(): Pick<WorldContext, "pack" | "grid" | "distanceScale"> {
  return {
    distanceScale: 1,
    pack: {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        h: new Uint8Array([55, 40, 25]),
        g: new Uint16Array([0, 1, 2]),
        fl: new Float32Array([300, 300, 300])
      },
      rivers: []
    },
    grid: { cells: { temp: new Int8Array([4, 12, 20]) } }
  } as unknown as Pick<WorldContext, "pack" | "grid" | "distanceScale">;
}

function createRiver(): River {
  return {
    i: 1,
    source: 0,
    mouth: 2,
    parent: 1,
    basin: 1,
    length: 20,
    discharge: 300,
    width: 1,
    widthFactor: 1,
    sourceWidth: 0.1,
    sourceElevation: 500,
    sourceWaterTemperature: 4,
    name: "Test River",
    type: "River",
    cells: [0, 1, 2]
  };
}

describe("river hydrology", () => {
  it("makes higher and shorter rivers flow faster", () => {
    const world = createWorld();
    const river = createRiver();

    refreshRiverHydrology(river, world);
    const baselineSpeed = getRiverCellHydrology(river, 0)?.surfaceVelocity ?? 0;

    river.sourceElevation = 1500;
    refreshRiverHydrology(river, world);
    const highSourceSpeed = getRiverCellHydrology(river, 0)?.surfaceVelocity ?? 0;

    river.length = 60;
    refreshRiverHydrology(river, world);
    const longRiverSpeed = getRiverCellHydrology(river, 0)?.surfaceVelocity ?? 0;

    expect(highSourceSpeed).toBeGreaterThan(baselineSpeed);
    expect(longRiverSpeed).toBeLessThan(highSourceSpeed);
  });

  it("does not make a short river faster when there is no elevation drop", () => {
    const world = createWorld();
    const river = createRiver();
    river.sourceElevation = heightToMeters(
      world.pack.cells.h[river.mouth],
      normalizeHeightExponent(useOptionsState.getState().heightExponent)
    );
    river.length = 2;
    refreshRiverHydrology(river, world);
    const shortFlatSpeed = getRiverCellHydrology(river, river.source)?.surfaceVelocity;

    river.length = 60;
    refreshRiverHydrology(river, world);
    const longFlatSpeed = getRiverCellHydrology(river, river.source)?.surfaceVelocity;

    expect(shortFlatSpeed).toBe(longFlatSpeed);
  });

  it("slows surface flow as the channel widens", () => {
    const world = createWorld();
    const river = createRiver();
    river.sourceElevation = 1500;
    river.width = 0.2;
    refreshRiverHydrology(river, world);
    const narrowMouthSpeed = getRiverCellHydrology(river, river.mouth)?.surfaceVelocity ?? 0;

    river.width = 5;
    refreshRiverHydrology(river, world);
    const wideMouthSpeed = getRiverCellHydrology(river, river.mouth)?.surfaceVelocity ?? 0;

    expect(wideMouthSpeed).toBeLessThan(narrowMouthSpeed);
  });

  it("uses residual flow directly to reduce estimated depth after withdrawals", () => {
    const world = createWorld();
    const river = createRiver();

    refreshRiverHydrology(river, world);
    const naturalDepth = getRiverCellHydrology(river, river.source)?.waterDepth ?? 0;

    const residualFlowByCell = new Float32Array([3000, 3000, 3000]);
    refreshRiverHydrology(river, world, { residualFlowByCell, annualWaterPerFlux: 30 });
    const residualDepth = getRiverCellHydrology(river, river.source)?.waterDepth ?? 0;

    expect(residualDepth).toBeLessThan(naturalDepth);
    expect(residualDepth).toBeGreaterThan(0);
  });

  it("widens and caps depth when a confluence adds its downstream flow", () => {
    const world = createWorld();
    world.pack.cells.fl = new Float32Array([50, 1000, 1000]);
    const river = createRiver();
    river.discharge = 1000;
    river.sourceWidth = 0.05;
    river.width = 0.5;

    refreshRiverHydrology(river, world);

    const confluenceDepth = getRiverCellHydrology(river, 1)?.waterDepth ?? 0;
    const mouthDepth = getRiverCellHydrology(river, river.mouth)?.waterDepth ?? 0;
    expect(confluenceDepth).toBeLessThanOrEqual(mouthDepth * 1.5);
  });

  it("keeps an applied residual flow when an editor refreshes river hydrology", () => {
    const world = createWorld();
    const river = createRiver();
    world.pack.rivers.push(river);

    applyRiverResidualFlows(world, {
      residualFlowByCell: new Float32Array([3000, 3000, 3000]),
      annualWaterPerFlux: 30
    });
    const residualDepth = getRiverCellHydrology(river, river.source)?.waterDepth;

    refreshRiverHydrology(river, world);

    expect(getRiverCellHydrology(river, river.source)?.waterDepth).toBe(residualDepth);
  });

  it("keeps the source temperature at the headwater and mixes downstream toward local temperature", () => {
    const river = createRiver();
    refreshRiverHydrology(river, createWorld());

    expect(getRiverCellHydrology(river, 0)?.waterTemperature).toBe(4);
    expect(getRiverCellHydrology(river, 2)?.waterTemperature).toBeGreaterThan(4);
    expect(getRiverCellHydrology(river, 2)?.waterTemperature).toBeLessThan(20);
  });

  it("uses the lake surface for a lake outlet's source elevation and temperature", () => {
    const world = createWorld();
    world.pack.cells.h = new Uint8Array([10, 40, 20]);
    world.pack.cells.f = new Uint16Array([1, 0, 0]);
    world.pack.features = [
      { i: 0, type: "ocean" },
      { i: 1, type: "lake", height: 45, temp: 7 }
    ] as unknown as WorldContext["pack"]["features"];
    const river = createRiver();
    river.sourceElevation = 0;
    delete river.sourceWaterTemperature;

    refreshRiverHydrology(river, world);

    expect(river.sourceElevation).toBeGreaterThan(0);
    expect(river.sourceWaterTemperature).toBe(7);
  });

  it("keeps a manually entered source elevation for a lake outlet", () => {
    const world = createWorld();
    world.pack.cells.h = new Uint8Array([10, 40, 20]);
    world.pack.cells.f = new Uint16Array([1, 0, 0]);
    world.pack.features = [
      { i: 0, type: "ocean" },
      { i: 1, type: "lake", height: 45, temp: 7 }
    ] as unknown as WorldContext["pack"]["features"];
    const river = createRiver();
    river.sourceElevation = 0;
    river.sourceElevationMode = "manual";

    refreshRiverHydrology(river, world);

    expect(river.sourceElevation).toBe(0);
  });
});
