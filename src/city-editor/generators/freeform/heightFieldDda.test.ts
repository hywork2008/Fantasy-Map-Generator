import { describe, expect, it } from "vitest";
import { fieldGrid, fieldIndex, sampleGrid } from "../terrainField/sample";
import { heightFieldRaycast } from "./heightFieldDda";

function filled(extent: number, spacing: number, heightAt: (x: number, y: number) => number) {
  const grid = fieldGrid(extent, spacing);
  const values = new Float32Array(grid.columns * grid.rows);
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const x = grid.origin[0] + column * spacing;
      const y = grid.origin[1] + row * spacing;
      values[fieldIndex(grid, column, row)] = heightAt(x, y);
    }
  }
  return { grid, values };
}

describe("height-field DDA", () => {
  it("hits a flat lattice straight down at the stored height", () => {
    const { grid, values } = filled(20, 2, () => 7);
    const hit = heightFieldRaycast(grid, values, { origin: [1.5, -2, 20], direction: [0, 0, -1] }, 40);
    expect(hit).not.toBeNull();
    expect(hit!.point[0]).toBeCloseTo(1.5, 4);
    expect(hit!.point[1]).toBeCloseTo(-2, 4);
    expect(hit!.elevation).toBeCloseTo(7, 4);
  });

  it("follows a plane h = x from outside the frame", () => {
    const { grid, values } = filled(20, 2, x => x);
    const hit = heightFieldRaycast(grid, values, { origin: [-20, 1, 15], direction: [1, 0, -1] }, 40);
    expect(hit).not.toBeNull();
    expect(hit!.elevation).toBeCloseTo(sampleGrid(grid, values, hit!.point), 3);
    expect(hit!.point[0]).toBeGreaterThan(grid.origin[0] - 0.05);
  });

  it("misses a ray that stays above the ground", () => {
    const { grid, values } = filled(20, 2, () => 0);
    expect(heightFieldRaycast(grid, values, { origin: [0, 0, 5], direction: [1, 0, 0] }, 30)).toBeNull();
  });
});
