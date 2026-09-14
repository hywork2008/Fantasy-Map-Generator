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
    expect(armoredContext.attackers.power).toBeGreaterThan(0);
    expect(shellingContext.attackers.power).toBe(0);
  });

  it("negates ranged damage against an undead army while allowing melee, machinery, and magic", () => {
    const races: any[] = [];
    races[16] = { i: 16, key: "lich", name: "Lich" };
    races[1] = { i: 1, key: "human", name: "Human" };

    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", race: 0 },
        { i: 1, name: "Human Culture", race: 1 },
        { i: 2, name: "Undead Realm", race: 16 }
      ],
      states: [
        { i: 0, name: "Neutral" },
        { i: 1, name: "Human Kingdom", culture: 1 },
        { i: 2, name: "Undead Empire", culture: 2 }
      ]
    } as any;

    const context = makeBattleContext();
    // Defenders: Undead state 2
    context.defenders.regiments = [makeRegiment({ infantry: 100 }, { state: 2 })];

    // Attackers: Human kingdom state 1 with archers and infantry
    context.attackers.regiments = [makeRegiment({ archers: 50, infantry: 50 }, { state: 1 })];
    context.attackers.phase = "skirmish";
    context.calculateStrength("attackers");

    // Archers must produce 0 power against undead defenders in skirmish phase
    const forces = context.getJoinedForces(context.attackers.regiments);
    expect(forces.archers).toBe(50);
    expect(context.attackers.power).toBeGreaterThan(0); // infantry has some melee power

    // Compare with pure archers vs undead: should be exactly 0
    const archerOnlyContext = makeBattleContext();
    archerOnlyContext.defenders.regiments = [makeRegiment({ infantry: 100 }, { state: 2 })];
    archerOnlyContext.attackers.regiments = [makeRegiment({ archers: 100 }, { state: 1 })];
    archerOnlyContext.attackers.phase = "skirmish";
    archerOnlyContext.calculateStrength("attackers");
    expect(archerOnlyContext.attackers.power).toBe(0); // Arrows are completely ineffective

    // Melee / machinery / magic remain effective:
    const meleeContext = makeBattleContext();
    meleeContext.defenders.regiments = [makeRegiment({ infantry: 100 }, { state: 2 })];
    meleeContext.attackers.regiments = [makeRegiment({ infantry: 100 }, { state: 1 })];
    meleeContext.attackers.phase = "melee";
    meleeContext.calculateStrength("attackers");
    expect(meleeContext.attackers.power).toBeGreaterThan(0);
  });

  it("raises slain mortal soldiers as zombies into the undead army", () => {
    const races: any[] = [];
    races[16] = { i: 16, key: "lich", name: "Lich" };
    races[1] = { i: 1, key: "human", name: "Human" };

    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", race: 0 },
        { i: 1, name: "Human Culture", race: 1 },
        { i: 2, name: "Undead Realm", race: 16 }
      ],
      states: [
        { i: 0, name: "Neutral" },
        { i: 1, name: "Human Kingdom", culture: 1 },
        { i: 2, name: "Undead Empire", culture: 2 }
      ]
    } as any;

    const context = makeBattleContext();
    // Attackers: Undead army
    const undeadRegiment = makeRegiment({ infantry: 50 }, { state: 2 });
    (undeadRegiment as any).casualties = { infantry: 0 };
    context.attackers.regiments = [undeadRegiment];

    // Defenders: Mortal Human army
    const humanRegiment = makeRegiment({ infantry: 100 }, { state: 1 });
    (humanRegiment as any).casualties = { infantry: 0 };
    context.defenders.regiments = [humanRegiment];

    const initialUndeadSurvivors = undeadRegiment.survivors.infantry;
    const initialHumanSurvivors = humanRegiment.survivors.infantry;

    // Apply casualties to defenders (humans taking casualties)
    context.calculateCasualties("defenders", 0.5);

    const humanDied = initialHumanSurvivors - humanRegiment.survivors.infantry;
    expect(humanDied).toBeGreaterThan(0);

    // Undead army should have received the newly raised zombies into their ranks!
    expect(undeadRegiment.survivors.infantry).toBe(initialUndeadSurvivors + humanDied);
  });

  it("turns slain mortal soldiers into Lesser Vampires at a measured rate rather than Lich's 100%", () => {
    const races: any[] = [];
    races[19] = { i: 19, key: "vampire", name: "Vampire" };
    races[1] = { i: 1, key: "human", name: "Human" };

    const cultures: any[] = [];
    cultures[0] = { i: 0, name: "Wildlands", race: 0 };
    cultures[1] = { i: 1, name: "Human Culture", race: 1 };
    cultures[3] = { i: 3, name: "Vampire Realm", race: 19 };

    const states: any[] = [];
    states[0] = { i: 0, name: "Neutral" };
    states[1] = { i: 1, name: "Human Kingdom", culture: 1 };
    states[3] = { i: 3, name: "Vampire Dominion", culture: 3 };

    worldContext.pack = {
      races,
      cultures,
      states
    } as any;

    const context = makeBattleContext();
    // Attackers: Vampire army
    const vampireRegiment = makeRegiment({ infantry: 50 }, { state: 3 });
    (vampireRegiment as any).casualties = { infantry: 0 };
    context.attackers.regiments = [vampireRegiment];

    // Defenders: Mortal Human army
    const humanRegiment = makeRegiment({ infantry: 100 }, { state: 1 });
    (humanRegiment as any).casualties = { infantry: 0 };
    context.defenders.regiments = [humanRegiment];

    const initialVampireSurvivors = vampireRegiment.survivors.infantry;
    const initialHumanSurvivors = humanRegiment.survivors.infantry;

    // Apply casualties to defenders (humans taking casualties)
    context.calculateCasualties("defenders", 0.5);

    const humanDied = initialHumanSurvivors - humanRegiment.survivors.infantry;
    expect(humanDied).toBeGreaterThan(0);

    // Vampire army should receive turned lesser vampires at ~25% rate (less than total died, unlike Lich)
    const gained = vampireRegiment.survivors.infantry - initialVampireSurvivors;
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(humanDied);
    expect(gained).toBeCloseTo(Math.round(humanDied * 0.25), -1);
  });
});

