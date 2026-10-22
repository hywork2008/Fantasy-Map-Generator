import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { clearEconomyContext, initEconomyContext } from "../../economy/economyContext";
import { getHouseholdWealth } from "../../economy/generators/burgMarketLedgers";
import { initializeRosterCash, personalCashTotal, registerPersonalCash } from "../../economy/generators/personalCash";
import {
  clearCharactersContext,
  getCharacters,
  getSimulationCharacters,
  initCharactersContext,
  replaceCharacters
} from "../charactersContext";
import type { Character } from "../characterTypes";
import { buildWorldRoster } from "../roster/build";
import { registerRosterLifecycle } from "../roster/lifecycle";
import { createPresetPlan, executePresetBatch } from "../roster/presetRuntime";
import { previewPreset } from "../roster/presets";
import { defaultPresetQuery } from "../roster/presetTypes";
import { ensureChildren, materializeSlots } from "../roster/runtime";
import { encodeReference, flushReference, readReference, validateReference } from "./model";

vi.mock("../personFactory", () => ({
  createPerson: vi.fn((i: number, culture: number) => ({
    i,
    culture,
    name: "Supplemented family",
    age: 20,
    gender: "female",
    state: 1,
    race: 1,
    titles: [],
    pastTitles: [],
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, childIds: [], spouseIds: [] },
    skills: { stewardship: 50 }
  }))
}));
vi.mock("../raceAge", () => ({ resolveRaceAgeProfile: () => ({ maturity: 16, lifespan: 75 }) }));
let api: SimulationExtensionAPI, dispose: () => void;
const person = (i: number): Character =>
  ({
    i,
    culture: 1,
    name: `Reference ${i}`,
    age: 45,
    gender: "female",
    state: 1,
    race: 1,
    location: 1,
    titles: [],
    pastTitles: [],
    wealth: i * 3.14,
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, childIds: [], spouseIds: [] },
    skills: { stewardship: 50 }
  }) as Character;
