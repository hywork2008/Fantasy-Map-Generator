import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, Province, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import {
  clearEconomyContext,
  getGuildKnowledgeStocks,
  getMarkets,
  initEconomyContext,
  setGuildKnowledgeStocks,
  setMarkets
} from "../economyContext";
import {
  apprenticePocketBaseByAge,
  computeApprenticePocketMoney,
  GUILD_APPRENTICE_POCKET_BY_AGE,
  GUILD_APPRENTICE_POCKET_MAX,
  GUILD_MASTER_STIPEND_RATE,
  isGoodMasterApprenticeBond,
  MARKET_MANAGER_STIPEND_RATE,
  MARKET_RIVAL_STIPEND_RATE,
  PROVINCE_LORD_STIPEND_RATE,
  payGuildStipends,
  payMarketStipends,
  payProvinceLordStipends,
  seedMissingCharacterWealth
} from "./characterStipends";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: {} as Character["family"],
    appearance: 0,
    prestige: 0,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

describe("characterStipends", () => {
  describe("payProvinceLordStipends()", () => {
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
    });

    beforeEach(() => {
      const api = { worldContext } as unknown as ExtensionAPI;
      initEconomyContext(api);
      initCharactersContext(api);
    });

    it("pays the living province lord a share of their seated Burg's treasury, deducted from that Burg", () => {
      const lord = makeCharacter({
        i: 30,
        titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }]
      });
      const burg = { i: 5, treasury: 200 } as unknown as Burg;
      worldContext.pack = {
        provinces: [undefined, { i: 1, state: 1, burg: 5, removed: false } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg],
        characters: [lord]
      } as unknown as PackedGraph;

      payProvinceLordStipends({ i: 1 });

      expect(lord.wealth).toBe(rn(200 * PROVINCE_LORD_STIPEND_RATE, 2));
      expect(burg.treasury).toBe(rn(200 - 200 * PROVINCE_LORD_STIPEND_RATE, 2));
    });

    it("does nothing when the province has no living lord", () => {
      const burg = { i: 5, treasury: 200 } as unknown as Burg;
      worldContext.pack = {
        provinces: [undefined, { i: 1, state: 1, burg: 5, removed: false } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg],
        characters: []
      } as unknown as PackedGraph;

      payProvinceLordStipends({ i: 1 });

      expect(burg.treasury).toBe(200);
    });

    it("does not pay a lord of a different state's province", () => {
      const lord = makeCharacter({
        i: 30,
        titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }]
      });
      const burg = { i: 5, treasury: 200 } as unknown as Burg;
      worldContext.pack = {
        provinces: [undefined, { i: 1, state: 2, burg: 5, removed: false } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg],
        characters: [lord]
      } as unknown as PackedGraph;

      payProvinceLordStipends({ i: 1 });

      expect(lord.wealth).toBe(0);
      expect(burg.treasury).toBe(200);
    });
  });

  describe("payGuildStipends()", () => {
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
    });

    beforeEach(() => {
      const api = { worldContext } as unknown as ExtensionAPI;
      initEconomyContext(api);
      initCharactersContext(api);
      worldContext.pack = { characters: [] } as unknown as PackedGraph;
    });

    it("pays fixed age-band pocket money (not a treasury %) to a well-bonded apprentice", () => {
      const master = makeCharacter({
        i: 40,
        solidarity: { 41: 40 },
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
      });
      const apprentice = makeCharacter({
        i: 41,
        age: 14,
        solidarity: { 40: 35 },
        roles: [
          {
            source: "economy",
            kind: "guildApprentice",
            entityType: "burg",
            entityId: 1,
            domain: "metallurgy",
            organizationId: 40,
            label: "Guild Apprentice"
          }
        ]
      });
      worldContext.pack.characters = [master, apprentice];
      // Huge treasury must not inflate pocket money above the age-band base.
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 10_000 }]);

      payGuildStipends();

      const masterAmount = rn(10_000 * GUILD_MASTER_STIPEND_RATE, 2);
      const apprenticeAmount = computeApprenticePocketMoney(10_000 - masterAmount, master, apprentice);
      expect(master.wealth).toBe(masterAmount);
      expect(apprentice.wealth).toBe(apprenticeAmount);
      expect(apprentice.wealth).toBeGreaterThan(0);
      expect(apprentice.wealth).toBeLessThanOrEqual(apprenticePocketBaseByAge(14));
      expect(apprentice.wealth).toBeLessThanOrEqual(GUILD_APPRENTICE_POCKET_BY_AGE.child);
      // Same apprentice against a modest treasury yields the same pocket (treasury is a ceiling only).
      expect(computeApprenticePocketMoney(50, master, apprentice)).toBe(apprenticeAmount);
      expect(getGuildKnowledgeStocks()[0].treasury).toBe(rn(10_000 - masterAmount - apprenticeAmount, 2));
    });

    it("uses larger fixed bands for older apprentices and never scales with treasury piles", () => {
      const master = makeCharacter({ i: 40, solidarity: { 41: 80, 42: 80 } });
      const youth = makeCharacter({ i: 41, age: 16, solidarity: { 40: 80 } });
      const adult = makeCharacter({ i: 42, age: 20, solidarity: { 40: 80 } });

      expect(apprenticePocketBaseByAge(13)).toBe(GUILD_APPRENTICE_POCKET_BY_AGE.child);
      expect(apprenticePocketBaseByAge(16)).toBe(GUILD_APPRENTICE_POCKET_BY_AGE.youth);
      expect(apprenticePocketBaseByAge(20)).toBe(GUILD_APPRENTICE_POCKET_BY_AGE.adult);
      expect(computeApprenticePocketMoney(1_000_000, master, youth)).toBe(GUILD_APPRENTICE_POCKET_BY_AGE.youth);
      expect(computeApprenticePocketMoney(1_000_000, master, adult)).toBe(GUILD_APPRENTICE_POCKET_MAX);
      // Empty coffers: gift is skipped entirely.
      expect(computeApprenticePocketMoney(0, master, youth)).toBe(0);
    });

    it("pays the master but withholds apprentice pocket money when the bond is cool", () => {
      const master = makeCharacter({
        i: 40,
        solidarity: { 41: 5 },
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
      });
      const apprentice = makeCharacter({
        i: 41,
        age: 13,
        solidarity: { 40: 5 },
        roles: [
          {
            source: "economy",
            kind: "guildApprentice",
            entityType: "burg",
            entityId: 1,
            domain: "metallurgy",
            organizationId: 40,
            label: "Guild Apprentice"
          }
        ]
      });
      worldContext.pack.characters = [master, apprentice];
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 100 }]);

      payGuildStipends();

      expect(master.wealth).toBe(rn(100 * GUILD_MASTER_STIPEND_RATE, 2));
      expect(apprentice.wealth).toBe(0);
      expect(isGoodMasterApprenticeBond(master, apprentice)).toBe(false);
      expect(getGuildKnowledgeStocks()[0].treasury).toBe(rn(100 - 100 * GUILD_MASTER_STIPEND_RATE, 2));
    });

    it("does nothing for a domain with no settled master", () => {
      worldContext.pack.characters = [];
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 100 }]);

      payGuildStipends();

      expect(getGuildKnowledgeStocks()[0].treasury).toBe(100);
    });
  });

  describe("payMarketStipends()", () => {
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
    });

    beforeEach(() => {
      const api = { worldContext } as unknown as ExtensionAPI;
      initEconomyContext(api);
      initCharactersContext(api);
      worldContext.pack = { characters: [] } as unknown as PackedGraph;
    });

    it("pays the market manager and rival merchants out of the market's own working capital", () => {
      const manager = makeCharacter({ i: 50 });
      const rival = makeCharacter({ i: 51 });
      worldContext.pack.characters = [manager, rival];
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "",
          goods: {},
          managerCharacterId: 50,
          rivalCharacterIds: [51],
          marketTreasury: { balance: 100, ruralGrainPayable: 0 }
        }
      ]);

      payMarketStipends();

      const managerAmount = rn(100 * MARKET_MANAGER_STIPEND_RATE, 2);
      const rivalAmount = rn((100 - managerAmount) * MARKET_RIVAL_STIPEND_RATE, 2);
      expect(manager.wealth).toBe(managerAmount);
      expect(rival.wealth).toBe(rivalAmount);
      expect(getMarkets()[0].marketTreasury?.balance).toBe(rn(100 - managerAmount - rivalAmount, 2));
    });

    it("does nothing for a market with no working capital", () => {
      const manager = makeCharacter({ i: 50 });
      worldContext.pack.characters = [manager];
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "",
          goods: {},
          managerCharacterId: 50,
          marketTreasury: { balance: 0, ruralGrainPayable: 0 }
        }
      ]);

      payMarketStipends();

      expect(manager.wealth).toBe(0);
    });
  });

  describe("seedMissingCharacterWealth()", () => {
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
      clearNobilityContext();
    });

    beforeEach(() => {
      const api = { worldContext } as unknown as ExtensionAPI;
      initEconomyContext(api);
      initCharactersContext(api);
      initNobilityContext(api);
    });

    it("seeds a fresh ruler's wealth from the state's estimated household income, without needing any ticks", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0.2, rural: 100, urban: 100 } as unknown as State;
      const ruler = makeCharacter({ i: 60, wealth: 0 });
      worldContext.pack = { states: [state], characters: [ruler], provinces: [], burgs: [] } as unknown as PackedGraph;
      setRulerId(state, ruler.i);

      seedMissingCharacterWealth();

      // income = 0.2 * 200 = 40; household rate = 0.25; per-cycle = 10; 6-18 cycles => [60, 180]
      expect(ruler.wealth).toBeGreaterThanOrEqual(60);
      expect(ruler.wealth).toBeLessThanOrEqual(180);
    });

    it("never overwrites a character who already has wealth", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0.2, rural: 100, urban: 100 } as unknown as State;
      const ruler = makeCharacter({ i: 60, wealth: 5 });
      worldContext.pack = { states: [state], characters: [ruler], provinces: [], burgs: [] } as unknown as PackedGraph;
      setRulerId(state, ruler.i);

      seedMissingCharacterWealth();

      expect(ruler.wealth).toBe(5);
    });

    it("seeds a fresh province lord's wealth from their seated Burg's treasury", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      const lord = makeCharacter({
        i: 61,
        wealth: 0,
        titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }]
      });
      const burg = { i: 5, treasury: 100 } as unknown as Burg;
      worldContext.pack = {
        states: [state],
        characters: [lord],
        provinces: [undefined, { i: 1, state: 1, burg: 5, removed: false } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg]
      } as unknown as PackedGraph;

      seedMissingCharacterWealth();

      // per-cycle = 100 * 0.1 = 10; 6-18 cycles => [60, 180]
      expect(lord.wealth).toBeGreaterThanOrEqual(60);
      expect(lord.wealth).toBeLessThanOrEqual(180);
    });
  });
});
