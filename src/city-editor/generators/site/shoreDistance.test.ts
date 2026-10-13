import { describe, expect, it } from "vitest";
import { shoreDistanceMeters } from "./shoreDistance";

describe("distance from burg center to shoreline", () => {
  it("projects onto segments and selects the nearest shoreline run", () => {
    expect(
      shoreDistanceMeters({
        shoreline: [
          [
            [-100, 30],
            [100, 30]
          ],
          [
            [80, -20],
            [80, 20]
          ]
        ]
      })
    ).toBe(30);
    expect(
      shoreDistanceMeters({
        shoreline: [
          [
            [3, 4],
            [6, 4]
          ]
        ]
      })
    ).toBe(5);
  });
  it("uses the FMG measurement even when the exported coastline is clipped", () => {
    expect(shoreDistanceMeters({ shoreDistanceMeters: 0, shoreline: [] })).toBe(0);
    expect(shoreDistanceMeters({ shoreDistanceMeters: 250, shoreline: [] })).toBe(250);
  });
  it("leaves an unsurveyed coast unknown instead of showing zero", () => {
    expect(shoreDistanceMeters({ shoreline: [] })).toBeNull();
    expect(shoreDistanceMeters({ shoreDistanceMeters: NaN, shoreline: [] })).toBeNull();
  });
});
