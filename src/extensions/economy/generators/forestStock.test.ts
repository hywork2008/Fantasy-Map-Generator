import { afterEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setCultivatedArea } from "../economyContext";
import { getForestStockMultiplier, harvestWood, tickForestRegrowth } from "./forestStock";

function installForestCell(stock = 1): void {
  worldContext.distanceScale = 1;
  worldContext.pack = {
    cells: {
      i: new Uint16Array([0]),
      h: new Uint8Array([30]),
      area: new Float32Array([1]),
      forestCover: new Float32Array([1]),
      forestStock: new Float32Array([stock])
    }
  } as unknown as PackedGraph;
}

describe("economy forest stock bridge", () => {
  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("fells hectares of standing timber, not a share of the cell", () => {
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    installForestCell();

    // 100 ha at the default 150 m³/ha hold 15,000 m³ = 1,500 Wood units; 750 is half of it.
    expect(harvestWood(0, 750)).toBeCloseTo(750, 5);
    expect(getForestStockMultiplier(0)).toBeCloseTo(0.5, 5);
  });

  it("regrows an unoccupied logging scar", () => {
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    installForestCell(0.5);

    expect(tickForestRegrowth(5)).toBe(true);
    expect(getForestStockMultiplier(0)).toBeCloseTo(0.6, 5);
  });

  it("does not regrow over active cropland", () => {
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    installForestCell(0.5);
    setCultivatedArea(new Float32Array([100])); // cell area=1 -> 100 ha, entirely protected

    expect(tickForestRegrowth(5)).toBe(false);
    expect(getForestStockMultiplier(0)).toBeCloseTo(0.5, 5);
  });
});
