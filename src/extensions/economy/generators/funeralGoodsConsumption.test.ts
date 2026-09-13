import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGoods, getMarketById, getMarketCellColumn } from "../economyContext";
import { consumeFuneralMaterialsFromPending } from "./funeralGoodsConsumption";
import type { Market } from "./marketTypes";

vi.mock("../economyContext", () => ({
  getGoods: vi.fn(),
  getMarketById: vi.fn(),
  getMarketCellColumn: vi.fn()
}));

describe("consumeFuneralMaterialsFromPending", () => {
  const market: Market = {
    i: 1,
    centerBurgId: 1,
    color: "#000",
    goods: {
      10: { stock: 5, price: 1 },
      11: { stock: 3, price: 1 },
      12: { stock: 2, price: 1 }
    }
  };

  beforeEach(() => {
    vi.mocked(getGoods).mockReturnValue([
      { i: 10, name: "Wood" },
      { i: 11, name: "Stone" },
      { i: 12, name: "Linen" }
    ] as ReturnType<typeof getGoods>);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([0, 1, 1]));
    vi.mocked(getMarketById).mockImplementation(id => (id === 1 ? market : undefined));
    market.goods[10].stock = 5;
    market.goods[11].stock = 3;
    market.goods[12].stock = 2;
  });

  it("debits wood, stone, and linen from the cell's market", () => {
    const consumed = consumeFuneralMaterialsFromPending({
      1: { wood: 1.5, stone: 0.5, linen: 0.25 }
    });
    expect(consumed).toBeCloseTo(2.25);
    expect(market.goods[10].stock).toBeCloseTo(3.5);
    expect(market.goods[11].stock).toBeCloseTo(2.5);
    expect(market.goods[12].stock).toBeCloseTo(1.75);
  });

  it("does not go negative when stock is short", () => {
    consumeFuneralMaterialsFromPending({
      1: { wood: 100, stone: 0, linen: 0 }
    });
    expect(market.goods[10].stock).toBe(0);
  });
});
