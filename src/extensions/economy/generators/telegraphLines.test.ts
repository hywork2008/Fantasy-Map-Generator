import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getTelegraphLines,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { TELEGRAPH_LINE_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { TelegraphLines } from "./telegraphLines";

describe("TelegraphLinesModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1837 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Morse", removed: false, capital: 1, treasury: 100 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Copper Wire", tags: [], value: 16, unit: "coil", icon: "good-unknown", color: "#c98a4b" },
      { i: 2, name: "Machine Parts", tags: [], value: 18, unit: "crate", icon: "good-unknown", color: "#6d7380" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 16 },
          2: { stock: 100, price: 18 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("does not create a line for a State where electricTelegraph has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(TelegraphLines.settleAnnual()).toBe(true);
    expect(getTelegraphLines()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(100);
  });

  it("creates a line, debits the budget, and consumes Copper Wire/Machine Parts only (no fuel) once known", () => {
    setTechnologyProgressForTests([
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(TelegraphLines.settleAnnual()).toBe(true);

    const lines = getTelegraphLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    expect(worldContext.pack.states[1].treasury).toBe(100 - TELEGRAPH_LINE_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 0.8); // Copper Wire consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.3); // Machine Parts consumed
  });

  it("reduces utilization and skips the run when Copper Wire stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.1, price: 16 },
          2: { stock: 100, price: 18 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(TelegraphLines.settleAnnual()).toBe(true);

    const lines = getTelegraphLines();
    expect(lines[0]?.utilization).toBeLessThan(0.5);
    expect(lines[0]).toMatchObject({ documentedRuns: 0, lastFailureReason: "materialShortage" });
  });

  it("marks the line inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = TELEGRAPH_LINE_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(TelegraphLines.settleAnnual()).toBe(true);

    const lines = getTelegraphLines();
    expect(lines[0]).toMatchObject({ active: false, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial line to service once electricTelegraph reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(TelegraphLines.settleAnnual()).toBe(true);
    expect(getTelegraphLines()[0]?.role).toBe("trial");

    worldContext.options = { year: 1838 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(TelegraphLines.settleAnnual()).toBe(true);
    expect(getTelegraphLines()[0]?.role).toBe("service");
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "electricTelegraph", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(TelegraphLines.settleAnnual()).toBe(true);
    expect(TelegraphLines.settleAnnual()).toBe(false);
  });
});
