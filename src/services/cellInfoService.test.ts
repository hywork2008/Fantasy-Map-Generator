import { describe, expect, it } from "vitest";
import { resolveCellAirTemperatures } from "./cellInfoService";

describe("resolveCellAirTemperatures", () => {
  it("prefers the live seasonal temperature for the current value", () => {
    expect(resolveCellAirTemperatures(Int8Array.from([13]), Int8Array.from([0]), 0)).toEqual({
      current: 0,
      annual: 13
    });
  });

  it("falls back to the annual average when seasonalTemp is missing", () => {
    expect(resolveCellAirTemperatures(Int8Array.from([8]), undefined, 0)).toEqual({
      current: 8,
      annual: 8
    });
  });

  it("returns nulls when the grid cell has no temperature", () => {
    expect(resolveCellAirTemperatures(undefined, undefined, 0)).toEqual({
      current: null,
      annual: null
    });
  });
});
