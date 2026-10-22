import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { buildNobilityRoster } from "../../nobility/holdings/rosterProvider";
import { clearNobilityContext, initNobilityContext } from "../../nobility/nobilityContext";
import { clearCharactersContext, getCharacters, initCharactersContext } from "../charactersContext";
import { buildWorldRoster } from "./build";
import { registerRosterCommands } from "./commands";
import { addPatronage, establishChurch, religiousSiteCandidates } from "./institutions";
import { invalidateRosterIndex, validateWorldRoster } from "./model";
import { createPresetPlan, executePresetBatch } from "./presetRuntime";
import { previewPreset } from "./presets";
import { defaultPresetQuery, type PresetQuery } from "./presetTypes";
import { ensureRoster, ensureSlot, materializeSlots, putOrganization, putRole } from "./runtime";
import type { RosterRole } from "./types";

vi.mock("../../hostCore", () => ({ analyzeFrontiers: () => new Map(), getProvinceThreats: () => new Map() }));
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
        burgs: [
          { i: 0 },
          { i: 1, state: 1, cell: 1, culture: 1, x: 0, y: 0, name: "Town", population: 7, temple: true },
          { i: 2, state: 2, cell: 2, culture: 1, x: 10, y: 0, name: "Foreign", population: 2 }
        ],
        cells: { religion: [0, 1, 1] },
        religions: [{ i: 0 }, { i: 1, name: "Faith", type: "Organized" }],
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
  clearNobilityContext();
});

const query = (presets: PresetQuery["presets"], extra: Partial<PresetQuery> = {}): PresetQuery => ({
  ...defaultPresetQuery(),
  presets,
  ...extra
});
const preview = (q: PresetQuery) => previewPreset(ensureRoster(), q, 1000);
function classify() {
  const r = ensureRoster();
  r.roles[0].purposes = ["headOfState", "centralExecutive"];
  r.roles[1].purposes = ["centralExecutive"];
  return r;
}

