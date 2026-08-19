import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { getTechnologyStage, setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getSteamPumpTrials,
  initEconomyContext,
  setGoods,
  setMarkets,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { getMineSteamDrainageBonus, SteamInstallations } from "./steamInstallations";

describe("SteamInstallations", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1200 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Mine", removed: false, capital: 1 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, x: 0, y: 0, removed: false }]
    } as unknown as PackedGraph;
    simulationContext.currentYear = 1200;
    setGoods([
      { i: 1, name: "Coal", tags: ["fuel"], value: 2, unit: "wain", icon: "coal", color: "#333" },
      { i: 2, name: "Tools", tags: ["tools"], value: 3, unit: "set", icon: "tools", color: "#777" },
      { i: 3, name: "Iron Ingot", tags: ["metal"], value: 4, unit: "bar", icon: "iron", color: "#888" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 20, price: 2 },
          2: { stock: 10, price: 3 },
          3: { stock: 10, price: 4 }
        }
      }
    ]);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "coalSeam",
        primaryCommodity: "coal",
        commodities: ["coal"],
        yields: [{ commodity: "coal", reserveTons: 400, annualCapacityTons: 40 }],
        richness: 3,
        depth: "deep",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 8,
        technology: 1,
        drainage: 0.4,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);
    setTechnologyProgressForTests([
      { technologyId: "atmosphericSteamPumping", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    useOptionsState.setState({ technologyRequirementEase: 1 });
    clearEconomyContext();
  });

  it("starts a trial on a deep mine once the state knows atmospheric steam pumping", () => {
    expect(SteamInstallations.settleAnnual()).toBe(true);
    const trial = getSteamPumpTrials().find(entry => entry.stateId === 1);
    expect(trial?.mineOperationId).toBe(1);
    expect(trial?.status).toBe("running");
    expect(getMineSteamDrainageBonus(1)).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[1].stock).toBeLessThan(20);
  });

  it("does not grant a drainage bonus to mines without a fueled engine", () => {
    expect(getMineSteamDrainageBonus(99)).toBe(0);
  });

  it("starts a trial on a shallow mine when requirement ease waives the deep-mine gate", () => {
    useOptionsState.setState({ technologyRequirementEase: 2 });
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "coalSeam",
        primaryCommodity: "coal",
        commodities: ["coal"],
        yields: [{ commodity: "coal", reserveTons: 400, annualCapacityTons: 40 }],
        richness: 2,
        depth: "shallow",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);

    expect(SteamInstallations.settleAnnual()).toBe(true);
    expect(getSteamPumpTrials().find(entry => entry.stateId === 1)?.mineOperationId).toBe(1);
  });

  it("records trial years that the host graph can read as demonstration evidence", () => {
    SteamInstallations.settleAnnual();
    worldContext.options = { year: 1201 } as typeof worldContext.options;
    simulationContext.currentYear = 1201;
    SteamInstallations.settleAnnual();
    expect(getSteamPumpTrials()[0].documentedRuns).toBeGreaterThanOrEqual(2);
    expect(getTechnologyStage("atmosphericSteamPumping", 1)).toBe("known");
  });
});
