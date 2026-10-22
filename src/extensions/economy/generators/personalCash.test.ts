import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationExtensionAPI } from "../../../types/extension-api";
import {
  clearCharactersContext,
  getCharacters,
  initCharactersContext,
  nextCharacterId,
  replaceCharacters
} from "../../characters/charactersContext";
import { registerRosterCommands } from "../../characters/roster/commands";
import { invalidateRosterIndex } from "../../characters/roster/model";
import { ensureRoster, ensureSlot, materializeSlots, putOrganization, putRole } from "../../characters/roster/runtime";
import type { RosterRole } from "../../characters/roster/types";
import { clearEconomyContext, getBurgMarketLedgers, initEconomyContext } from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { settleGuildMasterEstate } from "./guildMasterAssets";
import {
  applyLegacyCashCorrection,
  initializeRosterCash,
  personalCashTotal,
  previewLegacyCashCorrection,
  readPersonalCash,
  registerPersonalCash,
  settlePersonalEstates,
  settleRosterCash
} from "./personalCash";
import {
  createPersonalCashState,
  extractCash,
  type PersonalCashPool,
  poolBalance,
  validatePersonalCash
} from "./personalCashLedger";
import { getStateMoneyStocks } from "./stateMoneySupply";

const total = () => getHouseholdWealth(1) + personalCashTotal();
vi.mock("../../characters/personFactory", () => ({
  createPerson: (i: number, culture: number, options: { ageOverride: number; homeStateId: number }) => ({
    i,
    culture,
    name: `Person ${Math.random()}`,
    age: options.ageOverride,
    state: options.homeStateId,
    gender: "female",
    race: 1,
    titles: [],
    pastTitles: [],
    skills: { stewardship: 50 },
    family: { children: 0 }
  })
}));
vi.mock("../../characters/raceAge", () => ({ resolveRaceAgeProfile: () => ({ maturity: 16, lifespan: 75 }) }));
vi.mock("../../characters/fertility", () => ({
  resolveFertilityForRace: () => ({ fertilityStart: 16, fertilityEnd: 45 }),
  lifetimeExpectedBirths: () => 6
}));

let api: SimulationExtensionAPI;
const dispose: (() => void)[] = [];
const role = (id: string, organizationId = "a"): RosterRole => ({
  id,
  organizationId,
  name: "Steward",
  count: 3,
  reason: "Test court",
  purposes: ["centralExecutive"],
  primarySkill: "stewardship",
  roleClass: "central_officer",
  entityType: "state",
  entityId: 1,
  landed: false,
  hereditary: false
});
beforeEach(() => {
  api = {
    worldContext: {
      seed: "seed",
      options: { year: 1000 },
      pack: {
        states: [
          { i: 0 },
          {
            i: 1,
            name: "State",
            culture: 1,
            capital: 1,
            form: "Monarchy",
            rural: 100,
            pollTax: 1,
            householdPurse: 100,
            treasury: 200
          }
        ],
        cells: { i: [] },
        burgs: [{ i: 0 }, { i: 1, state: 1, name: "Town", population: 2 }],
        cultures: [{ i: 0 }, { i: 1, race: 1 }],
        characters: []
      },
      populationRate: 1000
    },
    simulationContext: {
      currentYear: 1000,
      currentMonth: 1,
      currentDay: 1,
      extensions: {
        characters: { characters: [] },
        economy: { burgMarketLedgers: [{ burgId: 1, marketId: 0, merchants: [], householdWealth: 1000 }] }
      }
    },
    isExtensionEnabled: () => true,
    registerMapReadyTask: () => () => {},
    events: new EventTarget()
  } as unknown as SimulationExtensionAPI;
  initCharactersContext(api);
  initEconomyContext(api);
  dispose.push(registerPersonalCash(api));
  const r = ensureRoster();
  putOrganization(r, { id: "a", name: "Court A", stateId: 1, burgId: 1 });
  putOrganization(r, { id: "b", name: "Court B", stateId: 1, burgId: 1, parentId: "a" });
  putRole(r, role("steward"));
  putRole(r, role("guard", "b"));
});
afterEach(() => {
  for (const d of dispose.splice(0)) d();
  clearCharactersContext();
  clearEconomyContext();
});