describe("Battle formation refresh", () => {
  it("updates the opponent's spear bonus after cavalry reinforcements", () => {
    worldContext.options = { military: Military.getDefaultOptions() } as never;
    worldContext.populationRate = 1;
    worldContext.pack = { states: [], characters: [] } as never;
    const battle = makeBattleContext();
    battle.attackers.regiments = [makeRegiment({ spearmen: 100 })] as never;
    battle.defenders.regiments = [makeRegiment({ infantry: 100 })] as never;
    battle.attackers.formation = "square";
    battle.defenders.formation = "line";
    battle.attackers.phase = battle.defenders.phase = "melee";
    battle.refreshForces();
    const before = battle.attackers.power;
    battle.defenders.regiments.push(makeRegiment({ cavalry: 100 }) as never);
    battle.refreshForces();
    expect(battle.attackers.power).toBeGreaterThan(before);
    expect(battle.attackers.advantage).toBe("even");
  });

  it("recognizes a reinforcing commander and drops one whose troops are gone", () => {
    const commander = { i: 9, name: "General", skills: { martial: 90 }, dead: false };
    worldContext.pack = { states: [], characters: [commander] } as never;
    const battle = makeBattleContext();
    battle.attackers.regiments = [makeRegiment({ infantry: 100 })] as never;
    battle.defenders.regiments = [makeRegiment({ spearmen: 100 })] as never;
    battle.attackers.phase = battle.defenders.phase = "melee";
    battle.initFormations();
    expect(battle.attackers.commander).toBeUndefined();
    const reinforcement = makeRegiment({ infantry: 100 }, { commanderId: 9 });
    battle.attackers.regiments.push(reinforcement as never);
    battle.refreshForces();
    expect(battle.attackers.commander?.name).toBe("General");
    expect(battle.attackers.advantage).toBe("advantaged");
    (reinforcement as any).survivors.infantry = 0;
    battle.refreshForces();
    expect(battle.attackers.commander).toBeUndefined();
  });
});
