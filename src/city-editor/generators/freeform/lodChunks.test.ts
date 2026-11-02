import { describe, expect, it } from "vitest";
import { instanceCellKey } from "./instanceGrid";
import {
  buildChunkPositions,
  chunkLayout,
  FREEFORM_CHUNK_METERS,
  lodStepMeters,
  samplesForStep,
  sharedChunkIndices
} from "./lodChunks";

describe("freeform ground chunks", () => {
  it("steps from 1 m to 4 m as the chunk leaves the focus", () => {
    expect(lodStepMeters(100)).toBe(1);
    expect(lodStepMeters(256)).toBe(1);
    expect(lodStepMeters(257)).toBe(2);
    expect(lodStepMeters(768)).toBe(2);
    expect(lodStepMeters(769)).toBe(4);
  });

  it("shares indices and points the first triangle upward", () => {
    const samples = samplesForStep(1);
    expect(samples).toBe(65);
    expect(sharedChunkIndices(samples)).toBe(sharedChunkIndices(samples));
    const positions = buildChunkPositions([0, 0], 1, () => 3);
    expect(positions.length).toBe(samples * samples * 3);
    expect(positions[0]).toBeCloseTo(0, 6);
    expect(positions[1]).toBe(3);
    expect(positions[2]).toBeCloseTo(0, 6);
    const south = samples * 3;
    expect(positions[south + 2]).toBeCloseTo(-1, 5);
    const index = sharedChunkIndices(samples);
    const edge = (from: number, to: number) => [
      positions[to * 3] - positions[from * 3],
      positions[to * 3 + 1] - positions[from * 3 + 1],
      positions[to * 3 + 2] - positions[from * 3 + 2]
    ];
    const a = index[0];
    const b = index[1];
    const c = index[2];
    const ab = edge(a, b);
    const ac = edge(a, c);
    const normalY = ab[2] * ac[0] - ab[0] * ac[2];
    expect(normalY).toBeGreaterThan(0);
  });

  it("covers a 2,400 m frame with a fine centre and a coarse rim", () => {
    const chunks = chunkLayout(2400, [0, 0]);
    expect(chunks.length).toBe(38 * 38);
    const centre = chunks.find(chunk => chunk.column === 19 && chunk.row === 19);
    const corner = chunks[0];
    expect(centre?.stepMeters).toBe(1);
    expect(corner.stepMeters).toBe(4);
    expect(corner.origin[0]).toBe(-19 * FREEFORM_CHUNK_METERS);
  });

  it("bins instances into 128 m cells", () => {
    expect(instanceCellKey([10, -10])).toBe("0:-1");
    expect(instanceCellKey([128, 128])).toBe("1:1");
  });
});
