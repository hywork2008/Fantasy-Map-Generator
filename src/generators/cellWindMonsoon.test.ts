import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { getMixingShape, getSeaBreezeShape, getSlopeWindShape, windVectorToTowardDeg } from "../utils/windClimate";
import {
  ensureCellWindClimate,
  getCellDiurnalParameters,
  getCellHourlyWind,
  getDailyWindStats
} from "./cellWindClimate";

const W = 120;
const H = 40;
const COAST_X = 75;

/** Subtropical continent ~3000 km wide with ocean to the east; 1 unit = 40 km; ~35°N–20.6°N. */
function continent(southern = false): WorldContext {
  const points: [number, number][] = [];
  const c: number[][] = [];
  const h = new Uint8Array(W * H);
  const f = new Uint8Array(W * H);
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
      const isLand = x < COAST_X;
      h[id] = isLand ? 30 : 5;
      f[id] = isLand ? 1 : 0;
    }
  return {
    mapId: 11,
    graphWidth: W,
    graphHeight: H,
    distanceScale: 40,
    mapCoordinates: southern
      ? { latN: -20.6, latT: 14.4, lonW: 0, lonT: 50 }
      : { latN: 35, latT: 14.4, lonW: 0, lonT: 50 },
    options: { winds: [225, 45, 225, 315, 135, 315], axialTilt: 23.5 },
    grid: {
      points,
      cellsX: W,
      cellsY: H,
      spacing: 1,
      features: [{ type: "ocean" }, { type: "island" }],
      cells: { i: new Uint32Array(W * H).map((_, i) => i), c, h, f, prec: new Uint8Array(W * H).fill(20) }
    }
  } as unknown as WorldContext;
}

const EAST_COAST = 20 * W + COAST_X - 1;
const JAN = 0;
const JUL = 6;

describe("monsoon (§5.3)", () => {
  it("blows onshore in summer and offshore in winter on a subtropical east coast", () => {
    const climate = ensureCellWindClimate(continent());
    expect(climate.monsoonU[EAST_COAST * 12 + JUL]).toBeLessThan(-3); // toward the land (west)
    expect(climate.monsoonU[EAST_COAST * 12 + JAN]).toBeGreaterThan(3); // toward the sea (east)
  });
  it("reverses the total wind between summer and winter on that coast (W2 completion criterion)", () => {
    const climate = ensureCellWindClimate(continent());
    const bearing = (m: number) =>
      windVectorToTowardDeg(climate.u[EAST_COAST * 12 + m], climate.v[EAST_COAST * 12 + m]);
    const turn = Math.abs(((bearing(JUL) - bearing(JAN) + 540) % 360) - 180);
    expect(turn).toBeGreaterThan(90);
  });
  it("reverses phase in the southern hemisphere", () => {
    const climate = ensureCellWindClimate(continent(true));
    expect(climate.monsoonU[EAST_COAST * 12 + JAN]).toBeLessThan(-3);
    expect(climate.monsoonU[EAST_COAST * 12 + JUL]).toBeGreaterThan(3);
  });
  it("turns right of the pressure gradient in the north", () => {
    const climate = ensureCellWindClimate(continent());
    // Onshore (westward) flow turned clockwise gains a northward component.
    expect(climate.monsoonV[EAST_COAST * 12 + JUL]).toBeGreaterThan(0);
  });
});

describe("diurnal cycle (§5.5)", () => {
  it("mixing has zero daily mean so the monthly mean wind is preserved (test 14)", () => {
    let sum = 0;
    for (let h = 0; h < 24; h += 0.25) sum += getMixingShape(h);
    expect(Math.abs(sum / 96)).toBeLessThan(1e-9);
  });
  it("peaks the sea breeze in the afternoon and the land breeze before dawn", () => {
    expect(getSeaBreezeShape(14.5)).toBeCloseTo(1, 6);
    expect(getSeaBreezeShape(5)).toBeCloseTo(-0.4, 6);
    expect(getSlopeWindShape(13)).toBeCloseTo(1, 6);
    expect(getSlopeWindShape(4, 1.5)).toBeCloseTo(-1.5, 6);
  });
  it("gives a coastal cell an onshore afternoon sea breeze, suppressed when the monsoon blows hard", () => {
    const world = continent();
    const april = getCellDiurnalParameters(world, EAST_COAST, 4)!;
    const july = getCellDiurnalParameters(world, EAST_COAST, 7)!;
    expect(april.breezeDirDeg).toBeCloseTo(270, 0); // sea (east) → land (west)
    expect(april.breezeAmp).toBeGreaterThan(0.3);
    expect(july.breezeAmp).toBeLessThan(april.breezeAmp); // ×max(0, 1 − V̄/8)
    expect(getCellDiurnalParameters(world, 20 * W + 20, 4)!.breezeAmp).toBe(0); // far inland
    const afternoon = getCellHourlyWind(world, EAST_COAST, 4, 14.5)!;
    const night = getCellHourlyWind(world, EAST_COAST, 4, 5)!;
    expect(afternoon.u).toBeLessThan(night.u);
  });
  it("reports daily aggregates in range", () => {
    const stats = getDailyWindStats(continent(), EAST_COAST, 7)!;
    expect(stats.meanSpeed).toBeGreaterThan(0);
    expect(stats.maxSpeed).toBeGreaterThanOrEqual(stats.meanSpeed);
    for (const share of [stats.calmFraction, stats.windmillFraction]) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});
