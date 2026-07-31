import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setSmelterOperations
} from "../economyContext";
import { GuildKnowledge, getMetallurgyGuildBonus, METALLURGY_GUILD_SATURATION_WORKERS } from "./guildKnowledge";

describe("GuildKnowledgeModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  function smelter(overrides: Partial<Parameters<typeof setSmelterOperations>[0][number]> = {}) {
    return {
      i: 1,
      depositId: 1,
      cell: 0,
      burgId: 1,
      marketId: 1,
      waterPower: 1,
      fuelAccess: 1,
      technology: 1,
      smeltingYield: 0.8,
      annualCapacityTons: 120,
      workers: METALLURGY_GUILD_SATURATION_WORKERS,
      securityInvestment: 0,
      lastSecurityUpkeep: 0,
      lastTheftLoss: 0,
      lastTheftRisk: 0,
      active: true,
      ...overrides
    };
  }

  it("raises the Metallurgy stock for a fully-staffed smelter's Burg", () => {
    setSmelterOperations([smelter()]);

    GuildKnowledge.settleAnnual();

    const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1 && entry.domain === "metallurgy");
    expect(stock?.stock).toBeGreaterThan(0);
    expect(getMetallurgyGuildBonus(1)).toBeGreaterThan(1);
  });

  it("matures a small chapter's stock by raw headcount, not gated by a population/burg.group threshold", () => {
    // §8.1 decision 2: there is no minimum settlement-size gate. A half-staffed chapter (relative
    // to the saturation constant) still accumulates real technique over time — it is simply
    // capped below stock=1 by its own headcount, exactly like a fully-staffed chapter is capped
    // at 1, not blocked outright the way a burg.group-tier gate would block it.
    setSmelterOperations([smelter({ workers: METALLURGY_GUILD_SATURATION_WORKERS / 2 })]);

    let stock = 0;
    for (let i = 0; i < 200; i++) {
      worldContext.options = { year: 500 + i };
      GuildKnowledge.settleAnnual();
      stock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    }

    expect(stock).toBeGreaterThan(0.45);
    expect(stock).toBeLessThan(0.55);
  });

  it("decays the stock for an inactive smelter instead of growing it", () => {
    setSmelterOperations([smelter({ active: false })]);
    // Seed an existing stock by settling once while active, then deactivate and settle again.
    setSmelterOperations([smelter()]);
    GuildKnowledge.settleAnnual();
    const stockAfterFirstYear = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockAfterFirstYear).toBeGreaterThan(0);

    setSmelterOperations([smelter({ active: false })]);
    worldContext.options = { year: 501 };
    GuildKnowledge.settleAnnual();

    const stockAfterDecay = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockAfterDecay).toBeLessThan(stockAfterFirstYear);
  });

  it("keeps decaying an orphaned Burg's stock after its smelter operation disappears", () => {
    setSmelterOperations([smelter()]);
    GuildKnowledge.settleAnnual();
    const stockWithSmelter = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(stockWithSmelter).toBeGreaterThan(0);

    setSmelterOperations([]);
    worldContext.options = { year: 501 };
    GuildKnowledge.settleAnnual();

    const orphanStock = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock ?? 0;
    expect(orphanStock).toBeGreaterThan(0);
    expect(orphanStock).toBeLessThan(stockWithSmelter);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setSmelterOperations([smelter()]);

    GuildKnowledge.settleAnnual();
    const stockAfterFirstCall = getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock;
    GuildKnowledge.settleAnnual();

    expect(getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock).toBe(stockAfterFirstCall);
  });

  it("returns bonus 1 (no bonus) for a Burg with no tracked stock", () => {
    expect(getMetallurgyGuildBonus(999)).toBe(1);
  });
});