describe("personal cash lifecycle", () => {
  it("funds an abstract cohort by transferring private household cash without creating people", () => {
    const r = ensureRoster(),
      before = total();
    initializeRosterCash(r);
    expect(getCharacters()).toHaveLength(0);
    expect(r.slots).toHaveLength(0);
    expect(personalCashTotal()).toBeGreaterThan(0);
    expect(total()).toBe(before);
    const after = JSON.stringify(readPersonalCash());
    initializeRosterCash(r);
    expect(JSON.stringify(readPersonalCash())).toBe(after);
  });
  it("connects detailed people to existing cash and reuses even an empty account", () => {
    const r = ensureRoster();
    initializeRosterCash(r);
    const before = total();
    materializeSlots({ roleId: "steward" });
    expect(getCharacters().every(c => c.wealth > 0)).toBe(true);
    expect(total()).toBe(before);
    const c = getCharacters()[0],
      id = c.cashAccountId;
    c.wealth = 0;
    const spentTotal = total();
    materializeSlots({ slotIds: [c.rosterSlotId!] });
    expect(c.cashAccountId).toBe(id);
    expect(c.wealth).toBe(0);
    expect(total()).toBe(spentTotal);
  });
  it("keeps the same current balance when detailing before or after a financial cycle", () => {
    const r = ensureRoster();
    r.roles[0].purposes = ["headOfState"];
    initializeRosterCash(r);
    const initialExtensions = structuredClone(api.simulationContext.extensions);
    const initialStates = structuredClone(api.worldContext.pack.states);
    materializeSlots({ roleId: "steward" });
    const initial = total() + api.worldContext.pack.states[1].householdPurse!;
    settleRosterCash();
    const expected = getCharacters().map(c => c.wealth);
    api.simulationContext.extensions = structuredClone(initialExtensions);
    api.worldContext.pack.states = structuredClone(initialStates);
    settleRosterCash();
    materializeSlots({ roleId: "steward" });
    expect(getCharacters().map(c => c.wealth)).toEqual(expected);
    expect(total() + api.worldContext.pack.states[1].householdPurse!).toBeCloseTo(initial, 2);
    const after = JSON.stringify(readPersonalCash());
    settleRosterCash();
    expect(JSON.stringify(readPersonalCash())).toBe(after);
  });
  it("keeps deceased cash counted, preserves unknown heirs, and permits removal without loss", () => {
    initializeRosterCash(ensureRoster());
    materializeSlots({ roleId: "steward", limit: 1 });
    const c = getCharacters()[0],
      before = getStateMoneyStocks().get(1)!.money;
    c.dead = true;
    expect(getStateMoneyStocks().get(1)!.money).toBe(before);
    const balance = c.wealth;
    settlePersonalEstates();
    expect(c.wealth).toBe(balance);
    replaceCharacters([]);
    expect(getStateMoneyStocks().get(1)!.money).toBe(before);
  });
  it("distributes estates to an undetailed child without generating it", () => {
    const r = ensureRoster();
    initializeRosterCash(r);
    materializeSlots({ roleId: "steward", limit: 1 });
    const parent = r.slots[0],
      child = ensureSlot(r, r.roles[1], 0),
      c = getCharacters()[0];
    r.family.push({ parentId: parent.id, childId: child.id, kind: "birth" });
    c.dead = true;
    getCharacters();
    const before = total();
    settlePersonalEstates();
    expect(c.wealth).toBe(0);
    expect(getCharacters()).toHaveLength(1);
    expect(total()).toBe(before);
    const settled = JSON.stringify(readPersonalCash());
    settlePersonalEstates();
    expect(JSON.stringify(readPersonalCash())).toBe(settled);
  });
  it("rebinds plain serialized Characters to restored canonical accounts after rollback", () => {
    initializeRosterCash(ensureRoster());
    materializeSlots({ roleId: "steward", limit: 1 });
    const snapshot = structuredClone(api.simulationContext.extensions);
    getCharacters()[0].wealth = 0;
    api.simulationContext.extensions = structuredClone(snapshot);
    const c = getCharacters()[0];
    expect(c.wealth).toBeGreaterThan(0);
    const before = c.wealth;
    c.wealth += 1;
    expect(readPersonalCash()!.accounts[c.cashAccountId!].balance).toBe(Math.round((before + 1) * 100));
    validatePersonalCash(JSON.parse(JSON.stringify(readPersonalCash())));
  });
  it("preserves actual legacy zero balances and private-heir distributions", () => {
    materializeSlots({ roleId: "steward", limit: 1 });
    const c = getCharacters()[0];
    c.wealth = 20;
    c.dead = true;
    const before = total();
    const result = settleGuildMasterEstate(c, undefined, undefined);
    expect(result.dispersedToPrivateHeirs).toBe(20);
    expect(total()).toBe(before);
    expect(c.wealth).toBe(0);
  });
});
it("preserves original rounding origins across arbitrary extraction orders", () => {
  const pool = (): PersonalCashPool => ({
    roleId: "r",
    stateId: 1,
    count: 6,
    ranges: [{ start: 0, end: 6, numerator: 10, denominator: 6, offset: 0, delta: 0 }],
    owners: {}
  });
  const a = pool(),
    b = pool(),
    forward = new Map<number, number>(),
    reverse = new Map<number, number>();
  for (const ordinal of [0, 1, 2, 3, 4, 5]) forward.set(ordinal, extractCash(a, ordinal));
  for (const ordinal of [5, 2, 0, 4, 1, 3]) reverse.set(ordinal, extractCash(b, ordinal));
  expect([...forward]).toEqual([...reverse].sort((a, b) => a[0] - b[0]));
  expect([...forward.values()].reduce((a, b) => a + b, 0)).toBe(10);
  expect(poolBalance(a)).toBe(0);
  const invalid = createPersonalCashState();
  invalid.accounts.bad = { id: "bad", stateId: 0, balance: -1, status: "active", managed: false, initialized: true };
  expect(() => validatePersonalCash(invalid)).toThrow();
});

