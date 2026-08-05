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

/**
 * A bay cell ringed by 5 land cells with a single ocean exit, leading through a 3-cell
 * fjord-like corridor (2 land walls flanking each corridor cell) before opening into a long run of
 * genuinely open water. Tuned (see EXPOSURE_BFS_RADIUS = 6) so the bay's BFS openness lands around
 * 0.5 while the open-water end reads a full 1.0 — enough separation to exercise both the
 * exposure-based speed damping and exit-funneling steps deterministically. The open-water run is
 * deliberately longer than PIN_DISTANCE (40) so its far end is a genuinely pinned "free stream"
 * cell — without one, this whole fixture is a small closed pocket with no driving boundary
 * condition, and the low-SELF_WEIGHT relaxation decays everything toward zero over many passes
 * rather than settling near the seeded wind, which isn't representative of a real map (always
 * connected to a large enough open ocean to have pinned cells somewhere).
 */
function buildBayFixture(): {
  points: Point[];
  neighbors: number[][];
  heights: number[];
  featureIds: number[];
  bay: number;
  far: number;
} {
  const points: Point[] = [];
  const neighbors: number[][] = [];
  const heights: number[] = [];
  const featureIds: number[] = [];
  let nextId = 0;

  const push = (p: Point, land: boolean): number => {
    points.push(p);
    neighbors.push([]);
    heights.push(land ? 30 : 5);
    featureIds.push(land ? 3 : 1); // ISLAND : OCEAN
    return nextId++;
  };
  const link = (a: number, b: number): void => {
    neighbors[a].push(b);
    neighbors[b].push(a);
  };

  const bay = push([0, 0], false);
  const landAngles = [-150, -90, -30, 30, 90]; // degrees; leaves the +y (south) side open
  for (const deg of landAngles) {
    const rad = (deg * Math.PI) / 180;
    link(bay, push([Math.cos(rad) * 10, Math.sin(rad) * 10], true));
  }

  let prev = bay;
  let y = 10;
  for (let i = 0; i < 3; i++) {
    const corridorCell = push([0, y], false);
    link(prev, corridorCell);
    link(corridorCell, push([-8, y], true));
    link(corridorCell, push([8, y], true));
    prev = corridorCell;
    y += 10;
  }

  let far = prev;
  for (let i = 0; i < 45; i++) {
    const openCell = push([0, y], false);
    link(prev, openCell);
    prev = openCell;
    far = openCell;
    y += 10;
  }

  return { points, neighbors, heights, featureIds, bay, far };
}

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

  it("bends around a land corner instead of only losing speed head-on", () => {
    // Tip cell 1 sits just southwest of a land corner (cell 0, to its northeast); its only
    // other neighbor (cell 2) lies due south. Wind blows due east (angle 0), straight into the
    // corner's exposed NE-facing side — a full mirror reflection off that 45°-angled boundary
    // should redirect the flow toward the open south side rather than merely damping it in place.
    const points: Point[] = [
      [10, -10], // 0: land, NE of tip
      [0, 0], // 1: tip (ocean)
      [0, 10], // 2: ocean, south of tip
      [0, 20] // 3: ocean, further south
    ];
    const neighbors = [
      [1], // 0 land
      [0, 2], // 1 tip
      [1, 3], // 2
      [2] // 3
    ];
    const heights = [30, 5, 5, 5];
    const featureIds = [3, 1, 1, 1];
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

    expect(cells.currentSpeed[1]).toBeGreaterThan(0);
    // Contrast with the unobstructed-field test above, which stays under 20° with nothing to
    // deflect off of: a real corner measurably rotates the current away from the raw wind angle.
    expect(cells.currentAngle[1]).toBeGreaterThan(20);
  });

  it("propagates a headland's bend well beyond a single cell, unlike a small-radius-only scheme", () => {
    // A 25-cell chain running away from a single land corner (same NE corner as the previous
    // test), long enough that a fixed, small deflection radius (e.g. the old ~6-pass version of
    // this algorithm) could never show any effect past its first few cells. PIN_DISTANCE (40)
    // isn't reached within this chain, so every cell here is still in the free-relaxing influence
    // zone — this test is specifically about how *far* that zone's bending reaches, not about the
    // pinned far-field boundary (covered by the bay/funnel test above).
    const N = 25;
    const points: Point[] = [[10, -10]];
    for (let i = 0; i < N; i++) points.push([0, i * 10]);
    const neighbors: number[][] = [[1]];
    for (let i = 0; i < N; i++) {
      const self = i + 1;
      const nb: number[] = [];
      if (i === 0) nb.push(0);
      if (i > 0) nb.push(self - 1);
      if (i < N - 1) nb.push(self + 1);
      neighbors.push(nb);
    }
    const heights = [30, ...Array(N).fill(5)];
    const featureIds = [3, ...Array(N).fill(1)];
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

    // 10 hops from the corner: still measurably bent away from the raw 0° wind angle.
    expect(cells.currentAngle[10]).toBeGreaterThan(2);
    // 20 hops from the corner: the bend has faded back out, close to the raw wind angle again —
    // this isn't "bending reaches everywhere," it's a bounded, physically plausible falloff.
    expect(cells.currentAngle[20]).toBeLessThan(2);
  });

  it("damps and funnels current inside an enclosed bay toward its one narrow exit", () => {
    const { points, neighbors, heights, featureIds, bay, far } = buildBayFixture();
    const temps = points.map(() => 15);

    // Wind at 60° has a real southward component aligned with the corridor's north-south axis
    // (unlike due-east, which is perpendicular to it and would legitimately drive ~no along-
    // corridor flow at all — not a useful case for testing damping/funneling specifically).
    const cells = generate({
      points,
      neighbors,
      heights,
      featureIds,
      features: FEATURES,
      temps,
      winds: [60, 60, 60, 60, 60, 60]
    });

    // The bay (5 land neighbors, one narrow fjord-like exit) is far more enclosed than the pinned,
    // genuinely open water at the far end of the chain, so its resolved speed should be a small
    // fraction of the open water's — not just "somewhat less," which a naive land-adjacency check
    // could also produce.
    expect(cells.currentSpeed[bay]).toBeGreaterThan(0);
    expect(cells.currentSpeed[bay]).toBeLessThan(cells.currentSpeed[far] * 0.5);
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
