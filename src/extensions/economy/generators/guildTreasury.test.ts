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

    it("funds a newly appointed master's personal starting assets from the same guild bootstrap", () => {
      const master = {
        i: 11,
        wealth: 0,
        roles: [
          {
            source: "economy",
            kind: "guildMaster",
            entityType: "burg",
            entityId: 1,
            domain: "metallurgy",
            label: "Guild Master"
          }
        ]
      };
      worldContext.pack.characters = [master] as PackedGraph["characters"];

      GuildTreasury.seedNewGuildWorkingCapital(1, "metallurgy");

      expect(master.wealth).toBeGreaterThan(0);
      expect(getGuildKnowledgeStocks()[0].treasury).toBeGreaterThan(0);
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

  describe("payoutStrugglingBurg()", () => {
    // comfortable level = population(2) * balanced profile's burgTreasuryPerPopulation(15) = 30
    // (economyStartMode.ts) — no GuildKnowledgeStock is seeded in these tests, so the guild-trickle
    // loop is always a no-op and only the Market-pool fallback (§ new) can react.
    beforeEach(() => {
      worldContext.options = { economyStartMode: "balanced" } as typeof worldContext.options;
    });

    it("pulls a capped share from the Market pool when the Burg has no guild treasury of its own", () => {
      const burg = {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        market: 1,
        population: 2,
        treasury: 1
      } as unknown as PackedGraph["burgs"][number];
      worldContext.pack.burgs = [undefined, burg] as unknown as PackedGraph["burgs"];
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "#111",
          goods: {},
          marketTreasury: { balance: 100, ruralGrainPayable: 0 }
        }
      ]);
      Markets.sync();

      GuildTreasury.payoutStrugglingBurg(burg);

      // shortfall (29) exceeds the pool cap (100 * MARKET_POOR_RELIEF_RATE 0.02 = 2), so the payout
      // is capped by the pool share, not the shortfall.
      expect(burg.treasury).toBe(3);
      expect(Markets.get(1)?.marketTreasury?.balance).toBe(98);
    });

    it("caps the payout at the Burg's shortfall, never overshooting the comfortable level", () => {
      const burg = {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        market: 1,
        population: 2,
        treasury: 29.5
      } as unknown as PackedGraph["burgs"][number];
      worldContext.pack.burgs = [undefined, burg] as unknown as PackedGraph["burgs"];
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "#111",
          goods: {},
          marketTreasury: { balance: 100, ruralGrainPayable: 0 }
        }
      ]);
      Markets.sync();

      GuildTreasury.payoutStrugglingBurg(burg);

      expect(burg.treasury).toBe(30);
      expect(Markets.get(1)?.marketTreasury?.balance).toBe(99.5);
    });

    it("leaves the Market pool untouched once the Burg is already at or above its comfortable level", () => {
      const burg = {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        market: 1,
        population: 2,
        treasury: 30
      } as unknown as PackedGraph["burgs"][number];
      worldContext.pack.burgs = [undefined, burg] as unknown as PackedGraph["burgs"];
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "#111",
          goods: {},
          marketTreasury: { balance: 100, ruralGrainPayable: 0 }
        }
      ]);
      Markets.sync();

      GuildTreasury.payoutStrugglingBurg(burg);

      expect(burg.treasury).toBe(30);
      expect(Markets.get(1)?.marketTreasury?.balance).toBe(100);
    });

    it("does nothing when the Market pool itself is empty", () => {
      const burg = {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        market: 1,
        population: 2,
        treasury: 1
      } as unknown as PackedGraph["burgs"][number];
      worldContext.pack.burgs = [undefined, burg] as unknown as PackedGraph["burgs"];
      setMarkets([
        { i: 1, centerBurgId: 1, color: "#111", goods: {}, marketTreasury: { balance: 0, ruralGrainPayable: 0 } }
      ]);
      Markets.sync();

      GuildTreasury.payoutStrugglingBurg(burg);

      expect(burg.treasury).toBe(1);
    });
  });
});
