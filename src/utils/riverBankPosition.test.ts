import { describe, expect, it } from "vitest";
import { riverBankCandidates } from "./riverBankPosition";

describe("actual local river bank", () => {
  it("places both candidates outside a 7km channel", () => {
    const result = riverBankCandidates(
      [0, 0],
      [
        { point: [0, -10000], physicalWidth: 7000, renderedWidth: 6000 },
        { point: [0, 10000], physicalWidth: 7000, renderedWidth: 6000 }
      ],
      50
    );
    expect(result.map(c => Math.abs(c.point[0]))).toEqual([3550, 3550]);
    expect(new Set(result.map(c => c.bank))).toEqual(new Set(["left", "right"]));
  });
  it("interpolates local width and prefers the existing bank instead of using mouth width", () => {
    const result = riverBankCandidates(
      [300, 0],
      [
        { point: [0, -100], physicalWidth: 100, renderedWidth: 100 },
        { point: [0, 100], physicalWidth: 300, renderedWidth: 300 }
      ],
      10
    );
    expect(result[0]).toMatchObject({ point: [110, 0], width: 200 });
  });
  it("ignores zero-length river pieces", () => {
    expect(
      riverBankCandidates(
        [0, 0],
        [
          { point: [0, 0], physicalWidth: 7, renderedWidth: 7 },
          { point: [0, 0], physicalWidth: 7, renderedWidth: 7 }
        ],
        1
      )
    ).toEqual([]);
  });
});
