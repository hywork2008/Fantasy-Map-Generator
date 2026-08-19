import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { getCalibrationOverviewState } from "../store/calibrationOverviewState";
import { refreshCalibrationOverview } from "./calibrationOverview";

describe("refreshCalibrationOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, state: 1, name: "Anvil", population: 9, port: 0, capital: 0 }],
      states: [undefined, { i: 1, name: "Testland" }],
      cultures: [undefined],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("expects 10–40 woodworking people for a 9000-display-person burg", () => {
    refreshCalibrationOverview();
    const row = getCalibrationOverviewState().rows.find(candidate => candidate.pool === "woodworking");
    expect(row?.laborPeople).toBe(9000);
    expect(row?.displayPeople).toBe(9000);
    expect(row?.expectedPeople).toBeGreaterThanOrEqual(10);
    expect(row?.expectedPeople).toBeLessThanOrEqual(40);
    expect(row?.expectedPeople).toBeCloseTo(19.8, 1);
    expect(row?.expectedPoints).toBeCloseTo(0.0198, 4);
    expect(row?.goods.some(good => good.goodName === "Barrels")).toBe(true);
  });
});
