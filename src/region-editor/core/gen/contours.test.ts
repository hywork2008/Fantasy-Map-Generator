import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { generateContourLines, generateHeightfieldFromCells, synthesizeHeightfield } from "./contours";

describe("contours and heightfield generation", () => {
  it("セル標高データからグリッド標高マップ（Heightfield）を正確に補間できること", () => {
    const cells: Array<{ point: Point; elevationMeters: number }> = [
      { point: [100, 100], elevationMeters: 50 },
      { point: [300, 100], elevationMeters: 200 },
      { point: [500, 100], elevationMeters: 800 },
      { point: [100, 300], elevationMeters: 100 },
      { point: [300, 300], elevationMeters: 500 },
      { point: [500, 300], elevationMeters: 1500 }
    ];

    const hf = generateHeightfieldFromCells(cells, 600, 400, 20);

    expect(hf.cols).toBeGreaterThan(10);
    expect(hf.rows).toBeGreaterThan(10);
    expect(hf.elevationsMeters.length).toBe(hf.cols * hf.rows);
    expect(hf.minElevationMeters).toBeGreaterThanOrEqual(40);
    expect(hf.maxElevationMeters).toBeLessThanOrEqual(1600);
  });

  it("Marching Squares により指定間隔の等高線（Contours）が生成されること", () => {
    // 孤立した山岳（中央に向かって標高が上がる）
    const cols = 21;
    const rows = 21;
    const elevationsMeters = new Array<number>(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = c - 10;
        const dy = r - 10;
        const dist = Math.sqrt(dx * dx + dy * dy);
        elevationsMeters[r * cols + c] = Math.max(0, 1000 - dist * 90);
      }
    }

    const heightfield = {
      cols,
      rows,
      minElevationMeters: 0,
      maxElevationMeters: 1000,
      elevationsMeters
    };

    const res = generateContourLines(heightfield, 400, 400, 100);

    expect(res.contours.length).toBeGreaterThan(0);
    expect(res.intervalMeters).toBe(100);

    // 主等高線（500m）が含まれていること
    const indexContours = res.contours.filter(c => c.isIndex);
    expect(indexContours.length).toBeGreaterThan(0);

    // 等高線が有効なポイント列を持っていること
    for (const c of res.contours) {
      expect(c.elevationMeters).toBeGreaterThan(0);
      expect(c.points.length).toBeGreaterThanOrEqual(2);
      for (const pt of c.points) {
        expect(Number.isFinite(pt[0])).toBe(true);
        expect(Number.isFinite(pt[1])).toBe(true);
      }
    }
  });

  it("合成標高マップが西側低地・東側高地のグラデーションを正しく形成すること", () => {
    const coastPoints: Point[] = [
      [200, 0],
      [220, 200],
      [190, 400]
    ];
    const hf = synthesizeHeightfield(800, 400, coastPoints, 20);

    expect(hf.minElevationMeters).toBe(0);
    expect(hf.maxElevationMeters).toBeGreaterThan(1500);

    // 西側（海洋領域）は標高 0 であること
    const westIdx = Math.floor(hf.rows / 2) * hf.cols + 2;
    expect(hf.elevationsMeters[westIdx]).toBe(0);

    // 東端（山脈領域）は高い標高であること
    const eastIdx = Math.floor(hf.rows / 2) * hf.cols + (hf.cols - 2);
    expect(hf.elevationsMeters[eastIdx]).toBeGreaterThan(1000);
  });
});
