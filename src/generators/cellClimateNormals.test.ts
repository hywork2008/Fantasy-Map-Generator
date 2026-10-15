import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { ensureCellClimateNormals, getCellClimateNormals } from "./cellClimateNormals";

function fixture(lonW = 170, lonT = 20): WorldContext {
  return {
    mapId: 1,
    graphWidth: 100,
    graphHeight: 100,
    mapCoordinates: { latN: 20, latT: 40, lonW, lonT },
    options: { axialTilt: 23.5 },
    grid: {
      points: [
        [50, 50],
        [55, 50],
        [95, 50]
      ],
      features: [{ type: "land" }, { type: "ocean" }, { type: "lake" }],
      cells: {
        i: new Uint32Array([0, 1, 2]),
        c: [[1], [0, 2], [1]],
        h: new Uint8Array([50, 10, 50]),
        f: new Uint8Array([0, 1, 0]),
        temp: new Int8Array([4, 4, 4]),
        prec: new Uint8Array([5, 5, 5])
      }
    }
  } as unknown as WorldContext;
}
describe("cell climate normals", () => {
  it("uses geographical distances across the date line and is invariant under longitude translation", () => {
    const a = getCellClimateNormals(fixture(), 0, 2024)!;
    const b = getCellClimateNormals(fixture(-10), 0, 2024)!;
    expect(a.continentalitySource).toBe("mappedCoast");
    expect(a.continentality).toBeCloseTo(b.continentality, 6);
    expect(Array.from(a.monthlyMeanTemperatureC)).toEqual(Array.from(b.monthlyMeanTemperatureC));
    expect(a.annualPrecipitationMm).toBe(500);
    expect(a.monthlyPrecipitationMm.reduce((x, y) => x + y, 0)).toBeCloseTo(500, 10);
  });
  it("marks uncertain regional edges and missing or lake-only coasts as explicit fallbacks", () => {
    const world = fixture();
    expect(getCellClimateNormals(world, 2, 2024)!.continentalitySource).toBe("regionalFallback");
    world.grid.features[1].type = "lake";
    const normal = getCellClimateNormals(world, 0, 2024)!;
    expect(normal.continentality).toBe(0.5);
    expect(normal.continentalitySource).toBe("regionalFallback");
  });
  it("does not join regional edges; global longitude is connected", () => {
    const world = fixture(-180, 360);
    world.mapCoordinates.latN = 90;
    world.mapCoordinates.latT = 180;
    world.grid.points = [
      [1, 50],
      [99, 50],
      [50, 50]
    ];
    expect(getCellClimateNormals(world, 0, 2024)!.continentalitySource).toBe("mappedCoast");
    world.mapCoordinates.lonT = 20;
    expect(getCellClimateNormals(world, 0, 2024)!.continentalitySource).toBe("regionalFallback");
  });
  it("reuses geography and invalidates climate for in-place edits, leap years and map changes", () => {
    const world = fixture();
    const initial = ensureCellClimateNormals(world, 2023);
    expect(ensureCellClimateNormals(world, 2023)).toBe(initial);
    world.grid.cells.temp[0]++;
    const edited = ensureCellClimateNormals(world, 2023);
    expect(edited.revision).not.toBe(initial.revision);
    expect(edited.geography).toBe(initial.geography);
    world.grid.cells.prec[0]++;
    expect(ensureCellClimateNormals(world, 2023).revision).not.toBe(edited.revision);
    const leap = ensureCellClimateNormals(world, 2024);
    expect(leap.revision).not.toBe(edited.revision);
    world.grid.cells.h[0] = 10;
    expect(ensureCellClimateNormals(world, 2024).geography).not.toBe(leap.geography);
    const beforeMap = ensureCellClimateNormals(world, 2024);
    world.mapId++;
    expect(ensureCellClimateNormals(world, 2024).revision).not.toBe(beforeMap.revision);
  });
  it("returns independent arrays so readers cannot mutate cached monthly means", () => {
    const world = fixture();
    const normal = getCellClimateNormals(world, 0, 2024)!;
    normal.monthlyMeanTemperatureC[0] = 100;
    expect(getCellClimateNormals(world, 0, 2024)!.monthlyMeanTemperatureC[0]).toBe(4);
    expect(getCellClimateNormals(world, 0.5, 2024)).toBeNull();
  });
  it("adds only the seasonal deviation of the slope offset, keeping the annual mean at grid temp", () => {
    const size = 5;
    const points: [number, number][] = [];
    const c: number[][] = [];
    const h: number[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        points.push([x * 20, y * 20]);
        h.push(40 + y * 10); // terrain falls toward the north
        c.push(
          [
            x > 0 && y * size + x - 1,
            x < size - 1 && y * size + x + 1,
            y > 0 && (y - 1) * size + x,
            y < size - 1 && (y + 1) * size + x
          ].filter((v): v is number => v !== false)
        );
      }
    const n = size * size;
    const world = {
      mapId: 2,
      graphWidth: 100,
      graphHeight: 100,
      distanceScale: 3,
      mapCoordinates: { latN: 48, latT: 4, lonW: 0, lonT: 4 },
      options: { axialTilt: 23.5 },
      grid: {
        points,
        features: [{ type: "land" }],
        cells: {
          i: Uint32Array.from({ length: n }, (_, i) => i),
          c,
          h: Uint8Array.from(h),
          f: new Uint8Array(n),
          temp: new Int8Array(n).fill(5),
          prec: new Uint8Array(n).fill(5)
        }
      }
    } as unknown as WorldContext;
    const normals = getCellClimateNormals(world, 12, 2023)!;
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const mean = normals.monthlyMeanTemperatureC.reduce((sum, t, m) => sum + t * days[m], 0) / 365;
    expect(mean).toBeCloseTo(5, 4);
    expect(normals.terrainOffsetC.some(v => Math.abs(v) > 0.1)).toBe(true);
    expect(normals.terrainOffsetC.reduce((sum, t, m) => sum + t * days[m], 0) / 365).toBeCloseTo(0, 4);
  });
});