describe("generation presets", () => {
  it("previews overlapping types as a union without mutating slots, identities or institutions", () => {
    const r = classify(),
      before = JSON.stringify(r);
    expect(preview(query(["state-heads", "national-leadership"]))).toMatchObject({
      required: 6,
      people: 6,
      generate: 6
    });
    expect(JSON.stringify(r)).toBe(before);
    expect(getCharacters()).toHaveLength(0);
  });
  it("deduplicates appointments sharing a person and preserves already generated memo characters", () => {
    const r = classify();
    const slot = ensureSlot(r, r.roles[0], 0);
    r.appointments.push({ roleId: r.roles[1].id, ordinal: 0, slotId: slot.id, startYear: 1000 });
    expect(preview(query(["national-leadership"]))).toMatchObject({ required: 6, people: 5, generate: 5 });
    materializeSlots({ slotIds: [slot.id] });
    slot.notes = "Keep";
    slot.protection.fields = ["name"];
    const plan = createPresetPlan(r, query(["national-leadership"]));
    executePresetBatch(r, plan.id);
    expect(getCharacters()).toHaveLength(5);
    expect(slot.notes).toBe("Keep");
    expect(slot.protection.fields).toEqual(["name"]);
    expect(preview(query(["national-leadership"]))).toMatchObject({ people: 5, generate: 0, existing: 5 });
  });
  it("excludes vacancies rather than selecting successors", () => {
    const r = classify();
    const slot = ensureSlot(r, r.roles[0], 0);
    r.appointments[0].endYear = 1000;
    slot.deathYear = 1000;
    invalidateRosterIndex(r);
    expect(preview(query(["state-heads"]))).toMatchObject({ required: 3, generate: 2, vacant: 1 });
    executePresetBatch(r, createPresetPlan(r, query(["state-heads"])).id);
    expect(getCharacters()).toHaveLength(2);
    expect(r.appointments.filter(a => a.ordinal === 0)).toHaveLength(1);
  });
  it("freezes scope, processes batches and survives archive round trips", () => {
    const r = classify();
    r.roles[0].count = 30;
    const plan = createPresetPlan(r, query(["state-heads"]));
    putRole(r, { ...role("new-head"), purposes: ["headOfState"] });
    executePresetBatch(r, plan.id);
    expect(plan.cursor).toBe(25);
    expect(getCharacters()).toHaveLength(25);
    const restored = JSON.parse(JSON.stringify(r));
    validateWorldRoster(restored);
    api.simulationContext.extensions.characters!.roster = restored;
    executePresetBatch(restored, plan.id);
    expect(getCharacters()).toHaveLength(30);
    expect(preview(query(["state-heads"])).generate).toBe(3);
  });
  it("rejects changed institutions and dates before generating any remaining people", () => {
    const r = classify();
    const plan = createPresetPlan(r, query(["state-heads"]));
    r.roles[0].count++;
    expect(() => executePresetBatch(r, plan.id)).toThrow("plan changed");
    expect(getCharacters()).toHaveLength(0);
    r.roles[0].count--;
    api.simulationContext.currentYear++;
    expect(() => executePresetBatch(r, plan.id)).toThrow("world date");
  });
  it("applies country, ancestry and formation filters without assuming regiments are corps", () => {
    const r = classify();
    r.organizations[0].formation = "land";
    r.organizations[1].formation = "sea";
    r.organizations[1].stateId = 2;
    r.roles.forEach(role => {
      role.purposes = ["unitCommander"];
    });
    expect(preview(query(["field-commanders"], { military: "land" })).required).toBe(3);
    expect(preview(query(["field-commanders"], { military: "corps" })).warnings).toContain("noCorps");
    expect(preview(query(["field-commanders"], { stateIds: [2] })).required).toBe(3);
    expect(preview(query(["field-commanders"], { organizationId: "a", descendants: false })).required).toBe(3);
  });
  it("selects only major secular feudal offices in monarchies", () => {
    const r = classify();
    putOrganization(r, { id: "state:1", name: "State", stateId: 1, polity: "Monarchy" });
    r.roles[0].purposes = ["secularLord"];
    r.roles[0].majorLord = true;
    r.roles[1].purposes = ["territorialAdministrator"];
    r.roles[1].landed = true;
    expect(preview(query(["major-feudal-lords"])).required).toBe(3);
    r.organizations.find(o => o.id === "state:1")!.polity = "Republic";
    expect(preview(query(["major-feudal-lords"])).required).toBe(0);
  });
  it("creates a transnational church only after explicit setup, sharing urban lead with parish clergy", () => {
    const r = ensureRoster(),
      before = JSON.stringify(r);
    expect(religiousSiteCandidates(1)).toHaveLength(2);
    expect(JSON.stringify(r)).toBe(before);
    const church = establishChurch(r, {
      religionId: 1,
      name: "Church",
      burgIds: [1, 2],
      parishPopulation: 3000,
      citiesPerDiocese: 8,
      adherentShare: 1
    });
    expect(getCharacters()).toHaveLength(0);
    expect(r.slots).toHaveLength(0);
    expect(preview(query(["urban-clergy"]))).toMatchObject({ required: 2, generate: 2 });
    expect(preview(query(["urban-clergy"], { clergy: "parishes" }))).toMatchObject({ required: 4, generate: 4 });
    expect(preview(query(["religious-leaders"]))).toMatchObject({ required: 2 });
    expect(preview(query(["religious-leaders"], { stateIds: [2], geography: "activity" }))).toMatchObject({
      required: 2
    });
    expect(preview(query(["urban-clergy"], { organizationId: church })).required).toBe(2);
    executePresetBatch(r, createPresetPlan(r, query(["urban-clergy"])).id);
    expect(preview(query(["urban-clergy"], { clergy: "parishes" }))).toMatchObject({ generate: 2, existing: 2 });
    validateWorldRoster(JSON.parse(JSON.stringify(r)));
  });
  it("does not assign more than the total adherents to several churches of the same faith", () => {
    const r = ensureRoster();
    const setup = {
      religionId: 1,
      name: "Church",
      burgIds: [1],
      parishPopulation: 3000,
      citiesPerDiocese: 8,
      adherentShare: 0.6
    };
    establishChurch(r, setup);
    const before = JSON.stringify(r);
    expect(() => establishChurch(r, setup)).toThrow("100%");
    expect(JSON.stringify(r)).toBe(before);
  });
  it("counts only contracted representative seats, even in a mixed preset with rulers", () => {
    const r = classify();
    r.organizations[1].kind = "company";
    r.roles[1].purposes = ["marketMerchant"];
    addPatronage(r, { patronId: "a", supplierId: "b", roleId: "guard", ordinal: 1, domain: "Arms" });
    addPatronage(r, { patronId: "a", supplierId: "b", roleId: "guard", ordinal: 1, domain: "Food" });
    expect(preview(query(["court-suppliers"]))).toMatchObject({ required: 1, generate: 1 });
    expect(preview(query(["court-suppliers", "state-heads"]))).toMatchObject({ required: 4, generate: 4 });
    expect(r.slots).toHaveLength(0);
    executePresetBatch(r, createPresetPlan(r, query(["court-suppliers"])).id);
    expect(getCharacters()).toHaveLength(1);
    expect(preview(query(["court-suppliers"]))).toMatchObject({ existing: 1, generate: 0 });
  });
  it("keeps unresolved clergy out of generation and validates optional saved data", () => {
    const r = classify();
    r.roles[0].purposes = ["urbanClergyLead"];
    r.roles[0].unresolved = true;
    expect(preview(query(["urban-clergy"]))).toMatchObject({ required: 3, generate: 0, unresolved: 3 });
    r.savedPresets = [{ id: "test", name: "Test", query: query(["state-heads"]) }];
    validateWorldRoster(r);
    const invalid = structuredClone(r);
    invalid.savedPresets![0].query.presets = ["invalid" as never];
    expect(() => validateWorldRoster(invalid)).toThrow();
  });
});

