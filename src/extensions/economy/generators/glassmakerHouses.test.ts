import { describe, expect, it } from "vitest";
import { type GlassmakerMarketYear, getFoundingHouses, settleGlassmakerYear } from "./glassmakerHouses";

const row = (
  marketId: number,
  stateId: number,
  houses: number,
  usedHuts: number,
  shortHuts = 0
): GlassmakerMarketYear => ({
  marketId,
  stateId,
  houses,
  usedHuts,
  shortHuts,
  forestHuts: 100
});
const housesOf = (result: ReturnType<typeof settleGlassmakerYear>, marketId: number) =>
  result.markets.find(entry => entry.marketId === marketId)!;

describe("glassmaker houses", () => {
  it("starts a market with the houses its first months' glass use needs, within its forest", () => {
    // 7.7 wains a month is 12 huts' worth a year, 15 with the margin.
    expect(getFoundingHouses(7.7, 7.7, 100)).toBe(15);
    expect(getFoundingHouses(7.7, 7.7, 4)).toBe(4);
    expect(getFoundingHouses(0, 7.7, 100)).toBe(0);
  });

  it("grows a busy market's houses by its sons and lets idle houses leave", () => {
    const result = settleGlassmakerYear([
      row(1, 1, 10, 10, 5),
      row(2, 2, 10, 2),
      row(3, 3, 10, 10),
      row(4, 4, 10, 10),
      row(5, 5, 10, 10),
      row(6, 6, 10, 10)
    ]);
    // No state holds 20% of the houses. Market 1 needs 5 more huts: 0.4 from its sons, the rest from market 2's 2 leavers (8 idle × 0.25).
    expect(housesOf(result, 1)).toMatchObject({ grown: 0.4, arrived: 2, houses: 12.4 });
    expect(housesOf(result, 2)).toMatchObject({ left: 2, houses: 8 });
    expect(result.lost).toBe(0);
  });

  it("keeps a leading state's glassmakers at home and sends others' abroad", () => {
    // State 1 holds 38% of the houses and forbids leaving; state 3 lets its families go.
    const result = settleGlassmakerYear([
      row(1, 1, 20, 12),
      row(2, 2, 6, 6, 6),
      row(3, 3, 6, 2),
      ...[4, 5, 6, 7].map(id => row(id, id, 5, 5))
    ]);
    expect(result.banningStates).toEqual([1]);
    expect(housesOf(result, 1).houses).toBe(20);
    expect(housesOf(result, 2)).toMatchObject({ grown: 0.24, arrived: 1 });
    expect(housesOf(result, 3).houses).toBe(5);
    expect(result.lost).toBe(0);
  });

  it("drops leavers no market wants", () => {
    const result = settleGlassmakerYear([
      row(1, 1, 4, 0),
      row(2, 2, 4, 4),
      row(3, 3, 4, 4),
      row(4, 4, 4, 4),
      row(5, 5, 4, 4),
      row(6, 6, 4, 4)
    ]);
    expect(housesOf(result, 1).houses).toBe(3);
    expect(result.lost).toBe(1);
  });
});
