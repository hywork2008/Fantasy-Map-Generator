import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getApothecaryWorkshops,
  getChemistryTrials,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { ApothecaryWorkshops } from "./apothecaryWorkshops";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

describe("ApothecaryWorkshops", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1200 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Herb", removed: false, capital: 1, treasury: 80 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false }]
    } as unknown as PackedGraph;
    simulationContext.currentYear = 1200;
    setGoods([
      { i: 1, name: "Medicinal herbs", tags: [], value: 4, unit: "bag", icon: "good-medicinal-herbs", color: "#6b8" },
      { i: 2, name: "Honey", tags: [], value: 5, unit: "jar", icon: "good-honey", color: "#fc0" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 6, price: 4 },
          2: { stock: 6, price: 5 }
        }
      }
    ]);
    setTechnologyProgressForTests([
      { technologyId: "apothecaryCompounding", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("auto-founds a workshop at known and records compounding runs without household Medicines demand", () => {
    expect(ApothecaryWorkshops.settleAnnual()).toBe(true);
    const workshop = getApothecaryWorkshops().find(row => row.sponsorStateId === 1);
    expect(workshop?.active).toBe(true);
    const trial = getChemistryTrials().find(row => row.kind === "compounding" && row.stateId === 1);
    expect(trial?.documentedRuns).toBe(1);
    expect(worldContext.pack.states[1].treasury).toBeLessThan(80);
  });
});
