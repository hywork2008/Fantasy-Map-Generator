import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSimulationWatches } from "../../../runtime/simulationWatches";
import { createWorldRuntime } from "../../../runtime/worldRuntime";
import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { clearCharactersContext, getCharacters, initCharactersContext } from "../charactersContext";
import { buildWorldRoster } from "./build";
import { advanceRoster, registerRosterWatches } from "./lifecycle";
import { summarizeRoster, validateWorldRoster } from "./model";
import {
  continueRoster,
  ensureChildren,
  ensureRoster,
  ensureSlot,
  materializeSlots,
  migrateCharacters,
  putOrganization,
  putRole,
  setScope
} from "./runtime";
import type { RosterRole } from "./types";

vi.mock("../personFactory", () => ({
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
vi.mock("../raceAge", () => ({ resolveRaceAgeProfile: () => ({ maturity: 16, lifespan: 75 }) }));
vi.mock("../fertility", () => ({
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
        states: [{ i: 0 }, { i: 1, name: "State", culture: 1, capital: 1 }],
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
      extensions: { characters: { characters: [] } }
    },
    isExtensionEnabled: () => true,
    events: new EventTarget()
  } as unknown as SimulationExtensionAPI;
  initCharactersContext(api);
  const r = ensureRoster();
  putOrganization(r, { id: "a", name: "Court A", stateId: 1 });
  putOrganization(r, { id: "b", name: "Court B", stateId: 1, parentId: "a" });
  putRole(r, role("steward"));
  putRole(r, role("guard", "b"));
});
afterEach(() => {
  for (const d of dispose.splice(0)) d();
  clearCharactersContext();
});

describe("organization roster", () => {
  it("builds and displays necessary staffs without generating characters or individual records for every seat", () => {
    const r = buildWorldRoster();
    expect(getCharacters()).toHaveLength(0);
    expect(r.roles.some(role => role.name === "Mayor")).toBe(true);
    expect(summarizeRoster(r, { organizationId: "a", descendants: true })).toMatchObject({
      required: 6,
      unmaterialized: 6,
      vacant: 0
    });
    expect(r.slots).toHaveLength(0);
  });
  it("generates only the selected scope and reuses existing identities on retries", () => {
    const first = materializeSlots({ organizationId: "a", limit: 1 });
    expect(first).toHaveLength(1);
    expect(getCharacters()[0].rosterMode).toBe("memo");
    materializeSlots({ organizationId: "a" });
    expect(getCharacters()).toHaveLength(3);
    materializeSlots({ organizationId: "a" });
    expect(getCharacters()).toHaveLength(3);
    materializeSlots({ organizationId: "a", descendants: true });
    expect(getCharacters()).toHaveLength(6);
    expect(new Set(ensureRoster().slots.map(s => s.characterId)).size).toBe(6);
  });
  it("seeds by identity instead of selection order and restores ambient random", () => {
    const r = ensureRoster(),
      random = Math.random;
    const a = ensureSlot(r, r.roles[0], 0),
      b = ensureSlot(r, r.roles[1], 0);
    materializeSlots({ slotIds: [a.id, b.id] });
    const names = getCharacters().map(c => c.name);
    const savedSlots = structuredClone(r.slots);
    api.simulationContext.extensions.characters!.characters = [];
    r.slots = savedSlots.map(s => ({ ...s, characterId: undefined }));
    materializeSlots({ slotIds: [b.id, a.id] });
    expect(getCharacters().map(c => c.name)).toEqual([...names].reverse());
    expect(Math.random).toBe(random);
  });
  it("preserves sibling identities when one child is detailed before the remaining family", () => {
    const r = ensureRoster(),
      parent = ensureSlot(r, r.roles[0], 0);
    parent.childPlan = [
      { birthYear: 980, gender: "male" },
      { birthYear: 990, gender: "female" }
    ];
    const children = ensureChildren(r, parent);
    materializeSlots({ slotIds: [children[1].id] });
    const id = children[1].characterId;
    materializeSlots({ slotIds: ensureChildren(r, parent).map(c => c.id) });
    expect(children[1].characterId).toBe(id);
    expect(r.family).toHaveLength(2);
    expect(getCharacters()).toHaveLength(2);
  });
  it("advances just selected organizations and does not generate unnamed successors", () => {
    const r = ensureRoster();
    materializeSlots({ organizationId: "a", limit: 1 });
    const slot = r.slots[0],
      age = getCharacters()[0].age;
    api.simulationContext.currentYear = 1010;
    advanceRoster();
    expect(getCharacters()[0].age).toBe(age);
    setScope(r, { organizationId: "a" }, true, false);
    slot.plannedDeathYear = 1011;
    api.simulationContext.currentYear = 1012;
    advanceRoster();
    expect(getCharacters()).toHaveLength(1);
    expect(getCharacters()[0].dead).toBe(true);
    expect(r.appointments.filter(a => a.endYear === undefined)).toHaveLength(3);
  });
  it("blocks time before observed age or death and persists acknowledgement without rerolling", () => {
    const r = ensureRoster(),
      s = ensureSlot(r, r.roles[0], 0);
    s.birthYear = 992;
    s.mode = "simulation";
    s.protection.watchAge = 16;
    s.protection.stopBeforeDeath = true;
    s.plannedDeathYear = 1004;
    dispose.push(registerRosterWatches(api));
    expect(checkSimulationWatches(api.simulationContext, 365 * 100).allowed).toBe(false);
    expect(r.pending).toMatchObject({ kind: "death", year: 1004 });
    const saved = JSON.parse(JSON.stringify(r));
    validateWorldRoster(saved);
    api.simulationContext.extensions.characters!.roster = saved;
    continueRoster(saved);
    expect(checkSimulationWatches(api.simulationContext, 365 * 100).allowed).toBe(false);
    expect(saved.pending.kind).toBe("age");
    expect(saved.slots[0].plannedDeathYear).toBe(1004);
  });
  it("keeps tracked ancestry after several generations without generating full characters", () => {
    const r = ensureRoster(),
      s = ensureSlot(r, r.roles[0], 0);
    s.birthYear = 960;
    s.mode = "simulation";
    s.plannedDeathYear = 1035;
    s.protection.track = "heir";
    s.childPlan = [{ birthYear: 990, gender: "female" }];
    const child = ensureChildren(r, s)[0];
    child.childPlan = [{ birthYear: 1020, gender: "male" }];
    api.simulationContext.currentYear = 1120;
    advanceRoster();
    expect(r.family.length).toBeGreaterThan(1);
    expect(r.family.every(f => r.slots.some(s => s.id === f.parentId))).toBe(true);
    expect(getCharacters()).toHaveLength(0);
  });
  it("rolls back an unexpected death, then applies the same event exactly once after acknowledgement", async () => {
    const r = ensureRoster();
    materializeSlots({ organizationId: "a", limit: 1, mode: "simulation" });
    r.slots[0].protection.stopBeforeDeath = true;
    const world = api.worldContext;
    world.grid = {} as typeof world.grid;
    world.pack.cells = { i: new Uint16Array([0]) } as typeof world.pack.cells;
    world.notes = [];
    const runtime = createWorldRuntime(world, api.simulationContext);
    dispose.push(registerRosterWatches(api));
    runtime.registerSimulationStepDayHandler(() => {
      api.simulationContext.currentDay++;
      getCharacters()[0].dead = true;
      return {
        result: { year: 1000, month: 1, day: api.simulationContext.currentDay, tickCount: 1 },
        topics: ["simulation.clock", "extension.characters"]
      };
    });
    expect(await runtime.dispatch({ type: "simulation.stepDay" })).toBeNull();
    expect(api.simulationContext.currentDay).toBe(1);
    expect(getCharacters()[0].dead).not.toBe(true);
    expect(ensureRoster().pending?.kind).toBe("death");
    continueRoster(ensureRoster());
    expect(await runtime.dispatch({ type: "simulation.stepDay" })).not.toBeNull();
    expect(api.simulationContext.currentDay).toBe(2);
    expect(getCharacters()[0].dead).toBe(true);
  });
  it("migrates old anonymous family counts without replacing existing NPC identities", () => {
    const existing = {
      i: 9,
      culture: 1,
      state: 1,
      race: 1,
      gender: "male",
      age: 50,
      name: "Existing",
      titles: [],
      pastTitles: [],
      family: { spouses: 1, children: 3, grandchildren: 0, greatGrandchildren: 0, childIds: [], spouseIds: [] }
    };
    api.simulationContext.extensions.characters!.characters = [existing];
    migrateCharacters(ensureRoster());
    expect(getCharacters()).toHaveLength(1);
    expect(getCharacters()[0].i).toBe(9);
    expect(ensureRoster().family.filter(f => f.parentId === "legacy:9")).toHaveLength(3);
    expect(ensureRoster().links.filter(l => l.kind === "spouse")).toHaveLength(1);
  });
  it("does not invent births after an observed parent's early death", () => {
    const r = ensureRoster();
    materializeSlots({ organizationId: "a", limit: 1, mode: "simulation" });
    const parent = r.slots[0];
    parent.protection.track = "all";
    parent.protection.materializeDescendants = true;
    parent.childPlan = [{ birthYear: 1005, gender: "female" }];
    const child = ensureChildren(r, parent)[0];
    getCharacters()[0].dead = true;
    api.simulationContext.currentYear = 1001;
    advanceRoster();
    expect(child.cancelledBirth).toBe(true);
    api.simulationContext.currentYear = 1010;
    advanceRoster();
    expect(getCharacters()).toHaveLength(1);
  });
  it("updates the compatibility ruler pointer only while a generated ruler participates", () => {
    const r = ensureRoster();
    const office = { ...role("state:1:court:ruler"), name: "King", landed: true, count: 1 };
    putRole(r, office);
    const [id] = materializeSlots({ roleId: office.id, organizationId: "a", mode: "simulation" });
    expect((api.simulationContext.extensions.nobility!.rulerIdByState as Record<number, number>)[1]).toBe(id);
    const slot = r.slots.find(s => s.characterId === id)!;
    setScope(r, { slotIds: [slot.id] }, false, false);
    expect((api.simulationContext.extensions.nobility!.rulerIdByState as Record<number, number>)[1]).toBeUndefined();
  });
  it("does not activate other organizations when watching one person or selecting one role", () => {
    const r = ensureRoster();
    const a = ensureSlot(r, r.roles[0], 0),
      b = ensureSlot(r, r.roles[1], 0);
    setScope(r, { slotIds: [a.id] }, true, false);
    expect(r.organizations.every(o => !o.simulate)).toBe(true);
    expect(b.mode).toBe("memo");
    setScope(r, { organizationId: "a", roleId: r.roles[0].id }, true, false);
    expect(r.organizations.every(o => !o.simulate)).toBe(true);
    expect(r.roles[0].simulate).toBe(true);
    expect(r.roles[1].simulate).not.toBe(true);
  });
  it("rejects graph cycles, duplicate characters and malformed archive counts", () => {
    const r = ensureRoster();
    validateWorldRoster(r);
    const cycle = structuredClone(r);
    cycle.organizations[0].parentId = "b";
    expect(() => validateWorldRoster(cycle)).toThrow();
    const s = ensureSlot(r, r.roles[0], 0),
      other = ensureSlot(r, r.roles[1], 0);
    s.characterId = other.characterId = 1;
    expect(() => validateWorldRoster(r)).toThrow();
  });
});
