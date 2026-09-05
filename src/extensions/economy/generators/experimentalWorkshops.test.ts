import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  clearEconomyContext,
  getExperimentalWorkshops,
  initEconomyContext,
  setExperimentalWorkshops,
  setGoods,
  setMarkets,
  setPatronageDeposits,
  setResearchNamedSeats
} from "../economyContext";
import { EXPERIMENTAL_BUDGET, FACILITY_MAINTENANCE_RATE } from "./chemMedCommon";
import { ExperimentalWorkshops } from "./experimentalWorkshops";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

describe("ExperimentalWorkshopsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1200 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Lab", removed: false, capital: 1, treasury: 80 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Books", tags: [], value: 4, unit: "tome", icon: "good-books", color: "#864" },
      { i: 2, name: "Paper", tags: [], value: 2, unit: "sheet", icon: "good-paper", color: "#eee" },
      { i: 3, name: "Ink", tags: [], value: 3, unit: "vial", icon: "good-ink", color: "#111" },
      { i: 4, name: "Glass", tags: [], value: 5, unit: "lot", icon: "good-glass", color: "#8cf" },
      { i: 5, name: "Tools", tags: [], value: 6, unit: "set", icon: "good-tools", color: "#888" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 8, price: 4 },
          2: { stock: 8, price: 2 },
          3: { stock: 8, price: 3 },
          4: { stock: 8, price: 5 },
          5: { stock: 8, price: 6 }
        }
      }
    ]);
    setTechnologyProgressForTests([
      { technologyId: "experimentalNaturalPhilosophy", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    Goods.sync();
    Markets.sync();
    useOptionsState.setState({ technologyDevelopmentSpeed: 1 });
  });

  afterEach(() => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 1 });
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  function seedWorkshop(experimentRecord = 0): void {
    setExperimentalWorkshops([
      {
        burgId: 1,
        sponsorStateId: 1,
        active: true,
        researchers: 2,
        annualBudget: EXPERIMENTAL_BUDGET,
        experimentRecord,
        lastFundedYear: 1199
      }
    ]);
  }

  it("debits the reduced annual maintenance rate when patronage deposits are empty", () => {
    // Renewal year (not founding): the State owes FACILITY_MAINTENANCE_RATE of EXPERIMENTAL_BUDGET,
    // not the full budget again — docs/plan/treasury-structural-deficit-investigation.md §8.2, fix "A".
    seedWorkshop();
    expect(ExperimentalWorkshops.settleAnnual()).toBe(true);
    expect(worldContext.pack.states[1].treasury).toBe(80 - rn(EXPERIMENTAL_BUDGET * FACILITY_MAINTENANCE_RATE, 2));
    expect(getExperimentalWorkshops().find(row => row.sponsorStateId === 1)?.active).toBe(true);
  });

  it("skips debitTreasury when patronage gold covers the annual budget", () => {
    seedWorkshop();
    setPatronageDeposits([
      {
        i: 1,
        characterId: 9,
        burgId: 1,
        stateId: 1,
        year: 1200,
        kind: "workshop",
        gold: EXPERIMENTAL_BUDGET
      }
    ]);

    expect(ExperimentalWorkshops.settleAnnual()).toBe(true);
    expect(worldContext.pack.states[1].treasury).toBe(80);
    const workshop = getExperimentalWorkshops().find(row => row.sponsorStateId === 1);
    expect(workshop?.active).toBe(true);
    expect(workshop?.lastFundedYear).toBe(1200);
  });

  it("does not square EWMA years when speed is 25 and a workshopResearcher seat is present", () => {
    useOptionsState.setState({ technologyDevelopmentSpeed: 25 });
    seedWorkshop();
    setResearchNamedSeats([{ burgId: 1, characterId: 9, role: "workshopResearcher" }]);

    expect(ExperimentalWorkshops.settleAnnual()).toBe(true);

    const record = getExperimentalWorkshops().find(row => row.sponsorStateId === 1)?.experimentRecord ?? 0;
    const quality = (60 - 50) / 50;
    const biasedRate = 0.15 * (1 + 0.5 * quality);
    expect(record).toBe(rn(applyKnowledgeEwma(0, 1, biasedRate, 25), 4));
    expect(record).not.toBe(rn(applyKnowledgeEwma(0, 1, biasedRate, 25 * 25), 4));
    expect(record).not.toBe(rn(applyKnowledgeEwma(0, 1, 0.15, 25), 4));
  });
});
