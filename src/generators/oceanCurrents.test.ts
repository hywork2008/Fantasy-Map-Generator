import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { GridFeature } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { OceanCurrents } from "./oceanCurrents";

type Point = [number, number];

interface GridFixtureOptions {
  points: Point[];
  neighbors: number[][];
  heights: number[];
  featureIds: number[];
  features: GridFeature[];
  temps: number[];
  winds?: [number, number, number, number, number, number];
}

/**
 * Builds a minimal `grid` fixture and runs `OceanCurrents.generate()` against it, mutating the
 * shared `worldContext` singleton the same way `frontierFortsGenerator.test.ts` does for `pack`.
 * `latN: 0, latT: 0` pins every cell to latitude 0 regardless of its y coordinate, so a single
 * `winds` tier (tier 2, `(|0-89|/30)|0 === 2`) drives the whole fixture deterministically.
 */
function generate(options: GridFixtureOptions) {
  const { points, neighbors, heights, featureIds, features, temps, winds = [0, 0, 0, 0, 0, 0] } = options;
  const n = points.length;

  worldContext.mapCoordinates = { latN: 0, latT: 0 } as typeof worldContext.mapCoordinates;
  worldContext.graphHeight = 1000;
  worldContext.grid = {
    spacing: 10,
    points,
    cellsX: n,
    cellsY: 1,
    features,
    cells: {
      i: Uint32Array.from(points.map((_, i) => i)),
      c: neighbors,
      h: Uint8Array.from(heights),
      f: Uint16Array.from(featureIds),
      temp: Int8Array.from(temps)
    }
  } as unknown as typeof worldContext.grid;

  const state = {
    grid: worldContext.grid,
    options: { winds }
  } as unknown as WorldState;

  OceanCurrents.generate(worldContext, viewContext, appServices, state);
  return worldContext.grid.cells;
}

const OCEAN: GridFeature = { i: 1, land: false, border: true, type: "ocean" };
const LAKE: GridFeature = { i: 2, land: false, border: false, type: "lake" };
const ISLAND: GridFeature = { i: 3, land: true, border: false, type: "island" };
const FEATURES: GridFeature[] = [0 as unknown as GridFeature, OCEAN, LAKE, ISLAND];

describe("OceanCurrents.generate", () => {
  it("leaves land and lake cells with zero current, mirroring temp into waterTemp", () => {
    const cells = generate({
      points: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      neighbors: [[1], [0, 2], [1]],
      heights: [30, 5, 5], // cell 0 is land
      featureIds: [3, 1, 2], // island, ocean, lake
      features: FEATURES,
      temps: [12, 18, -3]
    });

    // Land cell: no current, waterTemp mirrors temp.
    expect(cells.currentAngle[0]).toBe(0);
    expect(cells.currentSpeed[0]).toBe(0);
    expect(cells.waterTemp[0]).toBe(12);

    // Lake cell (cell 2): not open ocean, so no current either, waterTemp mirrors temp.
    expect(cells.currentAngle[2]).toBe(0);
    expect(cells.currentSpeed[2]).toBe(0);
    expect(cells.waterTemp[2]).toBe(-3);
  });

  it("gives every open-ocean cell a positive speed when nothing blocks the seeded wind", () => {
    const cells = generate({
      points: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      neighbors: [[1], [0, 2], [1]],
      heights: [5, 5, 5],
      featureIds: [1, 1, 1],
      features: FEATURES,
      temps: [15, 15, 15],
      winds: [0, 0, 0, 0, 0, 0] // due east everywhere
    });

    for (const cellId of [0, 1, 2]) {
      expect(cells.currentSpeed[cellId]).toBeGreaterThan(0);
      // Due-east seed with no land nearby: direction stays close to 0 degrees.
      expect(cells.currentAngle[cellId]).toBeLessThan(20);
    }
  });

  it("damps current speed for cells directly blocked by land, relative to cells far from any coast", () => {
    // A 9-cell cycle (cell 0 is land); cells 1 and 8 are its ring neighbors and are positioned
    // east of it, so the due-east seed wind drives straight into land at those two cells. Cells
    // 3-6 are 3+ ring-hops away and never reference land in their own reflection step.
    const points: Point[] = [
      [1000, 0], // 0: land
      [990, 0], // 1: ocean, adjacent to land, land lies to its east
      [980, 0], // 2
      [970, 0], // 3
      [960, 0], // 4: farthest from land by ring distance
      [950, 0], // 5: farthest from land by ring distance
      [940, 0], // 6
      [930, 0], // 7
      [990, -10] // 8: ocean, adjacent to land, land lies to its east
    ];
    const neighbors = points.map((_, i) => [(i + 8) % 9, (i + 1) % 9]);
    const heights = points.map((_, i) => (i === 0 ? 30 : 5));
    const featureIds = points.map((_, i) => (i === 0 ? 3 : 1));
    const temps = points.map(() => 15);

    const cells = generate({
      points,
      neighbors,
      heights,
      featureIds,
      features: FEATURES,
      temps,
      winds: [0, 0, 0, 0, 0, 0]
    });

    const coastalSpeed = Math.min(cells.currentSpeed[1], cells.currentSpeed[8]);
    const farSpeed = Math.max(cells.currentSpeed[4], cells.currentSpeed[5]);
    expect(coastalSpeed).toBeLessThan(farSpeed);
  });

  it("advects temperature toward the upstream cell along the resolved current direction", () => {
    // Three ocean cells in a due-east chain: 0 -> 1 -> 2. Cell 0 is seeded much warmer than
    // cell 2; since the current flows from 0 toward 2, cell 2's waterTemp should be pulled up
    // from its own baseline toward cell 0/1's warmth, landing strictly between the two extremes.
    const cells = generate({
      points: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      neighbors: [[1], [0, 2], [1]],
      heights: [5, 5, 5],
      featureIds: [1, 1, 1],
      features: FEATURES,
      temps: [30, 30, 0],
      winds: [0, 0, 0, 0, 0, 0] // due east: flows 0 -> 1 -> 2
    });

    expect(cells.waterTemp[2]).toBeGreaterThan(0);
    expect(cells.waterTemp[2]).toBeLessThanOrEqual(30);
  });

  it("is deterministic for identical inputs", () => {
    const fixture: GridFixtureOptions = {
      points: [
        [0, 0],
        [10, 0],
        [20, 0],
        [20, 10]
      ],
      neighbors: [[1], [0, 2], [1, 3], [2]],
      heights: [5, 5, 30, 5],
      featureIds: [1, 1, 3, 1],
      features: FEATURES,
      temps: [10, 12, 14, 16],
      winds: [30, 60, 90, 120, 150, 180]
    };

    const first = generate(fixture);
    const firstAngle = Array.from(first.currentAngle);
    const firstSpeed = Array.from(first.currentSpeed);
    const firstTemp = Array.from(first.waterTemp);

    const second = generate(fixture);
    expect(Array.from(second.currentAngle)).toEqual(firstAngle);
    expect(Array.from(second.currentSpeed)).toEqual(firstSpeed);
    expect(Array.from(second.waterTemp)).toEqual(firstTemp);
  });
});
