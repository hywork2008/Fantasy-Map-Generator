import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { GridFeature } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { OceanCurrents } from "./oceanCurrents";

type Point = [number, number];

const OCEAN: GridFeature = { i: 1, land: false, border: true, type: "ocean" };
const LAKE: GridFeature = { i: 2, land: false, border: false, type: "lake" };
const ISLAND: GridFeature = { i: 3, land: true, border: false, type: "island" };
const FEATURES: GridFeature[] = [0 as unknown as GridFeature, OCEAN, LAKE, ISLAND];

const SPACING = 10;

/**
 * Builds a `cellsX * cellsY` raster grid fixture (row-major, matching the exact layout
 * `src/utils/graphUtils.ts`'s `placePoints()` produces in production — see `oceanCurrents.ts`'s
 * class doc comment) and runs `OceanCurrents.generate()` against it, mutating the shared
 * `worldContext` singleton the same way `frontierFortsGenerator.test.ts` does for `pack`.
 * `latN: 0, latT: 0` pins every cell to latitude 0, so a single `winds` tier (tier 2,
 * `(|0-89|/30)|0 === 2`) drives the whole fixture deterministically.
 */
function generate(options: {
  cellsX: number;
  cellsY: number;
  isLand: (x: number, y: number) => boolean;
  isLake?: (x: number, y: number) => boolean;
  temps: (x: number, y: number) => number;
  winds?: [number, number, number, number, number, number];
}) {
  const { cellsX, cellsY, isLand, isLake = () => false, temps, winds = [0, 0, 0, 0, 0, 0] } = options;
  const n = cellsX * cellsY;
  const idx = (x: number, y: number) => y * cellsX + x;

  const points: Point[] = new Array(n);
  const neighbors: number[][] = new Array(n);
  const heights = new Uint8Array(n);
  const featureIds = new Uint16Array(n);
  const tempArray = new Int8Array(n);

  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      const i = idx(x, y);
      points[i] = [x * SPACING, y * SPACING];
      const land = isLand(x, y);
      const lake = !land && isLake(x, y);
      heights[i] = land ? 30 : 5;
      featureIds[i] = land ? 3 : lake ? 2 : 1;
      tempArray[i] = temps(x, y);

      const nb: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= cellsX || ny < 0 || ny >= cellsY) continue;
          nb.push(idx(nx, ny));
        }
      }
      neighbors[i] = nb;
    }
  }

  worldContext.mapCoordinates = { latN: 0, latT: 0 } as typeof worldContext.mapCoordinates;
  worldContext.graphHeight = 1000;
  worldContext.grid = {
    spacing: SPACING,
    points,
    cellsX,
    cellsY,
    features: FEATURES,
    cells: {
      i: Uint32Array.from({ length: n }, (_, i) => i),
      c: neighbors,
      h: heights,
      f: featureIds,
      temp: tempArray
    }
  } as unknown as typeof worldContext.grid;

  const state = {
    grid: worldContext.grid,
    options: { winds }
  } as unknown as WorldState;

  OceanCurrents.generate(worldContext, viewContext, appServices, state);
  return worldContext.grid.cells;
}

