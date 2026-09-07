import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARCANE_BATTLE_CASUALTY_CAP,
  ARCANE_CALAMITY_MIN,
  ARCANE_METEOR_MIN,
  ARCANE_WAR_WORKING_MIN,
  arcaneHuntPowerReduced,
  calendarTime,
  lifetimeCalamityBudget,
  warWorkingCasualties,
  warWorkingRecoveryYears
} from "../../data/arcaneWorking";
import { HALF_ELF_SERVITOR_CHANCE } from "../../data/raceBoundServitors";
import { RACE_SUPERNATURAL } from "../../data/raceSupernatural";
import { createDefaultRaces } from "../../data/races";
import { useOptionsState } from "../hostCore";
import {
  arcaneBand,
  HUMAN_INFERNAL_ATAVISM,
  HUMAN_INFERNAL_ATAVISM_CHANCE,
  isFantasySupernaturalEnabled,
  maybeHumanInfernalAtavism,
  mundaneIncomingCasualtyFactor,
  rollCharacterArcane,
  supernaturalAttackForceMultiplier,
  trySpendArcaneWarWorking
} from "./arcane";
import type { Character } from "./characterTypes";

function caster(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Caster",
    age: 120,
    gender: "female",
    culture: 1,
    race: 2,
    state: 1,
    titles: [],
    affinities: {},
    marriages: [],
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    location: 1,
    arcane: 60,
    ...overrides
  };
}

describe("fantasy Arcane catalog", () => {
  it("ranks caps Demon > Elf >= Giant > Dark Elf > Draconic > Amazones > Human >= Dwarf", () => {
    expect(RACE_SUPERNATURAL.demon.arcaneCap).toBe(100);
    expect(RACE_SUPERNATURAL.elf.arcaneCap).toBe(95);
    expect(RACE_SUPERNATURAL.giant.arcaneCap).toBe(90);
    expect(RACE_SUPERNATURAL.dark_elf.arcaneCap).toBe(85);
    expect(RACE_SUPERNATURAL.draconic.arcaneCap).toBe(40);
    expect(RACE_SUPERNATURAL.amazones.arcaneCap).toBe(20);
    expect(RACE_SUPERNATURAL.human.arcaneCap).toBe(10);
    expect(RACE_SUPERNATURAL.dwarf.arcaneCap).toBe(10);
  });

  it("gives Half Elf the higher Human/Elf Arcane cap and the lower median, inclination, and durability", () => {
    const human = RACE_SUPERNATURAL.human;
    const elf = RACE_SUPERNATURAL.elf;
    const half = RACE_SUPERNATURAL.half_elf;
    expect(half.arcaneCap).toBe(Math.max(human.arcaneCap, elf.arcaneCap));
    expect(half.arcaneMedian).toBe(Math.min(human.arcaneMedian, elf.arcaneMedian));
    expect(half.arcaneInclination).toBe(Math.min(human.arcaneInclination, elf.arcaneInclination));
    expect(half.durability).toBe(Math.min(human.durability, elf.durability));
  });

  it("gives dragons the highest mundane durability and elves only a slight edge over humans", () => {
    expect(RACE_SUPERNATURAL.draconic.durability).toBeGreaterThan(RACE_SUPERNATURAL.giant.durability);
    expect(RACE_SUPERNATURAL.giant.durability).toBeGreaterThan(RACE_SUPERNATURAL.demon.durability);
    expect(RACE_SUPERNATURAL.draconic.arcaneInclination).toBeLessThan(0.1);
    expect(mundaneIncomingCasualtyFactor(8)).toBeCloseTo(1 / Math.sqrt(8));
  });
});

