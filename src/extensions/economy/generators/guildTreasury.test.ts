import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setGoods,
  setGuildKnowledgeStocks,
  setMarkets
} from "../economyContext";
import { GUILD_MASTER_STIPEND } from "./characterStipends";
import { Goods } from "./goods-generator";
import { GuildTreasury } from "./guildTreasury";
import { Markets } from "./markets-generator";

const BRONZE_ID = 1;

describe("GuildTreasuryModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, market: 1 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: BRONZE_ID, name: "Bronze", tags: ["military"], value: 8, unit: "wagon", icon: "bronze", color: "#e46f21" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setGuildKnowledgeStocks([]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  describe("creditGuildTreasury()", () => {
    it("creates a GuildKnowledgeStock entry with stock=0 when the domain has never accumulated technique", () => {
      GuildTreasury.creditGuildTreasury(1, "metallurgy", 5);

      const [entry] = getGuildKnowledgeStocks();
      expect(entry.stock).toBe(0);
      expect(entry.treasury).toBe(5);
    });

    it("adds to an existing entry's treasury without touching its stock", () => {
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.4, treasury: 2 }]);

      GuildTreasury.creditGuildTreasury(1, "metallurgy", 3);

      const [entry] = getGuildKnowledgeStocks();
      expect(entry.stock).toBe(0.4);
      expect(entry.treasury).toBe(5);
    });

    it("does nothing for a non-positive amount or a missing burg id", () => {
      GuildTreasury.creditGuildTreasury(0, "metallurgy", 5);
      GuildTreasury.creditGuildTreasury(1, "metallurgy", 0);

      expect(getGuildKnowledgeStocks()).toHaveLength(0);
    });
  });

  describe("seedNewGuildWorkingCapital()", () => {
    it("credits a back-pay-equivalent working capital even from a still-empty domain guild", () => {
      // Regression: a brand-new master's only other funding path is GUILD_PROFIT_SHARE off this
      // domain's own finished goods clearing the market at a margin, which can stay permanently at
      // 0 — see this method's doc comment.
      GuildTreasury.seedNewGuildWorkingCapital(1, "metallurgy");

      const [entry] = getGuildKnowledgeStocks();
      expect(entry.treasury).toBeGreaterThanOrEqual(GUILD_MASTER_STIPEND * 4);
      expect(entry.treasury).toBeLessThanOrEqual(GUILD_MASTER_STIPEND * 10);
    });

    it("tops up the home Burg's market with a few cycles' worth of the domain's starter material", () => {
      GuildTreasury.seedNewGuildWorkingCapital(1, "metallurgy");

      const stock = worldContext.pack.markets?.[0]?.goods[BRONZE_ID]?.stock ?? 0;
      expect(stock).toBeGreaterThanOrEqual(4);
      expect(stock).toBeLessThanOrEqual(10);
    });

    it("never lowers stock the Burg's market already has above the seed target", () => {
      setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { [BRONZE_ID]: { stock: 1000, price: 8 } } }]);
      Markets.sync();

      GuildTreasury.seedNewGuildWorkingCapital(1, "metallurgy");

      expect(worldContext.pack.markets?.[0]?.goods[BRONZE_ID]?.stock).toBe(1000);
    });

    it("still credits treasury when the Burg has no market to seed materials into", () => {
      worldContext.pack.burgs = [undefined, { i: 1, cell: 0, x: 0, y: 0 } as unknown as PackedGraph["burgs"][number]];

      GuildTreasury.seedNewGuildWorkingCapital(1, "metallurgy");

      const [entry] = getGuildKnowledgeStocks();
      expect(entry.treasury).toBeGreaterThan(0);
    });

    it("skips material seeding for a domain with no mapped starter material, without erroring", () => {
      GuildTreasury.seedNewGuildWorkingCapital(1, "woodworking");

      const [entry] = getGuildKnowledgeStocks();
      expect(entry.domain).toBe("woodworking");
      expect(entry.treasury).toBeGreaterThan(0);
      expect(worldContext.pack.markets?.[0]?.goods[BRONZE_ID]?.stock ?? 0).toBe(0);
    });
  });
});