beforeEach(() => {
  api = {
    worldContext: {
      seed: "reference",
      options: { year: 1000 },
      populationRate: 1000,
      pack: {
        states: [
          { i: 0 },
          {
            i: 1,
            name: "State",
            culture: 1,
            capital: 1,
            form: "Monarchy",
            military: [{ i: 0, name: "Guard", commanderId: 1, isCapitalGuard: true }]
          }
        ],
        burgs: [{ i: 0 }, { i: 1, name: "Town", state: 1, population: 2 }],
        cultures: [{ i: 0 }, { i: 1, race: 1 }],
        cells: { i: [] },
        characters: [],
        markets: [{ i: 1, centerBurgId: 1 }],
        merchantOrganizations: [{ i: 1, name: "Company", homeStateId: 1, homeBurgId: 1 }]
      }
    },
    simulationContext: {
      currentYear: 1000,
      currentMonth: 1,
      currentDay: 1,
      extensions: {
        characters: { characters: [], nextCharacterId: 7 },
        economy: {
          burgMarketLedgers: [{ burgId: 1, marketId: 1, merchants: [], householdWealth: 1000 }],
          guildKnowledgeStocks: [{ burgId: 1, domain: "metallurgy", stock: 1, treasury: 20 }]
        }
      }
    },
    isExtensionEnabled: () => true,
    events: new EventTarget(),
    registerMapReadyTask: () => () => {}
  } as unknown as SimulationExtensionAPI;
  const people = Array.from({ length: 6 }, (_, i) => person(i + 1));
  people[0].titles = [{ title: "Queen", entityType: "state", entityId: 1, landed: true, startYear: 980 }];
  people[0].family = { spouses: 1, children: 2, grandchildren: 3, greatGrandchildren: 1, childIds: [], spouseIds: [] };
  people[1].titles = [{ title: "Chancellor", entityType: "state", entityId: 1, landed: false, startYear: 990 }];
  people[2].roles = [
    { source: "economy", kind: "marketManager", entityType: "market", entityId: 1, label: "Market Manager" },
    {
      source: "economy",
      kind: "merchantOrganizationHead",
      entityType: "burg",
      entityId: 1,
      organizationId: 1,
      label: "Company Head"
    }
  ];
  people[3].roles = [
    { source: "economy", kind: "marketRivalMerchant", entityType: "market", entityId: 1, label: "Merchant" }
  ];
  people[4].roles = [
    {
      source: "economy",
      kind: "guildMaster",
      entityType: "burg",
      entityId: 1,
      domain: "metallurgy",
      label: "Guild Master"
    }
  ];
  people[5].roles = [
    {
      source: "economy",
      kind: "guildApprentice",
      entityType: "burg",
      entityId: 1,
      domain: "metallurgy",
      organizationId: 5,
      label: "Guild Apprentice"
    }
  ];
  people[5].wealth = 0;
  api.simulationContext.extensions.characters!.referenceGeneration = encodeReference(
    people,
    api.simulationContext,
    "fixture",
    ["economy.initialization", "nobility.initialization"]
  );
  initCharactersContext(api);
  initEconomyContext(api);
  dispose = registerPersonalCash(api);
});
afterEach(() => {
  dispose();
  clearCharactersContext();
  clearEconomyContext();
});
const all = () => ({ ...defaultPresetQuery(), presets: ["master-all" as const] });
const run = (query = all()) => {
  const r = buildWorldRoster();
  const p = createPresetPlan(r, query, "memo");
  while (p.cursor < p.seats.length) executePresetBatch(r, p.id);
  return r;
};
describe("master reference materialization", () => {
  it("reserves the exact cohort and wallets, publishing only selected sheets", () => {
    const r = buildWorldRoster();
    initializeRosterCash(r);
    expect(getCharacters()).toHaveLength(0);
    expect(getSimulationCharacters()).toHaveLength(6);
    const before = getHouseholdWealth(1) + personalCashTotal();
    const leadership = {
      ...defaultPresetQuery(),
      presets: ["state-heads", "national-leadership"] as ("state-heads" | "national-leadership")[]
    };
    expect(previewPreset(r, leadership, 1000).people).toBe(2);
    const plan = createPresetPlan(r, leadership, "memo");
    executePresetBatch(r, plan.id);
    expect(getCharacters()).toHaveLength(2);
    expect(getSimulationCharacters()).toHaveLength(6);
    run();
    expect(getCharacters()).toHaveLength(6);
    expect([...getCharacters()].sort((a, b) => a.i - b.i).map(c => c.wealth)).toEqual(
      [3.14, 6.28, 9.42, 12.56, 15.700000000000001, 0].map(n => Math.round(n * 100) / 100)
    );
    expect(getHouseholdWealth(1) + personalCashTotal()).toBe(before);
    expect(getHouseholdWealth(1)).toBe(1000);
    expect(getCharacters().find(c => c.i === 1)!.family).toMatchObject({
      spouses: 1,
      children: 2,
      grandchildren: 3,
      greatGrandchildren: 1
    });
    expect(getCharacters().find(c => c.i === 1)!.titles[0].startYear).toBe(980);
  });
  it("reuses people across market/company and guard/marshal-style appointments", () => {
    const r = buildWorldRoster();
    const manager = r.slots.find(s => s.referenceId === 3)!;
    expect(r.appointments.filter(a => a.slotId === manager.id)).toHaveLength(2);
    const guard = r.roles.find(role => role.regimentId === 0)!;
    expect(r.appointments.find(a => a.roleId === guard.id)?.slotId).toBe("master:1");
    expect(previewPreset(r, all(), 1000).people).toBe(6);
  });
  it("keeps aggregate children while resolving only the requested family details", () => {
    const r = buildWorldRoster();
    initializeRosterCash(r);
    const parent = r.slots.find(s => s.referenceId === 1)!;
    materializeSlots({ slotIds: [parent.id], mode: "memo" });
    const children = ensureChildren(r, parent);
    expect(children).toHaveLength(2);
    expect(getCharacters()).toHaveLength(1);
    materializeSlots({ slotIds: [children[1].id], mode: "memo" });
    expect(getCharacters()).toHaveLength(2);
    expect(getCharacters()[0].family.children).toBe(2);
    expect(getCharacters()[0].family.spouses).toBe(1);
    expect(getCharacters()[0].family.grandchildren).toBe(3);
  });
  it("preserves current cash and authored detail through detach, save and reload", () => {
    const r = buildWorldRoster();
    initializeRosterCash(r);
    const parent = r.slots.find(s => s.referenceId === 1)!;
    materializeSlots({ slotIds: [parent.id], mode: "memo" });
    getCharacters()[0].wealth = 1.23;
    getCharacters()[0].name = "Authored";
    replaceCharacters([]);
    expect(getCharacters()).toHaveLength(0);
    flushReference(api.simulationContext);
    api.simulationContext.extensions = structuredClone(api.simulationContext.extensions);
    const loaded = buildWorldRoster();
    materializeSlots({ slotIds: [loaded.slots.find(s => s.referenceId === 1)!.id], mode: "memo" });
    expect(getCharacters()[0]).toMatchObject({
      i: 1,
      name: "Authored",
      wealth: 1.23,
      family: { children: 2, spouses: 1 }
    });
    validateReference(readReference(api.simulationContext));
  });
  it("rejects duplicate identity and mismatched serialized numeric ids", () => {
    const p = structuredClone(readReference(api.simulationContext)!);
    p.people.push({ ...p.people[0] });
    expect(() => validateReference(p)).toThrow();
    const q = structuredClone(readReference(api.simulationContext)!);
    q.people[0].values[q.fields.indexOf("i")] = 999;
    expect(() => validateReference(q)).toThrow();
  });
});

it("keeps canonical cash live when a memo sheet is restored after a tick", () => {
  const r = buildWorldRoster();
  initializeRosterCash(r);
  materializeSlots({ slotIds: ["master:1"], mode: "memo" });
  const systems = new Map<string, (...args: unknown[]) => void>();
  Object.assign(api, {
    registerSimulationSystem: (definition: { id: string; run: (...args: unknown[]) => void }) => {
      systems.set(definition.id, definition.run);
      return () => {};
    }
  });
  const unregister = registerRosterLifecycle(api);
  try {
    systems.get("characters.roster.prepare")!({ delta: { years: 0, months: 0, days: 1 } });
    const c = getCharacters()[0];
    c.wealth = 2.5;
    systems.get("characters.roster.finalize")!({}, { markChanged: () => {} });
    expect(getCharacters()[0].wealth).toBe(2.5);
    expect(getCharacters()[0].family.children).toBe(2);
  } finally {
    unregister();
  }
});

it("publishes explicit additions without publishing the dormant cohort", () => {
  buildWorldRoster();
  getSimulationCharacters().push(person(7));
  expect(getCharacters().map(c => c.i)).toEqual([7]);
  expect(getSimulationCharacters()).toHaveLength(7);
});