describe("rollCharacterArcane", () => {
  it("never exceeds the race cap", () => {
    for (let i = 0; i < 80; i++) {
      expect(rollCharacterArcane({ raceKey: "human", lifespan: 75 })).toBeLessThanOrEqual(10);
      expect(rollCharacterArcane({ raceKey: "amazones", lifespan: 80 })).toBeLessThanOrEqual(20);
      expect(rollCharacterArcane({ raceKey: "draconic", lifespan: 1200 })).toBeLessThanOrEqual(40);
      expect(rollCharacterArcane({ raceKey: "elf", lifespan: 750 })).toBeLessThanOrEqual(95);
    }
  });

  it("keeps typical elves below meteor-swarm", () => {
    const samples = Array.from({ length: 400 }, () => rollCharacterArcane({ raceKey: "elf", lifespan: 750 }));
    const mean = samples.reduce((s, n) => s + n, 0) / samples.length;
    expect(mean).toBeGreaterThan(30);
    expect(mean).toBeLessThan(70);
    expect(samples.filter(s => s >= ARCANE_METEOR_MIN).length / samples.length).toBeLessThan(0.15);
    expect(samples.filter(s => s >= ARCANE_CALAMITY_MIN).length / samples.length).toBeLessThan(0.05);
  });
});

describe("war-working scale", () => {
  it("does not let human-cap folk magic fire as a battlefield working", () => {
    expect(warWorkingCasualties(ARCANE_WAR_WORKING_MIN - 1)).toBe(0);
    expect(arcaneBand(10)).toBe("folk");
    expect(warWorkingCasualties(50)).toBe(50);
    expect(warWorkingCasualties(ARCANE_CALAMITY_MIN)).toBeGreaterThan(ARCANE_BATTLE_CASUALTY_CAP);
  });

  it("maps 90–94 onto Meteor Swarm casualties and 1-mile range recovery of one year", () => {
    expect(arcaneBand(90)).toBe("meteor");
    expect(warWorkingCasualties(90)).toBe(400);
    expect(warWorkingCasualties(94)).toBe(1200);
    expect(warWorkingRecoveryYears(90)).toBe(1);
    expect(warWorkingRecoveryYears(94)).toBe(1);
    expect(warWorkingRecoveryYears(70)).toBeCloseTo(60 / 365);
  });

  it("caps calamity workings at 3–8 per lifetime, not every band", () => {
    expect(lifetimeCalamityBudget(75)).toBe(3);
    expect(lifetimeCalamityBudget(750)).toBe(8);
    expect(warWorkingRecoveryYears(95)).toBe(3);
    expect(warWorkingRecoveryYears(100)).toBe(8);
  });

  it("lets meteor add one army-year to a rarity-5 hunt and forbids calamity from executing the last point", () => {
    const chunk = 7;
    expect(arcaneHuntPowerReduced(90, chunk, 50)).toBe(7);
    expect(arcaneHuntPowerReduced(100, chunk, 50)).toBe(49);
    expect(arcaneHuntPowerReduced(95, chunk, 50)).toBe(21);
  });
});

describe("human infernal atavism", () => {
  it("is rare, Human-only, and picks one of the two whisper flavors", () => {
    expect(HUMAN_INFERNAL_ATAVISM_CHANCE).toBeGreaterThan(0);
    expect(HUMAN_INFERNAL_ATAVISM_CHANCE).toBeLessThanOrEqual(0.01);
    expect(HUMAN_INFERNAL_ATAVISM_CHANCE).toBe(HALF_ELF_SERVITOR_CHANCE);
    expect(maybeHumanInfernalAtavism("elf", true, () => true)).toBeUndefined();
    expect(maybeHumanInfernalAtavism("human", false, () => true)).toBeUndefined();
    expect(maybeHumanInfernalAtavism("human", true, () => false)).toBeUndefined();
    expect(maybeHumanInfernalAtavism("human", true, () => true)).toBe("blueBlood");
    let n = 0;
    expect(maybeHumanInfernalAtavism("human", true, () => ++n === 1)).toBe("pactHouse");
  });

  it("rolls Arcane above the Human ceiling and at or below 90, without changing durability", () => {
    const samples = Array.from({ length: 80 }, () =>
      rollCharacterArcane({ raceKey: "human", lifespan: 75, supernatural: HUMAN_INFERNAL_ATAVISM })
    );
    expect(Math.max(...samples)).toBeLessThanOrEqual(90);
    expect(samples.reduce((s, n) => s + n, 0) / samples.length).toBeGreaterThan(10);
    expect(HUMAN_INFERNAL_ATAVISM.durability).toBe(1);
    expect(HUMAN_INFERNAL_ATAVISM.arcaneCap).toBe(90);
  });
});