function rosterCommand() {
  const execute = vi.fn();
  Object.assign(api, {
    registerExtensionCommand: (definition: { execute: (value: unknown) => unknown }) => {
      execute.mockImplementation(definition.execute);
      return () => {};
    }
  });
  dispose.push(registerRosterCommands(api));
  return (payload: Record<string, unknown>) => execute(payload);
}
it("detaches details and retains identity, inventory and current money on re-detail", () => {
  const r = ensureRoster();
  initializeRosterCash(r);
  materializeSlots({ roleId: "steward", limit: 1 });
  const c = getCharacters()[0],
    slot = r.slots[0],
    wealth = c.wealth,
    before = total(),
    run = rosterCommand();
  c.inventory = { 1: 2 };
  const id = c.i;
  run({ action: "detachDetails", slotId: slot.id });
  expect(getCharacters()).toHaveLength(0);
  expect(total()).toBe(before);
  materializeSlots({ slotIds: [slot.id] });
  expect(getCharacters()[0]).toMatchObject({ i: id, wealth, inventory: { 1: 2 } });
  expect(total()).toBe(before);
});
it("cancels a person only after moving all cash, and does not regenerate their cancelled slot", () => {
  const r = ensureRoster();
  initializeRosterCash(r);
  materializeSlots({ roleId: "steward", limit: 1 });
  const slot = r.slots[0],
    before = total(),
    run = rosterCommand();
  run({ action: "cancelPerson", slotId: slot.id });
  expect(slot.removedFromWorld).toBe(true);
  expect(total()).toBe(before);
  expect(getCharacters()).toHaveLength(0);
  materializeSlots({ slotIds: [slot.id] });
  expect(getCharacters()).toHaveLength(0);
});
it("keeps outstanding inventory and contracts from being silently pruned or cancelled", () => {
  initializeRosterCash(ensureRoster());
  materializeSlots({ roleId: "steward", limit: 1 });
  const c = getCharacters()[0],
    slot = ensureRoster().slots[0],
    run = rosterCommand(),
    before = total();
  c.inventory = { 1: 1 };
  expect(() => replaceCharacters([])).toThrow("assets");
  expect(() => run({ action: "cancelPerson", slotId: slot.id })).toThrow("inventory");
  expect(total()).toBe(before);
  expect(getCharacters()).toHaveLength(1);
});

it("preserves legacy zero savings until an explicit funded correction, at most once", () => {
  const r = ensureRoster(),
    slot = ensureSlot(r, r.roles[0], 0);
  const c = {
    i: 40,
    state: 1,
    culture: 1,
    location: 1,
    age: 35,
    wealth: 0,
    titles: [],
    pastTitles: [],
    skills: { stewardship: 50 },
    gender: "female",
    rosterSlotId: slot.id
  } as never;
  slot.characterId = 40;
  getCharacters().push(c);
  getCharacters();
  initializeRosterCash(r);
  expect(getCharacters()[0].wealth).toBe(0);
  const before = total(),
    preview = previewLegacyCashCorrection();
  expect(preview.count).toBe(1);
  expect(preview.amount).toBeGreaterThan(0);
  applyLegacyCashCorrection(preview.token);
  expect(total()).toBe(before);
  expect(getCharacters()[0].wealth).toBe(preview.amount);
  getCharacters()[0].wealth = 0;
  expect(previewLegacyCashCorrection().count).toBe(0);
  expect(() => applyLegacyCashCorrection(preview.token)).toThrow("preview changed");
});

