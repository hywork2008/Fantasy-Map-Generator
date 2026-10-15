import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { windVectorToTowardDeg } from "../utils/windClimate";
import { ensureCellWindClimate, getCellWind } from "./cellWindClimate";

const W = 20;
const H = 5;

/** 20×5 raster around 45°N, 1 unit = 10 km, with a north–south ridge in column 10. */
function fixture(winds: number[], ridge = true): WorldContext {
  const points: [number, number][] = [];
  const c: number[][] = [];
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const id = y * W + x;
      points.push([x + 0.5, y + 0.5]);
      const around: number[] = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ])
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) around.push((y + dy) * W + x + dx);
      c.push(around);
      h[id] = ridge && x === 10 ? 90 : 25;
    }
  return {
    mapId: 7,
    graphWidth: W,
    graphHeight: H,
    distanceScale: 10,
    mapCoordinates: { latN: 46, latT: 2, lonW: 0, lonT: 2 },
    options: { winds, axialTilt: 23.5 },
    grid: { points, cellsX: W, cellsY: H, spacing: 1, cells: { i: new Uint32Array(W * H).map((_, i) => i), c, h } }
  } as unknown as WorldContext;
}

const WEST_WIND = [90, 90, 90, 90, 90, 90];
const EAST_WIND = [270, 270, 270, 270, 270, 270];

describe("cell wind climate", () => {
  it("follows the configured band direction", () => {
    const wind = getCellWind(fixture(WEST_WIND, false), 2 * W + 3, 1)!;
    expect(windVectorToTowardDeg(wind.u, wind.v)).toBeCloseTo(90, 3);
    const rotated = getCellWind(fixture(EAST_WIND, false), 2 * W + 3, 1)!;
    expect(windVectorToTowardDeg(rotated.u, rotated.v)).toBeCloseTo(270, 3);
  });
  it("puts the lee and foehn on the downwind side, and moves them when the wind reverses (test 13)", () => {
    const west = fixture(WEST_WIND);
    const east = (x: number) => getCellWind(west, 2 * W + x, 1)!;
    expect(east(11).leeSide).toBe(true);
    expect(east(11).foehnProne).toBe(true);
    expect(east(9).leeSide).toBe(false);
    expect(east(11).speed).toBeLessThan(east(5).speed);
    const reversed = fixture(EAST_WIND);
    expect(getCellWind(reversed, 2 * W + 9, 1)!.leeSide).toBe(true);
    expect(getCellWind(reversed, 2 * W + 11, 1)!.leeSide).toBe(false);
  });
  it("speeds up exposed ridge cells", () => {
    const world = fixture(WEST_WIND);
    const climate = ensureCellWindClimate(world);
    expect(climate.exposure[2 * W + 10]).toBeGreaterThan(1);
    expect(climate.exposure[2 * W + 3]).toBeCloseTo(1, 6);
  });
  it("caches per geography and invalidates when winds or heights change", () => {
    const world = fixture(WEST_WIND);
    const first = ensureCellWindClimate(world);
    expect(ensureCellWindClimate(world)).toBe(first);
    world.options.winds = EAST_WIND as typeof world.options.winds;
    const second = ensureCellWindClimate(world);
    expect(second).not.toBe(first);
    world.grid.cells.h[0] = 60;
    expect(ensureCellWindClimate(world)).not.toBe(second);
  });
  it("never writes generation outputs", () => {
    const world = fixture(WEST_WIND);
    const before = Object.keys(world.grid.cells).sort();
    ensureCellWindClimate(world);
    expect(Object.keys(world.grid.cells).sort()).toEqual(before);
  });
});