describe("isFantasySupernaturalEnabled", () => {
  const previous = useOptionsState.getState().culturesSet;

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previous });
  });

  it("is on only for High and Dark Fantasy", () => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
    expect(isFantasySupernaturalEnabled()).toBe(true);
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    expect(isFantasySupernaturalEnabled()).toBe(true);
    useOptionsState.setState({ culturesSet: "world" });
    expect(isFantasySupernaturalEnabled()).toBe(false);
  });
});

describe("trySpendArcaneWarWorking", () => {
  const previous = useOptionsState.getState().culturesSet;

  beforeEach(() => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
  });

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previous });
  });

  it("spends a ready mid-war working without a lifetime debit", () => {
    const elf = caster({ i: 1, race: 2, arcane: 60 });
    const races = createDefaultRaces();
    const result = trySpendArcaneWarWorking({
      characters: [elf],
      stateId: 1,
      battlefieldCell: 4,
      currentYear: 1000,
      races,
      burgs: [{}, { i: 1, cell: 4 }],
      rand: () => 0,
      kind: "daily"
    });
    expect(result?.casualties).toBe(50);
    expect(elf.arcaneWorkingsSpent).toBeUndefined();
    expect(elf.arcaneReadyYear).toBeGreaterThan(calendarTime(1000));
    expect(elf.arcaneReadyYear).toBeLessThan(1001);
  });

  it("skips meteor and calamity on the daily path", () => {
    const meteor = caster({ arcane: 90 });
    const calamity = caster({ i: 2, arcane: 100 });
    const opts = {
      stateId: 1,
      battlefieldCell: 4,
      currentYear: 1000,
      races: createDefaultRaces(),
      burgs: [{}, { i: 1, cell: 4 }],
      rand: () => 0,
      kind: "daily" as const
    };
    expect(trySpendArcaneWarWorking({ ...opts, characters: [meteor] })).toBeNull();
    expect(trySpendArcaneWarWorking({ ...opts, characters: [calamity] })).toBeNull();
  });

  it("allows one meteor per state per year on the campaign path", () => {
    const a = caster({ i: 1, arcane: 90 });
    const b = caster({ i: 2, arcane: 94 });
    const races = createDefaultRaces();
    const first = trySpendArcaneWarWorking({
      characters: [a, b],
      stateId: 1,
      battlefieldCell: 4,
      currentYear: 1000,
      races,
      burgs: [{}, { i: 1, cell: 4 }],
      rand: () => 0,
      kind: "campaign"
    });
    expect(first?.casualties).toBe(1200);
    const second = trySpendArcaneWarWorking({
      characters: [a, b],
      stateId: 1,
      battlefieldCell: 4,
      currentYear: 1000,
      races,
      burgs: [{}, { i: 1, cell: 4 }],
      rand: () => 0,
      kind: "campaign"
    });
    expect(second).toBeNull();
  });

  it("does not fire on historical culture sets", () => {
    useOptionsState.setState({ culturesSet: "world" });
    const elf = caster({ arcane: 60 });
    expect(
      trySpendArcaneWarWorking({
        characters: [elf],
        stateId: 1,
        battlefieldCell: 4,
        currentYear: 1000,
        burgs: [{}, { i: 1, cell: 4 }],
        rand: () => 0
      })
    ).toBeNull();
  });
});

describe("supernaturalAttackForceMultiplier", () => {
  const previous = useOptionsState.getState().culturesSet;

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previous });
  });

  it("makes dragons much harder to casually attack than humans", () => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
    const races = createDefaultRaces();
    const pack = {
      races,
      cultures: [
        { i: 0, name: "Wild", race: 0 },
        { i: 1, name: "Human", race: 1 },
        { i: 2, name: "Drakes", race: races.find(r => r.key === "draconic")!.i }
      ],
      characters: [] as Character[]
    };
    const human = supernaturalAttackForceMultiplier({ culture: 1, i: 1 }, pack, 1000);
    const dragon = supernaturalAttackForceMultiplier({ culture: 2, i: 2 }, pack, 1000);
    expect(human).toBe(1);
    expect(dragon).toBeGreaterThan(5);
  });
});
