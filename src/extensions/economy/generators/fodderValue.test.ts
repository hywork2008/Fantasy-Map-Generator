import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MARKET_SETTINGS, setMarketSettings } from "../../../simulation/marketSettings";

const goods = [{ name: "Fodder", value: 1 }];
vi.mock("../economyContext", () => ({ getGoods: () => goods }));

const { applyFodderValue, FODDER_VALUES } = await import("./householdGoodValues");

describe("fodder value", () => {
  afterEach(() => setMarketSettings(DEFAULT_MARKET_SETTINGS));

  it("switches between the historical and legacy values but keeps a value set by hand", () => {
    goods[0].value = FODDER_VALUES.legacy;
    expect(applyFodderValue()).toBe(true);
    expect(goods[0].value).toBe(FODDER_VALUES.historical);
    setMarketSettings({ fodderValue: "legacy" });
    applyFodderValue();
    expect(goods[0].value).toBe(FODDER_VALUES.legacy);
    goods[0].value = 0.5;
    expect(applyFodderValue()).toBe(false);
    expect(goods[0].value).toBe(0.5);
  });
});
