import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../../data/races";
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
  computeGuildMasterStipend,
  computeMarketManagerStipend,
  computeMarketRivalStipend,
  computeProvinceLordStipend,
  GUILD_APPRENTICE_POCKET_BY_AGE,
  GUILD_APPRENTICE_POCKET_MAX,
  GUILD_MASTER_STIPEND,
  isGoodMasterApprenticeBond,
  MARKET_MANAGER_STIPEND,
  MARKET_RIVAL_STIPEND,
  PROVINCE_LORD_STIPEND,
  payGuildStipends,
  payMarketStipends,
  payProvinceLordStipends,
  seedMissingCharacterWealth
} from "./characterStipends";
import { HOUSEHOLD_STIPEND_CAP, HOUSEHOLD_STIPEND_FLOOR } from "./treasuryAllocation";

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
  describe("fixed personal-pay helpers", () => {
    it("never scales guild/market/province pay with huge institutional piles", () => {
      expect(computeProvinceLordStipend(1_000_000)).toBe(PROVINCE_LORD_STIPEND);
      expect(computeGuildMasterStipend(1_000_000)).toBe(GUILD_MASTER_STIPEND);
      expect(computeMarketManagerStipend(1_000_000)).toBe(MARKET_MANAGER_STIPEND);
      expect(computeMarketRivalStipend(1_000_000)).toBe(MARKET_RIVAL_STIPEND);
    });

    it("pays only what the pool can fund", () => {
      expect(computeProvinceLordStipend(0.4)).toBe(0.4);
      expect(computeGuildMasterStipend(0)).toBe(0);
    });

    it("keeps the role ladder: apprentice max < rival < master < manager < province lord", () => {
      expect(GUILD_APPRENTICE_POCKET_MAX).toBeLessThan(MARKET_RIVAL_STIPEND);
      expect(MARKET_RIVAL_STIPEND).toBeLessThan(GUILD_MASTER_STIPEND);
      expect(GUILD_MASTER_STIPEND).toBeLessThan(MARKET_MANAGER_STIPEND);
      expect(MARKET_MANAGER_STIPEND).toBeLessThan(PROVINCE_LORD_STIPEND);
    });
  });

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

    it("pays the living province lord a fixed stipend from their seated Burg", () => {
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

      expect(lord.wealth).toBe(PROVINCE_LORD_STIPEND);
      expect(burg.treasury).toBe(200 - PROVINCE_LORD_STIPEND);
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

    it("pays fixed master stipend and age-band pocket money when the bond is good", () => {
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
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 10_000 }]);

      payGuildStipends();

      const apprenticeAmount = computeApprenticePocketMoney(10_000 - GUILD_MASTER_STIPEND, master, apprentice);
      expect(master.wealth).toBe(GUILD_MASTER_STIPEND);
      expect(apprentice.wealth).toBe(apprenticeAmount);
      expect(apprentice.wealth).toBeGreaterThan(0);
      expect(apprentice.wealth).toBeLessThanOrEqual(GUILD_APPRENTICE_POCKET_BY_AGE.child);
      expect(getGuildKnowledgeStocks()[0].treasury).toBe(rn(10_000 - GUILD_MASTER_STIPEND - apprenticeAmount, 2));
    });

    it("does not pay a deceased master before the annual succession pass replaces them", () => {
      const deceasedMaster = makeCharacter({
        i: 40,
        dead: true,
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
      worldContext.pack.characters = [deceasedMaster];
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 10 }]);

      payGuildStipends();

      expect(deceasedMaster.wealth).toBe(0);
      expect(getGuildKnowledgeStocks()[0].treasury).toBe(10);
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

      expect(master.wealth).toBe(GUILD_MASTER_STIPEND);
      expect(apprentice.wealth).toBe(0);
      expect(isGoodMasterApprenticeBond(master, apprentice)).toBe(false);
      expect(getGuildKnowledgeStocks()[0].treasury).toBe(100 - GUILD_MASTER_STIPEND);
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
      expect(computeApprenticePocketMoney(0, master, youth)).toBe(0);
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

    it("pays fixed manager and rival stipends from market working capital", () => {
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

      expect(manager.wealth).toBe(MARKET_MANAGER_STIPEND);
      expect(rival.wealth).toBe(MARKET_RIVAL_STIPEND);
      expect(getMarkets()[0].marketTreasury?.balance).toBe(100 - MARKET_MANAGER_STIPEND - MARKET_RIVAL_STIPEND);
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

    it("seeds a fresh ruler's wealth within the household floor/cap × short back-pay window", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0.2, rural: 100, urban: 100 } as unknown as State;
      const ruler = makeCharacter({ i: 60, wealth: 0 });
      worldContext.pack = { states: [state], characters: [ruler], provinces: [], burgs: [] } as unknown as PackedGraph;
      setRulerId(state, ruler.i);

      seedMissingCharacterWealth();

      // income = 40; raw household 10 (floor 3, cap 15 — neither binds); 4–10 cycles => [40, 100]
      expect(ruler.wealth).toBeGreaterThanOrEqual(HOUSEHOLD_STIPEND_FLOOR * 4);
      expect(ruler.wealth).toBeLessThanOrEqual(HOUSEHOLD_STIPEND_CAP * 10);
    });

    it("never overwrites a character who already has wealth", () => {
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0.2, rural: 100, urban: 100 } as unknown as State;
      const ruler = makeCharacter({ i: 60, wealth: 5 });
      worldContext.pack = { states: [state], characters: [ruler], provinces: [], burgs: [] } as unknown as PackedGraph;
      setRulerId(state, ruler.i);

      seedMissingCharacterWealth();

      expect(ruler.wealth).toBe(5);
    });

    it("seeds a fresh province lord from the fixed stipend × back-pay, not a treasury percentage", () => {
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

      // fixed PROVINCE_LORD_STIPEND × 4–10 cycles
      expect(lord.wealth).toBeGreaterThanOrEqual(PROVINCE_LORD_STIPEND * 4);
      expect(lord.wealth).toBeLessThanOrEqual(PROVINCE_LORD_STIPEND * 10);
    });

    it("still seeds a fresh province lord's full back-pay when the seated Burg's treasury is empty", () => {
      // Regression: a newly-assigned lord (e.g. a Tribe/Territory Chieftain/Warden appointed
      // after economy's first collectTaxes() cycle) whose seated Burg hasn't accumulated any
      // treasury yet used to be silently skipped and left at wealth 0 forever.
      const state = { i: 1, form: "Anarchy", diplomacy: [], pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      const lord = makeCharacter({
        i: 62,
        wealth: 0,
        titles: [{ title: "Chieftain", landed: true, entityType: "province", entityId: 2 }]
      });
      const burg = { i: 5, treasury: 0 } as unknown as Burg;
      worldContext.pack = {
        states: [state],
        characters: [lord],
        provinces: [undefined, undefined, { i: 2, state: 1, burg: 5, removed: false } as unknown as Province],
        burgs: [undefined, undefined, undefined, undefined, undefined, burg]
      } as unknown as PackedGraph;

      seedMissingCharacterWealth();

      expect(lord.wealth).toBeGreaterThanOrEqual(PROVINCE_LORD_STIPEND * 4);
      expect(lord.wealth).toBeLessThanOrEqual(PROVINCE_LORD_STIPEND * 10);
      // No pool to draw from, so the Burg's own (empty) treasury is left untouched.
      expect(burg.treasury).toBe(0);
    });

    it("still seeds a fresh province lord's back-pay when the province has no seated Burg at all", () => {
      // Regression: assignProvinceLords() sparsely appoints frontier "margrave" lords to any
      // threatened province, burg or not — Warden/Governor/Clan Chief/Steward (Territory/Colony/
      // Clan/Dependency forms) are exactly titleTable.ts's "wild/leftover provinces" bucket, i.e.
      // the ones most likely to have province.burg === 0. Requiring a resolvable Burg here used
      // to skip these lords entirely, leaving them stuck at wealth 0 forever.
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0.2, rural: 0, urban: 0 } as unknown as State;
      const lord = makeCharacter({
        i: 64,
        wealth: 0,
        titles: [{ title: "Warden", landed: true, entityType: "province", entityId: 3 }]
      });
      worldContext.pack = {
        states: [state],
        characters: [lord],
        provinces: [
          undefined,
          undefined,
          undefined,
          { i: 3, state: 1, burg: 0, removed: false } as unknown as Province
        ],
        burgs: [undefined]
      } as unknown as PackedGraph;

      seedMissingCharacterWealth();

      expect(lord.wealth).toBeGreaterThanOrEqual(PROVINCE_LORD_STIPEND * 4);
      expect(lord.wealth).toBeLessThanOrEqual(PROVINCE_LORD_STIPEND * 10);
    });

    it("adds an age-scaled hoard bonus on top of the flat seed for a long-lived hoarding race (Draconic)", () => {
      // Draconic maturity (fertilityStart) = 100, hoard rate 1.0 SP/adult-year (raceWealthBias.ts)
      // => age 1000 banks 900 SP from age alone, dwarfing the flat 1–10 SP province-lord seed —
      // intentional: an ancient Draconic warden is meant to hold an unspendable hoard.
      const races = createDefaultRaces();
      const draconicId = races.find(race => race.key === "draconic")!.i;
      const state = { i: 1, form: "Monarchy", diplomacy: [], pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      const lord = makeCharacter({
        i: 65,
        wealth: 0,
        race: draconicId,
        age: 1000,
        titles: [{ title: "Warden", landed: true, entityType: "province", entityId: 4 }]
      });
      worldContext.pack = {
        races,
        states: [state],
        characters: [lord],
        provinces: [
          undefined,
          undefined,
          undefined,
          undefined,
          { i: 4, state: 1, burg: 0, removed: false } as unknown as Province
        ],
        burgs: [undefined]
      } as unknown as PackedGraph;

      seedMissingCharacterWealth();

      expect(lord.wealth).toBeGreaterThanOrEqual(900);
      expect(lord.wealth).toBeLessThanOrEqual(900 + PROVINCE_LORD_STIPEND * 10 + 1);
    });

    it("still seeds a fresh guild master's full back-pay even from a barely-funded domain", () => {
      const master = makeCharacter({
        i: 63,
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
      });
      worldContext.pack.states = [];
      worldContext.pack.provinces = [];
      worldContext.pack.burgs = [];
      worldContext.pack.characters = [master];
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0.01 }]);

      seedMissingCharacterWealth();

      expect(master.wealth).toBeGreaterThanOrEqual(GUILD_MASTER_STIPEND * 4);
      expect(master.wealth).toBeLessThanOrEqual(GUILD_MASTER_STIPEND * 10);
    });
  });
});
