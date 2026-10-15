import { describe, expect, it } from "vitest";
import { computeTerrainAspect } from "./terrainAspect";

/** size×size square lattice, 10 map units apart, 4-neighbour topology. */
function lattice(size: number, height: (x: number, y: number) => number) {
  const points: [number, number][] = [];
  const neighbors: number[][] = [];
  const heights: number[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      points.push([x * 10, y * 10]);
      heights.push(height(x, y));
      const around: number[] = [];
      if (x > 0) around.push(y * size + x - 1);
      if (x < size - 1) around.push(y * size + x + 1);
      if (y > 0) around.push((y - 1) * size + x);
      if (y < size - 1) around.push((y + 1) * size + x);
      neighbors.push(around);
    }
  return { points, neighbors, heights };
}

const run = (grid: ReturnType<typeof lattice>, latitude = 46) =>
  computeTerrainAspect({ ...grid, kmPerUnit: 3, heightExponent: 1.8, latitudeOf: () => latitude, axialTiltDeg: 23.5 });

describe("terrain aspect", () => {
  // Screen y grows southward, so height rising with y means terrain falls toward the north.
  const northFlank = lattice(5, (_x, y) => 40 + y * 10);

  it("finds a north-facing flank and cools it in the northern hemisphere", () => {
    const result = run(northFlank);
    const centre = 12;
    expect(Math.min(result.aspectDeg[centre], 360 - result.aspectDeg[centre])).toBeLessThan(1);
    expect(result.dominance[centre]).toBeGreaterThan(0.9);
    expect(result.annualOffsetC[centre]).toBeLessThan(0);
    expect(result.monthlyOffsetC[centre * 12 + 0]).toBeLessThan(result.monthlyOffsetC[centre * 12 + 6]);
  });

  it("warms the same flank in the southern hemisphere (it faces the equator there)", () => {
    expect(run(northFlank, -46).annualOffsetC[12]).toBeGreaterThan(0);
  });

  it("gives a symmetric summit almost no offset", () => {
    const peak = lattice(5, (x, y) => 90 - 10 * (Math.abs(x - 2) + Math.abs(y - 2)));
    const result = run(peak);
    expect(result.dominance[12]).toBeLessThan(0.05);
    expect(Math.abs(result.annualOffsetC[12])).toBeLessThan(0.05);
  });

  it("leaves water and flat land at zero and disables itself without a scale", () => {
    const flat = run(lattice(3, () => 30));
    expect(Array.from(flat.annualOffsetC)).toEqual(new Array(9).fill(0));
    const water = run(lattice(3, (_x, y) => (y === 1 ? 10 : 40 + y)));
    expect(water.annualOffsetC[4]).toBe(0);
    const unscaled = computeTerrainAspect({
      ...northFlank,
      kmPerUnit: 0,
      heightExponent: 1.8,
      latitudeOf: () => 46,
      axialTiltDeg: 23.5
    });
    expect(Array.from(unscaled.annualOffsetC).every(v => v === 0)).toBe(true);
  });

  it("scales with relief: low hills cool less than high mountains", () => {
    const low = run(lattice(5, (_x, y) => 22 + y));
    const high = run(northFlank);
    expect(low.annualOffsetC[12]).toBeLessThan(0);
    expect(low.annualOffsetC[12]).toBeGreaterThan(high.annualOffsetC[12]);
  });
});
