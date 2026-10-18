import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import type { Market } from "../generators/marketTypes";
import { getMarketById, getMarkets, setMarkets } from "./trade";

describe("getMarketById", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("finds a market founded after the first lookup", () => {
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} } as Market]);
    expect(getMarketById(1)?.i).toBe(1);

    // New markets are pushed into the live array during play (docs/plan/farm-labour-calibration.md §17).
    const founded = { i: 2, centerBurgId: 2, color: "#222", goods: {} } as Market;
    getMarkets().push(founded);

    expect(getMarketById(2)).toBe(founded);
  });
});
