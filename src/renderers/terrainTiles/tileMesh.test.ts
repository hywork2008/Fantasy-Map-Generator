import { describe, expect, it } from "vitest";
import { ALPINE_TILE_PALETTE, buildTileMesh, tileLandColor } from "./tileMesh";

describe("buildTileMesh", () => {
  it("adds a skirt below the edge and keeps sea and no-data at sea level", () => {
    const n = 3;
    const data = new Int16Array([200, 200, 200, 200, 400, 200, -32768, -20, 200]);
    const mesh = buildTileMesh({
      data,
      samples: n,
      unitMeters: 0.5,
      nodata: -32768,
      originX: 0,
      originZ: 0,
      stepX: 1,
      stepZ: 1,
      worldYPerMeter: 0.01,
      skirtMeters: 100,
      hillshade: false
    });
    expect(mesh.vertexCount).toBe(9 + 8);
    expect(mesh.indices.length).toBe((4 * 2 + 8 * 2) * 3);
    expect(mesh.positions[4 * 3 + 1]).toBeCloseTo(2);
    expect(mesh.positions[6 * 3 + 1]).toBe(0);
    expect(mesh.positions[7 * 3 + 1]).toBe(0);
    // First skirt vertex hangs under the north-west corner.
    expect(mesh.positions[9 * 3 + 1]).toBeCloseTo(1 - 1);
    expect(Math.max(...mesh.indices)).toBe(16);
  });

  it("drops the stored border and shades the edge with it", () => {
    // 2×2 tile with a 1-sample border; the border rises to the east.
    const data = new Int16Array(16);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) data[j * 4 + i] = i * 200;
    const input = {
      data,
      samples: 2,
      unitMeters: 1,
      nodata: -32768,
      originX: 0,
      originZ: 0,
      stepX: 1,
      stepZ: 1,
      worldYPerMeter: 0.01,
      skirtMeters: 0
    };
    const mesh = buildTileMesh({ ...input, border: 1 });
    expect(mesh.vertexCount).toBe(4 + 4);
    expect(mesh.positions[0]).toBe(0);
    expect(mesh.positions[1]).toBeCloseTo(2);
    // Both columns sit on the same slope, so they shade alike (no seam at the edge).
    expect(mesh.colors[0] / mesh.colors[3]).toBeCloseTo(tileLandColor(200)[0] / tileLandColor(400)[0], 5);
  });

  it("lets adjustMeters lower land only, never below sea level", () => {
    const data = new Int16Array([100, 0, 100, 100]);
    const mesh = buildTileMesh({
      data,
      samples: 2,
      unitMeters: 1,
      nodata: -32768,
      originX: 0,
      originZ: 0,
      stepX: 1,
      stepZ: 1,
      worldYPerMeter: 1,
      skirtMeters: 0,
      hillshade: false,
      adjustMeters: (x, _z, m) => (x === 0 ? m - 40 : m - 500)
    });
    expect(mesh.positions[1]).toBeCloseTo(60);
    expect(mesh.positions[3 * 1 + 1]).toBe(0);
    expect(mesh.positions[3 * 3 + 1]).toBeCloseTo(0.5);
  });

  it("paints steep Alpine slopes as rock and leaves the Japan palette alone", () => {
    // 3×3 tile rising 100 m per sample (100 m apart): a 45° slope, at 1,000–1,200 m.
    const data = new Int16Array(9);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) data[j * 3 + i] = 1000 + i * 100;
    const input = {
      data,
      samples: 3,
      unitMeters: 1,
      nodata: -32768,
      originX: 0,
      originZ: 0,
      stepX: 1,
      stepZ: 1,
      worldYPerMeter: 0.01,
      skirtMeters: 0,
      hillshade: false,
      stepMeters: 100
    };
    const japan = buildTileMesh(input);
    expect([...japan.colors.subarray(12, 15)].map(v => +v.toFixed(4))).toEqual(
      tileLandColor(1100).map(v => +v.toFixed(4))
    );
    const alps = buildTileMesh({ ...input, palette: ALPINE_TILE_PALETTE });
    const rock = ALPINE_TILE_PALETTE.rock?.color ?? [0, 0, 0];
    for (let c = 0; c < 3; c++) expect(alps.colors[12 + c]).toBeCloseTo(rock[c], 5);
    // Flat ground keeps the height colour.
    const flat = buildTileMesh({ ...input, data: new Int16Array(9).fill(1100), palette: ALPINE_TILE_PALETTE });
    expect(flat.colors[12]).toBeCloseTo(tileLandColor(1100, ALPINE_TILE_PALETTE.ramp)[0], 5);
  });
});