describe("preset command boundary", () => {
  function commands() {
    const execute = vi.fn();
    Object.assign(api, {
      registerExtensionCommand: (definition: { execute: (value: unknown) => unknown }) => {
        execute.mockImplementation(definition.execute);
        return () => {};
      }
    });
    registerRosterCommands(api);
    return (payload: Record<string, unknown>) => execute(payload);
  }
  it("checks a preview snapshot and saves reusable queries without generating people", () => {
    const r = classify(),
      run = commands(),
      q = query(["state-heads"]),
      p = preview(q);
    run({ action: "savePreset", name: "Heads", query: q });
    expect(r.savedPresets?.[0].query).toEqual(q);
    r.roles[0].count++;
    expect(() => run({ action: "presetPlan", query: q, expected: JSON.stringify(p) })).toThrow("Preview changed");
    expect(r.presetPlans).toBeUndefined();
    expect(getCharacters()).toHaveLength(0);
  });
  it("explicitly shares a seat occupant, preserving locks and refusing occupied targets", () => {
    const r = classify(),
      run = commands();
    const source = ensureSlot(r, r.roles[0], 0);
    source.protection.fields = ["organizationId"];
    run({
      action: "shareAppointment",
      sourceRoleId: r.roles[0].id,
      sourceOrdinal: 0,
      targetRoleId: r.roles[1].id,
      targetOrdinal: 0
    });
    expect(r.slots).toHaveLength(1);
    expect(getCharacters()).toHaveLength(0);
    expect(preview(query(["national-leadership"]))).toMatchObject({ people: 5, generate: 5 });
    expect(() =>
      run({
        action: "shareAppointment",
        sourceRoleId: r.roles[0].id,
        sourceOrdinal: 1,
        targetRoleId: r.roles[1].id,
        targetOrdinal: 0
      })
    ).toThrow();
    expect(source.organizationId).toBe("a");
    validateWorldRoster(r);
  });
  it("rejects staffing edits that remove existing occupied ordinals", () => {
    const r = classify(),
      run = commands();
    ensureSlot(r, r.roles[0], 2);
    expect(() => run({ action: "classifyRole", roleId: r.roles[0].id, purposes: ["headOfState"], count: 1 })).toThrow(
      "current occupants"
    );
    expect(r.roles[0].count).toBe(3);
    run({ action: "classifyRole", roleId: r.roles[0].id, purposes: ["guildHead"], count: 3, occupation: "smith" });
    expect(preview(query(["guild-leaders"])).required).toBe(3);
  });
  it("revalidates active patronage before executing a frozen plan", () => {
    const r = classify(),
      run = commands();
    addPatronage(r, { patronId: "a", supplierId: "b", roleId: "guard", ordinal: 0, domain: "Food" });
    const plan = createPresetPlan(r, query(["court-suppliers"]));
    run({ action: "endPatronage", contractId: r.patronage![0].id });
    expect(() => executePresetBatch(r, plan.id)).toThrow("plan changed");
    expect(getCharacters()).toHaveLength(0);
  });
});

it("provides small-unit commanders within existing strength, and does not invent corps", () => {
  initNobilityContext(api);
  const pack = api.worldContext.pack;
  Object.assign(pack, { provinces: [], cells: { burg: [0, 1] } });
  Object.assign(pack.states[1], {
    form: "Monarchy",
    formName: "Kingdom",
    military: [
      { i: 1, a: 12, cell: 1, n: 0, name: "Small unit" },
      { i: 2, a: 200, cell: 1, n: 1, name: "Fleet" }
    ]
  });
  buildWorldRoster();
  const r = ensureRoster();
  buildNobilityRoster(r);
  expect(preview(query(["field-commanders"]))).toMatchObject({ required: 2, generate: 2 });
  expect(preview(query(["field-commanders"], { military: "land" })).required).toBe(1);
  expect(preview(query(["field-commanders"], { military: "corps" })).required).toBe(0);
  expect(r.roles.filter(r => r.organizationId.includes(":regiment:")).reduce((sum, r) => sum + r.count, 0)).toBe(212);
  expect(getCharacters()).toHaveLength(0);
  r.organizations.find(o => o.id === "state:1:military:regiment:1")!.formation = "corps";
  expect(preview(query(["field-commanders"], { military: "land" })).required).toBe(1);
});
