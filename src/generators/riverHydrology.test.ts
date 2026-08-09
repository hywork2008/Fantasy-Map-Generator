import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { River } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { getRiverCellHydrology, refreshRiverHydrology } from "./riverHydrology";

function createWorld(): Pick<WorldContext, "pack" | "grid" | "distanceScale"> {
  return {
    distanceScale: 1,
    pack: {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        h: new Uint8Array([55, 40, 25]),
        g: new Uint16Array([0, 1, 2])
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

  it("keeps the source temperature at the headwater and mixes downstream toward local temperature", () => {
    const river = createRiver();
    refreshRiverHydrology(river, createWorld());

    expect(getRiverCellHydrology(river, 0)?.waterTemperature).toBe(4);
    expect(getRiverCellHydrology(river, 2)?.waterTemperature).toBeGreaterThan(4);
    expect(getRiverCellHydrology(river, 2)?.waterTemperature).toBeLessThan(20);
  });
});
