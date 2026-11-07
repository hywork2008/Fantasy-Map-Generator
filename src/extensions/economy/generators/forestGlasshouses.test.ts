import { describe, expect, it } from "vitest";
import {
  GLASSHOUSE_LOTS_PER_YEAR,
  GLASSHOUSE_WOOD_UNITS_PER_LOT,
  GLASSHOUSE_WORKER_MONTHS_PER_LOT,
  getForestGlassLots
} from "./forestGlasshouses";

const base = {
  capacityLots: 10,
  targetStock: 6,
  stock: 1,
  sandStock: 100,
  sandPerLot: 1,
  ruralCash: 100,
  treasury: 100,
  glassPrice: 6,
  sandPrice: 1
};

describe("forest glasshouses", () => {
  it("sizes a hut from the Waldglas wood and the Riesengebirge crew", () => {
    expect(GLASSHOUSE_LOTS_PER_YEAR).toBeCloseTo(7.7, 1);
    expect(GLASSHOUSE_WORKER_MONTHS_PER_LOT).toBeCloseTo(59, 0);
    expect(GLASSHOUSE_WOOD_UNITS_PER_LOT).toBeCloseTo(32.5, 0);
  });

  it("makes glass only up to the stock room, the sand, the money and a margin over the sand", () => {
    expect(getForestGlassLots(base)).toBe(5);
    expect(getForestGlassLots({ ...base, sandStock: 2 })).toBe(2);
    expect(getForestGlassLots({ ...base, treasury: 12 })).toBe(2);
    expect(getForestGlassLots({ ...base, stock: 7 })).toBe(0);
    expect(getForestGlassLots({ ...base, glassPrice: 1 })).toBe(0);
  });
});
