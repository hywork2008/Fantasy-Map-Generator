import { describe, expect, it } from "vitest";
import { isStormLayUpDate } from "./seaSeason";

describe("isStormLayUpDate", () => {
  const north = { south: false, antiquity: false };

  it("lays ships up from Martinmas to St Peter's Chair", () => {
    expect(isStormLayUpDate(11, 10, north)).toBe(false);
    expect(isStormLayUpDate(11, 11, north)).toBe(true);
    expect(isStormLayUpDate(1, 15, north)).toBe(true);
    expect(isStormLayUpDate(2, 21, north)).toBe(true);
    expect(isStormLayUpDate(2, 22, north)).toBe(false);
  });

  it("keeps antiquity's sea closed to 10 March", () => {
    expect(isStormLayUpDate(3, 9, { south: false, antiquity: true })).toBe(true);
    expect(isStormLayUpDate(3, 10, { south: false, antiquity: true })).toBe(false);
  });

  it("shifts the lay-up six months in the south", () => {
    const south = { south: true, antiquity: false };
    expect(isStormLayUpDate(5, 11, south)).toBe(true);
    expect(isStormLayUpDate(8, 22, south)).toBe(false);
    expect(isStormLayUpDate(1, 15, south)).toBe(false);
  });
});
