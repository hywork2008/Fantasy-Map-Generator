import { describe, expect, it } from "vitest";
import type { RegionHeightfield } from "../core/types";
import { type ClimateSample, computeReliefRaster } from "./relief";

/** 中央に高さ peak の円錐火山、外周は海（0m）の地形 */
function cone(size: number, peak: number): RegionHeightfield {
  const cols = 81;
  const rows = 81;
  const elevationsMeters: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const d = Math.hypot(c - 40, r - 40) / 40;
      elevationsMeters.push(d > 0.95 ? 0 : Math.max(50, peak * (1 - d) ** 1.4));
    }
  void size;
  return { cols, rows, minElevationMeters: 0, maxElevationMeters: peak, elevationsMeters };
}

const SIZE = 400; // units (100m) = 40km
const input = (peak: number, samples?: ClimateSample[]) => ({
  heightfield: cone(SIZE, peak),
  widthUnits: SIZE,
  heightUnits: SIZE,
  metersPerUnit: 100,
  seed: "fuji",
  climateSamples: samples
});

const px = (r: ReturnType<typeof computeReliefRaster>, fx: number, fy: number) => {
  const o = (Math.round(fy * (r.height - 1)) * r.width + Math.round(fx * (r.width - 1))) * 4;
  return Array.from(r.rgba.slice(o, o + 4));
};
/** 森の緑の上に合成した色 */
const onGround = (p: number[]) => {
  const a = p[3] / 255;
  return [p[0] * a + 70 * (1 - a), p[1] * a + 110 * (1 - a), p[2] * a + 60 * (1 - a)];
};

describe("computeReliefRaster", () => {
  it("is deterministic for the same seed", () => {
    const a = computeReliefRaster(input(3700));
    const b = computeReliefRaster(input(3700));
    expect(a.rgba).toEqual(b.rgba);
  });

  it("leaves sea pixels transparent", () => {
    const r = computeReliefRaster(input(3700));
    expect(px(r, 0.01, 0.01)[3]).toBe(0);
  });

  it("caps a tall peak with snow but not a low hill", () => {
    const tall = computeReliefRaster(input(3700));
    // 山頂の少し北西（光源側）: 白っぽく不透明
    const [r, g, b] = onGround(px(tall, 0.49, 0.49));
    expect(Math.min(r, g, b)).toBeGreaterThan(180);
    const low = computeReliefRaster(input(600));
    const [lr, lg, lb] = onGround(px(low, 0.49, 0.49));
    expect(Math.min(lr, lg, lb)).toBeLessThan(180);
  });

  it("uses FMG temperatures: a warm climate raises the snow line", () => {
    const warm: ClimateSample[] = [[200, 200, 3700, 3]];
    const r = computeReliefRaster(input(3700, warm));
    const [cr, cg, cb] = onGround(px(r, 0.49, 0.49));
    expect(Math.min(cr, cg, cb)).toBeLessThan(200);
  });

  it("leaves cold lowlands to the FMG biomes (no scrub/rock/snow over tundra or taiga)", () => {
    const cols = 41;
    const rows = 41;
    const flat: RegionHeightfield = {
      cols,
      rows,
      minElevationMeters: 100,
      maxElevationMeters: 140,
      elevationsMeters: Array.from({ length: cols * rows }, (_, i) => 100 + 40 * Math.sin(i * 0.37))
    };
    const cold: ClimateSample[] = [[200, 200, 100, 2]];
    const r = computeReliefRaster({ ...input(0, cold), heightfield: flat });
    let maxAlpha = 0;
    for (let i = 3; i < r.rgba.length; i += 4) maxAlpha = Math.max(maxAlpha, r.rgba[i]);
    expect(maxAlpha).toBeLessThan(60);
  });

  it("shades the slope facing away from the NW sun darker than the sunlit one", () => {
    const r = computeReliefRaster(input(1500));
    const lum = (p: number[]) => onGround(p).reduce((x, y) => x + y, 0);
    expect(lum(px(r, 0.62, 0.62))).toBeLessThan(lum(px(r, 0.38, 0.38)));
  });

  it("carves radial gullies: alpha/brightness varies around a contour ring", () => {
    const r = computeReliefRaster(input(3700));
    const values: number[] = [];
    for (let k = 0; k < 360; k += 3) {
      const t = (k * Math.PI) / 180;
      values.push(onGround(px(r, 0.5 + 0.18 * Math.cos(t), 0.5 + 0.18 * Math.sin(t)))[0]);
    }
    let changes = 0;
    for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - values[i - 1]) > 6) changes++;
    expect(changes).toBeGreaterThan(10);
  });

  it("stays within the time budget for a full-size raster", () => {
    const t = performance.now();
    computeReliefRaster({ ...input(3700), widthUnits: 1000, heightUnits: 800 });
    expect(performance.now() - t).toBeLessThan(4000);
  });
});
