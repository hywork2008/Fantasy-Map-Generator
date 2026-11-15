import { describe, expect, it, vi } from "vitest";

const slice = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("../context/economyApi", () => ({ getEconomySlice: () => slice }));

import { markStartLineStockPending, seedStartLineStock, takeStartLineStockPending } from "./startLineStock";

describe("start line stock", () => {
  it("seeds at one pricing only, after the start provisioning asked for it", () => {
    expect(takeStartLineStockPending()).toBe(false);
    markStartLineStockPending();
    expect(takeStartLineStockPending()).toBe(true);
    expect(takeStartLineStockPending()).toBe(false);
  });

  it("fills the stock up to the modelled demand and never takes stock away", () => {
    const low = { stock: 13 };
    seedStartLineStock(low, 250);
    expect(low.stock).toBe(250);

    const high = { stock: 400 };
    seedStartLineStock(high, 250);
    expect(high.stock).toBe(400);
  });
});