it("validates every initial allocation before debiting any household", () => {
  const r = ensureRoster();
  api.worldContext.pack.burgs.push({ i: 2, state: 1, name: "Other town" } as never);
  getBurgMarketLedgers().push({ burgId: 2, marketId: 0, merchants: [], householdWealth: 1000 });
  r.organizations[1].burgId = 2;
  r.roles[1].count = Number.NaN;
  const before = getBurgMarketLedgers().map(l => l.householdWealth);
  expect(() => initializeRosterCash(r)).toThrow();
  expect(getBurgMarketLedgers().map(l => l.householdWealth)).toEqual(before);
  expect(readPersonalCash()!.pools).toEqual({});
  expect(readPersonalCash()!.initialized).toBe(false);
  r.roles[1].count = 3;
  initializeRosterCash(r);
  expect(getHouseholdWealth(1) + getHouseholdWealth(2) + personalCashTotal()).toBe(2000);
});
it("settles later receipts into an already distributed estate without replay conflicts", () => {
  const r = ensureRoster();
  initializeRosterCash(r);
  materializeSlots({ roleId: "steward", limit: 1 });
  const c = getCharacters()[0],
    child = ensureSlot(r, r.roles[1], 0);
  r.family.push({ parentId: c.rosterSlotId!, childId: child.id, kind: "birth" });
  c.dead = true;
  for (const receipt of [20, 20, 35]) {
    c.wealth = receipt;
    const before = total();
    settleGuildMasterEstate(c, undefined, undefined);
    settlePersonalEstates();
    expect(readPersonalCash()!.accounts[`heirs:${c.cashAccountId}`].balance).toBe(0);
    expect(total()).toBe(before);
    expect(Object.keys(readPersonalCash()!.transactions).some(k => k.startsWith("estate:"))).toBe(false);
  }
});
it.each([false, true])("pays a successor once with predecessor details absent (detailed=%s)", detailed => {
  const r = ensureRoster();
  r.roles[0].purposes = ["headOfState"];
  initializeRosterCash(r);
  const original = ensureSlot(r, r.roles[0], 0);
  original.deathYear = 1000;
  r.appointments.find(a => a.slotId === original.id)!.endYear = 1000;
  invalidateRosterIndex(r);
  const successor = ensureSlot(r, r.roles[0], 0);
  expect(successor.generation).toBe(1);
  if (detailed) materializeSlots({ slotIds: [successor.id] });
  const source = api.worldContext.pack.states[1];
  const before = total() + source.householdPurse!;
  const pool = readPersonalCash()!.pools.steward;
  settleRosterCash();
  expect(source.householdPurse).toBe(55); // Three seats at 15 each, including one successor.
  expect(pool.ranges.reduce((count, range) => count + range.end - range.start, 0)).toBe(2);
  expect(total() + source.householdPurse!).toBe(before);
  expect(readPersonalCash()!.accounts[`person:${original.id}`].status).toBe("estate");
  expect(readPersonalCash()!.accounts[`person:${successor.id}`].balance).toBeGreaterThan(0);
});
it("retains a removed identity and reserves ids for every generator", () => {
  initializeRosterCash(ensureRoster());
  materializeSlots({ roleId: "steward", limit: 1 });
  const c = getCharacters()[0],
    slot = ensureRoster().slots[0];
  replaceCharacters([]);
  expect(slot.characterId).toBeUndefined();
  expect(slot.retainedCharacterId).toBe(c.i);
  expect(readPersonalCash()!.accounts[c.cashAccountId!].characterId).toBeUndefined();
  const first = nextCharacterId([]);
  expect(first).toBeGreaterThan(c.i);
  expect(nextCharacterId([])).toBe(first + 1);
});
it("rejects invalid projected balances without changing canonical cash", () => {
  initializeRosterCash(ensureRoster());
  materializeSlots({ roleId: "steward", limit: 1 });
  const c = getCharacters()[0],
    before = total();
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => {
      c.wealth = invalid;
    }).toThrow("Cash must");
    expect(total()).toBe(before);
  }
});
