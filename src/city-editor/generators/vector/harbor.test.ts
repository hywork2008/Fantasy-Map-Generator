import { describe, expect, it } from "vitest";
import type { Point } from "../../types/primitives";
import { polygonHarborWaterField } from "../harborNavigation";

const box = (x: number, y: number, width: number, height: number) => ({
  outer: [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height]
  ] as Point[],
  holes: []
});
const domain = [box(-46, -16, 32, 32), box(-14, -2, 34, 4), box(20, -40, 30, 80)].map(polygon => ({
  polygon,
  water: true
}));

describe("polygon harbor navigation", () => {
  it("requires a hull-width channel to an explicitly open boundary", () => {
    const open = polygonHarborWaterField(100, false, domain, true);
    expect(open.navigable([-30, 0], 1)).toBe(true);
    expect(open.navigable([-30, 0], 5)).toBe(false);
    const closed = polygonHarborWaterField(100, false, domain, false);
    expect(closed.navigable([-30, 0], 1)).toBe(false);
    expect(closed.navigable([60, 0], 1)).toBe(false);
  });
  it("blocks the only approach when depth or a fixed obstacle removes the channel", () => {
    const blocked = polygonHarborWaterField(
      100,
      false,
      [...domain, { polygon: box(-2, -3, 4, 6), water: false }],
      true
    );
    expect(blocked.navigable([-30, 0], 1)).toBe(false);
    expect(blocked.clearance([0, 0])).toBe(0);
  });
});
