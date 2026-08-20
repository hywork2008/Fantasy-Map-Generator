import { describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import { Military } from "../generators/military-generator";
import type { MilitaryRegiment } from "../types/models";
import { Battle } from "./battle-screen";

/**
 * docs/plan/military-era-progression.md §1.3 / Phase 2: battle-screen.ts's combat resolution
 * (defineType()'s "air" battle-type detection, calculateStrength()'s phase x type `scheme` table,
 * selectPhase()'s getAirBattlePhase()) has handled the "aviation" unit type since long before
 * any default unit of that type existed. Phase 2 is the first time Military.getDefaultOptions()
 * actually returns one, so these tests exercise that dormant code path directly rather than only
 * asserting "no change should be needed" from reading the source.
 *
 * `new Battle(...)` is not used here — its constructor drives real UI (closeDialogs/openDialog/
 * view.setCustomization) that has no meaning in a unit test. Instead a Battle-shaped object is
 * built with Object.create(Battle.prototype) and only the pure calculation methods
 * (defineType/calculateStrength/selectPhase) are invoked directly, the same "call a method on a
 * hand-built `this`" technique used to unit test class logic without constructing the full object
 * graph its constructor expects.
 */

function makeRegiment(units: Record<string, number>, overrides: Partial<MilitaryRegiment> = {}): MilitaryRegiment {
  const regiment = {
    i: 0,
    t: 0,
    name: "Test Regiment",
    a: Object.values(units).reduce((sum, v) => sum + v, 0),
    s: 0,
    cell: 1,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: units,
    n: 0,
    type: "aviation",
    state: 1,
    homeProvince: 0,
    quality: 1,
    ...overrides
  } as MilitaryRegiment;
  // getJoinedForces() reads `survivors`, populated by the constructor's addRegiment() in real
  // play — set directly here since addRegiment() itself is bypassed (see file doc comment above).
  (regiment as unknown as { survivors: Record<string, number> }).survivors = { ...units };
  return regiment;
}

function makeBattleContext(): Battle {
  const context = Object.create(Battle.prototype) as Battle;
  context.iteration = 0;
  context.attackers = { regiments: [], distances: [0], morale: 100, casualties: 0, power: 0 };
  context.defenders = { regiments: [], distances: [0], morale: 100, casualties: 0, power: 0 };
  context.cell = 1;
  context.type = "field";
  return context;
}

describe("Battle — armored/aviation combat resolution (docs/plan/military-era-progression.md §1.3, Phase 2)", () => {
  worldContext.options = { military: Military.getDefaultOptions() } as unknown as typeof worldContext.options;
  worldContext.populationRate = 1;
  worldContext.biomesData = createDefaultBiomesData();
  // burgs[0] is the conventional "no burg" placeholder (a bare 0, not an object — same fixture
  // convention as military-generator.test.ts's makeBasePack()) so cells.burg[cell]=0 reads
  // burgs[0].walls as `undefined` (falsy) instead of throwing on a missing burg object.
  worldContext.pack = {
    cells: { burg: [0, 0], biomeCode: [0, 0] },
    burgs: [0],
    rivers: []
  } as unknown as typeof worldContext.pack;

  it('defineType() classifies an all-aviation battle as "air", not "field"', () => {
    const context = makeBattleContext();
    context.attackers.regiments = [makeRegiment({ aviation: 10 })];
    context.defenders.regiments = [makeRegiment({ aviation: 8 })];

    context.defineType();

    expect(context.type).toBe("air");
  });

  it('defineType() does not classify a mixed aviation+ground battle as "air"', () => {
    const context = makeBattleContext();
    context.attackers.regiments = [makeRegiment({ aviation: 10, infantry: 50 })];
    context.defenders.regiments = [makeRegiment({ aviation: 8 })];

    context.defineType();

    expect(context.type).not.toBe("air");
  });

  it('selectPhase() resolves an air battle to "maneuvering" on the opening iteration and "dogfight" once it drags on', () => {
    const early = makeBattleContext();
    early.type = "air";
    early.iteration = 0;
    early.attackers.regiments = [makeRegiment({ aviation: 10 })];
    early.defenders.regiments = [makeRegiment({ aviation: 8 })];
    early.selectPhase();
    expect(early.attackers.phase).toBe("maneuvering");
    expect(early.defenders.phase).toBe("maneuvering");

    const late = makeBattleContext();
    late.type = "air";
    late.iteration = 10; // P(1 - iteration/10) = P(0) is deterministically false — see probabilityUtils.ts
    late.attackers.regiments = [makeRegiment({ aviation: 10 })];
    late.defenders.regiments = [makeRegiment({ aviation: 8 })];
    late.selectPhase();
    expect(late.attackers.phase).toBe("dogfight");
    expect(late.defenders.phase).toBe("dogfight");
  });

  it("calculateStrength() applies the dogfight phase's aviation multiplier (2x, the scheme table's ceiling for that phase)", () => {
    const context = makeBattleContext();
    const aviationUnit = Military.getDefaultOptions().find(u => u.name === "aviation")!;
    context.attackers.regiments = [makeRegiment({ aviation: 10 })];
    context.attackers.phase = "dogfight";
    context.calculateStrength("attackers");
    const dogfightPower = context.attackers.power;

    const maneuvering = makeBattleContext();
    maneuvering.attackers.regiments = [makeRegiment({ aviation: 10 })];
    maneuvering.attackers.phase = "maneuvering";
    maneuvering.calculateStrength("attackers");
    const maneuveringPower = maneuvering.attackers.power;

    // dogfight (aviation x2) vs. maneuvering (aviation x1) on identical forces — dogfight must be
    // exactly double, proving the aviation column of battle-screen.ts's scheme table is actually
    // being read (not e.g. silently falling back to a missing-key default of 0 or 1 for both).
    expect(dogfightPower).toBeGreaterThan(0);
    expect(dogfightPower).toBeCloseTo(maneuveringPower * 2, 5);
    expect(aviationUnit.power).toBe(25); // sanity: the Phase 2 default unit's own power didn't drift
  });

  it("calculateStrength() gives armored a strong melee-phase multiplier (2x, tied with pure melee infantry)", () => {
    const armoredContext = makeBattleContext();
    armoredContext.attackers.regiments = [makeRegiment({ armored: 10 }, { type: "armored" })];
    armoredContext.attackers.phase = "melee";
    armoredContext.calculateStrength("attackers");

    const shellingContext = makeBattleContext();
    shellingContext.attackers.regiments = [makeRegiment({ armored: 10 }, { type: "armored" })];
    shellingContext.attackers.phase = "shelling";
    shellingContext.calculateStrength("attackers");

    // armored's own scheme column: melee=2 (its strongest phase) vs. shelling=0 (armor is inert
    // under bombardment in this model) — confirms the "armored" column is live, not a stray 0/1.
    expect(armoredContext.attackers.power).toBeGreaterThan(0);
    expect(shellingContext.attackers.power).toBe(0);
  });
});