describe("OceanCurrents.generate", () => {
  it("leaves land and lake cells with zero current, mirroring temp into waterTemp", () => {
    // 5x5, all ocean except a land cell at (2,2) and a lake cell at (0,0).
    const cells = generate({
      cellsX: 5,
      cellsY: 5,
      isLand: (x, y) => x === 2 && y === 2,
      isLake: (x, y) => x === 0 && y === 0,
      temps: (x, y) => (x === 2 && y === 2 ? 12 : x === 0 && y === 0 ? -3 : 15)
    });

    const landIdx = 2 * 5 + 2;
    expect(cells.currentAngle[landIdx]).toBe(0);
    expect(cells.currentSpeed[landIdx]).toBe(0);
    expect(cells.waterTemp[landIdx]).toBe(12);

    const lakeIdx = 0;
    expect(cells.currentAngle[lakeIdx]).toBe(0);
    expect(cells.currentSpeed[lakeIdx]).toBe(0);
    expect(cells.waterTemp[lakeIdx]).toBe(-3);
  });

  it("gives every open-ocean cell a positive speed, aligned with the wind, when nothing blocks it", () => {
    const cells = generate({
      cellsX: 10,
      cellsY: 10,
      isLand: () => false,
      temps: () => 15,
      winds: [0, 0, 0, 0, 0, 0] // due east everywhere
    });

    for (let i = 0; i < 100; i++) {
      expect(cells.currentSpeed[i]).toBeGreaterThan(0);
      // Due-east forcing with nothing to deflect off: direction stays close to 0 degrees
      // (allowing for angle wraparound near 0/360).
      const angle = cells.currentAngle[i];
      const distanceFromZero = Math.min(angle, 360 - angle);
      expect(distanceFromZero).toBeLessThan(15);
    }
  });

  it("damps speed for cells directly adjacent to a coastline relative to open ocean far from any coast", () => {
    // A 20x12 grid: land fills the entire top-right quadrant-ish block (rows 0-5, cols 12-19),
    // wind blows north-east straight into that coastline. The no-slip bounce-back boundary means
    // fluid cells touching land lose tangential speed relative to cells deep in open water.
    const cellsX = 20;
    const cellsY = 12;
    const isLand = (x: number, y: number) => y < 6 && x >= 12;

    const cells = generate({
      cellsX,
      cellsY,
      isLand,
      temps: () => 15,
      winds: [45, 45, 45, 45, 45, 45] // toward the NE landmass
    });

    // Coastal cell: open water immediately south-west of the landmass corner.
    const coastalIdx = 6 * cellsX + 11;
    // Far cell: deep open water, bottom-left corner, several cells from any land in every direction.
    const farIdx = 10 * cellsX + 2;
    expect(cells.currentSpeed[coastalIdx]).toBeLessThan(cells.currentSpeed[farIdx]);
  });

  it("advects temperature toward the upstream cell along the resolved current direction", () => {
    // Three ocean cells in a due-east row: 0 -> 1 -> 2. Cell 0 is seeded much warmer than
    // cell 2; since the current flows from 0 toward 2, cell 2's waterTemp should be pulled up
    // from its own baseline toward cell 0/1's warmth, landing strictly between the two extremes.
    const cells = generate({
      cellsX: 3,
      cellsY: 1,
      isLand: () => false,
      temps: (x, _y) => (x === 0 ? 30 : x === 1 ? 30 : 0),
      winds: [0, 0, 0, 0, 0, 0] // due east: flows 0 -> 1 -> 2
    });

    expect(cells.waterTemp[2]).toBeGreaterThan(0);
    expect(cells.waterTemp[2]).toBeLessThanOrEqual(30);
  });

  it("sustains along-shore (tangential) flow across the length of a coastline, not just near the point of impact", () => {
    // A 30x14 grid with a straight coastal segment along row 0, columns 4..21 (18 cells long),
    // with open water beyond both ends (so the segment has a definite start/end, unlike an
    // infinite periodic wall). Wind blows mostly north (into the coast) with a modest eastward
    // tangential bias — the claim under test is that the along-shore component this produces
    // stays substantial across the *entire* length of the run, rather than the old heuristic's
    // failure mode of fading back toward the raw wind angle a short distance from any one point.
    const cellsX = 30;
    const cellsY = 14;
    const isLand = (x: number, y: number) => y === 0 && x >= 4 && x <= 21;
    // 260 degrees: predominantly -y (toward the row-0 coastline) with a modest -x component.
    const winds: [number, number, number, number, number, number] = [260, 260, 260, 260, 260, 260];

    const cells = generate({ cellsX, cellsY, isLand, temps: () => 15, winds });

    const row = 1; // just south of the coastline
    const sampleXs = [6, 12, 18]; // spread across the 18-cell-long coastal run
    const tangentialSpeeds = sampleXs.map(x => {
      const idx = row * cellsX + x;
      const angleRad = (cells.currentAngle[idx] * Math.PI) / 180;
      const speed = cells.currentSpeed[idx];
      return Math.abs(Math.cos(angleRad) * speed); // |x-component| of the resolved current
    });

    for (const speed of tangentialSpeeds) expect(speed).toBeGreaterThan(0);

    const maxSpeed = Math.max(...tangentialSpeeds);
    for (const speed of tangentialSpeeds) expect(speed).toBeGreaterThan(maxSpeed * 0.3);
  });

  it("is deterministic for identical inputs", () => {
    const fixture = {
      cellsX: 6,
      cellsY: 6,
      isLand: (x: number, y: number) => x === 4 && y === 4,
      temps: (x: number, y: number) => 10 + x + y,
      winds: [30, 60, 90, 120, 150, 180] as [number, number, number, number, number, number]
    };

    const first = generate(fixture);
    const firstAngle = Array.from(first.currentAngle);
    const firstSpeed = Array.from(first.currentSpeed);
    const firstTemp = Array.from(first.waterTemp);
    const firstAmbient = Array.from(first.ambientCurrentSpeed);

    const second = generate(fixture);
    expect(Array.from(second.currentAngle)).toEqual(firstAngle);
    expect(Array.from(second.currentSpeed)).toEqual(firstSpeed);
    expect(Array.from(second.waterTemp)).toEqual(firstTemp);
    expect(Array.from(second.ambientCurrentSpeed)).toEqual(firstAmbient);
  });

  describe("ambientCurrentSpeed (harbor-siting enclosure signal)", () => {
    it("leaves land and lake cells at zero, same as currentSpeed", () => {
      const cells = generate({
        cellsX: 5,
        cellsY: 5,
        isLand: (x, y) => x === 2 && y === 2,
        isLake: (x, y) => x === 0 && y === 0,
        temps: () => 15
      });

      expect(cells.ambientCurrentSpeed[2 * 5 + 2]).toBe(0);
      expect(cells.ambientCurrentSpeed[0]).toBe(0);
    });

    it("reads a damped coastal cell closer to nearby open-water speed than the raw currentSpeed does", () => {
      // Same land-block fixture as the "damps speed for cells directly adjacent to a coastline"
      // test above: raw currentSpeed at the coastal cell is suppressed by the no-slip boundary
      // layer regardless of whether this coastline happens to be sheltered or exposed.
      // ambientCurrentSpeed should partially see past that by pulling in nearby open-water speed.
      const cellsX = 20;
      const cellsY = 12;
      const isLand = (x: number, y: number) => y < 6 && x >= 12;

      const cells = generate({
        cellsX,
        cellsY,
        isLand,
        temps: () => 15,
        winds: [45, 45, 45, 45, 45, 45]
      });

      const coastalIdx = 6 * cellsX + 11;
      const farIdx = 10 * cellsX + 2;

      expect(cells.ambientCurrentSpeed[coastalIdx]).toBeGreaterThan(cells.currentSpeed[coastalIdx]);

      const rawGap = cells.currentSpeed[farIdx] - cells.currentSpeed[coastalIdx];
      const ambientGap = cells.currentSpeed[farIdx] - cells.ambientCurrentSpeed[coastalIdx];
      expect(ambientGap).toBeLessThan(rawGap);
    });

    it("stays low deep inside a narrow dead-end inlet, rising toward its mouth where open water is only a hop away", () => {
      // A 30x16 grid, land confined to a corner block (x >= 20, y < 8 — leaving most of the map
      // open water, same proportions as the "damps speed for coastal cells" fixture above) except
      // a 1-cell-wide dead-end corridor along row 4, columns 20..25 (open water beyond both ends
      // of that range is land, so it's a true pocket, not a through-channel). Open ocean drives
      // real current speed that only reaches the corridor's interior through repeated averaging,
      // hop by hop.
      const cellsX = 30;
      const cellsY = 16;
      const isLand = (x: number, y: number) => x >= 20 && y < 8 && !(y === 4 && x <= 25);

      const cells = generate({
        cellsX,
        cellsY,
        isLand,
        temps: () => 15,
        winds: [0, 0, 0, 0, 0, 0] // due east, straight into the coastline/inlet mouth
      });

      const mouthIdx = 4 * cellsX + 20; // corridor cell closest to open water
      const deepIdx = 4 * cellsX + 25; // corridor cell at the dead end

      expect(cells.ambientCurrentSpeed[mouthIdx]).toBeGreaterThan(cells.ambientCurrentSpeed[deepIdx]);
    });
  });
});
