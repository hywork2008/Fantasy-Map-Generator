import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { advanceSeasonalClimate } from "./seasonalClimate";

/**
 * 2 rows x 2 cols grid. Row 0 (y=0) sits at latitude 15°N; row 1 (y=100, graphHeight=200,
 * latN=15, latT=90) sits at latitude 15 - 0.5*90 = -30°S — deliberately one northern and one
 * southern row so hemisphere-sign behavior is exercised, not just magnitude.
 */
function buildWorld(overrides: Partial<WorldContext["grid"]["cells"]> = {}): WorldContext {
  return {
    graphHeight: 200,
    mapCoordinates: { latN: 15, latT: 90 },
    options: {
      temperatureEquator: 27,
      temperatureNorthPole: -18,
      temperatureSouthPole: -50,
      axialTilt: 23.5
    },
    grid: {
      cellsX: 2,
      points: [
        [0, 0],
        [10, 0],
        [0, 100],
        [10, 100]
      ],
      cells: {
        i: [0, 1, 2, 3],
        temp: Int8Array.from([10, 10, 5, 5]),
        ...overrides
      }
    }
  } as unknown as WorldContext;
}

function buildSimulation(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    currentYear: 1,
    currentMonth: 6,
    currentDay: 21,
    lastSeasonalTempBucket: null,
    ...overrides
  } as SimulationContext;
}

describe("advanceSeasonalClimate", () => {
  it("computes seasonalTemp on first call and marks simulation.cells changed", () => {
    const world = buildWorld();
    const simulation = buildSimulation();

    const result = advanceSeasonalClimate({ world, simulation });

    expect(result.topics).toEqual(["simulation.cells"]);
    expect(world.grid.cells.seasonalTemp).toBeDefined();
    expect(world.grid.cells.seasonalTemp).toHaveLength(4);
    expect(simulation.lastSeasonalTempBucket).toBe(1 * 12 + (6 - 1));
  });

  it("is a no-op (empty topics, unchanged seasonalTemp) on a second call within the same month", () => {
    const world = buildWorld();
    const simulation = buildSimulation();

    advanceSeasonalClimate({ world, simulation });
    const afterFirstCall = Array.from(world.grid.cells.seasonalTemp!);

    // Advance the day within the same calendar month — bucket is unchanged.
    simulation.currentDay = 25;
    const result = advanceSeasonalClimate({ world, simulation });

    expect(result.topics).toEqual([]);
    expect(Array.from(world.grid.cells.seasonalTemp!)).toEqual(afterFirstCall);
  });

  it("recomputes when the calendar month changes, including a multi-month jump in one call", () => {
    const world = buildWorld();
    const simulation = buildSimulation({ currentMonth: 6, currentDay: 21 });
    advanceSeasonalClimate({ world, simulation });
    const juneNorthernRow = world.grid.cells.seasonalTemp![0];

    // Simulate a bulk "Advance Time" jump straight to December, skipping every
    // intermediate month in a single call (mirrors a real advanceTime(0, 6, 0)).
    simulation.currentMonth = 12;
    simulation.currentDay = 21;
    const result = advanceSeasonalClimate({ world, simulation });
    const decemberNorthernRow = world.grid.cells.seasonalTemp![0];

    expect(result.topics).toEqual(["simulation.cells"]);
    expect(simulation.lastSeasonalTempBucket).toBe(1 * 12 + (12 - 1));
    // Northern-hemisphere row: warmer in June (near summer solstice) than December (near winter solstice).
    expect(decemberNorthernRow).toBeLessThan(juneNorthernRow);
  });

  it("flips the seasonal sign between the northern and southern-hemisphere rows for the same month", () => {
    const world = buildWorld();
    const simulation = buildSimulation({ currentMonth: 6, currentDay: 21 });

    advanceSeasonalClimate({ world, simulation });

    const northernOffset = world.grid.cells.seasonalTemp![0] - world.grid.cells.temp[0];
    const southernOffset = world.grid.cells.seasonalTemp![2] - world.grid.cells.temp[2];
    // Northern summer warms the northern row and cools the southern row.
    expect(northernOffset).toBeGreaterThan(0);
    expect(southernOffset).toBeLessThan(0);
  });

  it("never mutates the annual-average temp array", () => {
    const world = buildWorld();
    const simulation = buildSimulation();
    const before = Array.from(world.grid.cells.temp);

    advanceSeasonalClimate({ world, simulation });

    expect(Array.from(world.grid.cells.temp)).toEqual(before);
  });

  it("produces no seasonal swing anywhere when axialTilt is 0°", () => {
    const world = buildWorld();
    world.options.axialTilt = 0;
    const simulation = buildSimulation();

    advanceSeasonalClimate({ world, simulation });

    expect(Array.from(world.grid.cells.seasonalTemp!)).toEqual(Array.from(world.grid.cells.temp));
  });

  it("reallocates seasonalTemp if a stale array of the wrong length is already present", () => {
    const world = buildWorld({ seasonalTemp: Int8Array.from([1, 2]) });
    const simulation = buildSimulation();

    advanceSeasonalClimate({ world, simulation });

    expect(world.grid.cells.seasonalTemp).toHaveLength(4);
  });
});
