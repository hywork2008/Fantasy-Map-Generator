import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../data/races";
import { useOptionsState, worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import {
  APPEARANCE_MEAN,
  APPEARANCE_STDDEV,
  createPerson,
  generateFamily,
  getEpisodicCurrentlyPairedChance,
  getUnmarriedChance,
  resolvePersonGender,
  resolveRaceIdForCulture,
  rollPeakAppearance
} from "./personFactory";
import { FEUDAL_MALE_SHARE, LONG_LIVED_MALE_SHARE, maleShareForLifespan, raceUsesEpisodicPairing } from "./raceAge";

describe("getUnmarriedChance", () => {
  it("uses a 20% permanent-unmarried baseline for established ordinary adults", () => {
    expect(getUnmarriedChance(40, "ordinary", false)).toBe(0.2);
  });

  it("keeps dynastic rulers far more likely to be married", () => {
    expect(getUnmarriedChance(40, "dynastic", false)).toBe(0.03);
  });

  it("models late marriage before the late twenties", () => {
    expect(getUnmarriedChance(22, "ordinary", false)).toBe(0.45);
  });

  it("retains the clerical celibacy rate for religious roles", () => {
    expect(getUnmarriedChance(40, "dynastic", true)).toBe(0.2);
  });
});

describe("rollPeakAppearance", () => {
  it("returns integers in 1–100", () => {
    for (let i = 0; i < 50; i++) {
      const a = rollPeakAppearance();
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a)).toBe(true);
    }
  });

  it("clusters near the mean rather than a uniform spread", () => {
    const n = 800;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) samples.push(rollPeakAppearance());

    const mean = samples.reduce((s, v) => s + v, 0) / n;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    // Mean should sit near μ=50 (allow sampling noise)
    expect(mean).toBeGreaterThan(APPEARANCE_MEAN - 4);
    expect(mean).toBeLessThan(APPEARANCE_MEAN + 4);

    // σ≈15; uniform(1,100) has σ≈28.6 — reject if still near-uniform
    expect(std).toBeGreaterThan(APPEARANCE_STDDEV - 5);
    expect(std).toBeLessThan(APPEARANCE_STDDEV + 5);
    expect(std).toBeLessThan(22);

    // Central band denser than either tail (bell shape)
    const mid = samples.filter(v => v >= 35 && v <= 65).length;
    const lowTail = samples.filter(v => v <= 20).length;
    const highTail = samples.filter(v => v >= 80).length;
    expect(mid).toBeGreaterThan(lowTail + highTail);
    // Extremes should be uncommon (uniform would put ~20% in each ≤20 / ≥80)
    expect(lowTail / n).toBeLessThan(0.08);
    expect(highTail / n).toBeLessThan(0.08);
  });
});

describe("resolvePersonGender", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      races: [
        { i: 0, key: "unknown", name: "Unknown" },
        { i: 1, key: "human", name: "Human" },
        { i: 2, key: "amazones", name: "Amazones", characterGender: "female_only" },
        { i: 3, key: "balanced", name: "Balanced Folk", characterGender: "balanced" },
        { i: 4, key: "patriarchal", name: "Patriarchal", characterGender: "male_dominant" }
      ],
      cultures: [
        { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Amazones", base: 7, shield: "boeotian", race: 2 },
        { i: 2, name: "Balanced Culture", base: 1, shield: "heater", race: 3 },
        { i: 3, name: "Patriarchy Culture", base: 1, shield: "heater", race: 4 }
      ]
    } as unknown as PackedGraph;
  });

  it("honors an explicit genderOverride over race policy", () => {
    expect(resolvePersonGender(1, "male")).toBe("male");
    expect(resolvePersonGender(1, "female")).toBe("female");
  });

  it("forces female for Amazones race (female_only) regardless of culture name", () => {
    for (let i = 0; i < 30; i++) {
      expect(resolvePersonGender(1)).toBe("female");
    }
  });

  it("uses feudal male bias when race has no characterGender", () => {
    const samples = Array.from({ length: 200 }, () => resolvePersonGender(0));
    const maleShare = samples.filter(g => g === "male").length / samples.length;
    // ~90% male; allow sampling noise
    expect(maleShare).toBeGreaterThan(0.75);
  });

  it("uses feudal male bias for explicit male_dominant race", () => {
    const samples = Array.from({ length: 200 }, () => resolvePersonGender(3));
    const maleShare = samples.filter(g => g === "male").length / samples.length;
    expect(maleShare).toBeGreaterThan(0.75);
  });

  it("uses near-parity with slight female lean for long-lived races without characterGender", () => {
    worldContext.pack = {
      races: createDefaultRaces(),
      cultures: [{ i: 0, name: "Elvenhold", base: 1, shield: "round", race: 2 }]
    } as unknown as PackedGraph;
    const elf = createDefaultRaces().find(r => r.key === "elf")!;
    expect(elf.characterGender).toBeUndefined();
    expect(maleShareForLifespan(elf.lifespan!)).toBe(LONG_LIVED_MALE_SHARE);

    const samples = Array.from({ length: 400 }, () => resolvePersonGender(0, undefined, elf.i));
    const maleShare = samples.filter(g => g === "male").length / samples.length;
    // ~0.45 male; allow sampling noise but reject feudal ~0.9
    expect(maleShare).toBeGreaterThan(0.32);
    expect(maleShare).toBeLessThan(0.58);
  });
});

describe("maleShareForLifespan", () => {
  it("keeps feudal bias at human lifespan and female lean at elf scale", () => {
    expect(maleShareForLifespan(75)).toBe(FEUDAL_MALE_SHARE);
    expect(maleShareForLifespan(50)).toBe(FEUDAL_MALE_SHARE);
    expect(maleShareForLifespan(500)).toBe(LONG_LIVED_MALE_SHARE);
    expect(maleShareForLifespan(750)).toBe(LONG_LIVED_MALE_SHARE);
    const dwarf = maleShareForLifespan(350);
    expect(dwarf).toBeGreaterThan(LONG_LIVED_MALE_SHARE);
    expect(dwarf).toBeLessThan(FEUDAL_MALE_SHARE);
  });
});

describe("generateFamily episodic pairing (long-lived)", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      races: createDefaultRaces(),
      cultures: []
    } as unknown as PackedGraph;
  });

  it("flags elves as episodic and humans as continuous marriage", () => {
    const races = createDefaultRaces();
    const elf = races.find(r => r.key === "elf")!;
    const human = races.find(r => r.key === "human")!;
    expect(raceUsesEpisodicPairing(elf.i)).toBe(true);
    expect(raceUsesEpisodicPairing(human.i)).toBe(false);
  });

  it("allows elf parents to be currently unpaired (children ≠ lifelong marriage)", () => {
    const races = createDefaultRaces();
    const elfId = races.find(r => r.key === "elf")!.i;
    const n = 400;
    let withKids = 0;
    let kidsUnpaired = 0;
    let currentlyPaired = 0;

    for (let i = 0; i < n; i++) {
      // Mid-to-late fertile / early post-fertile adult elf court age
      const f = generateFamily(320, "female", undefined, "ordinary", false, elfId);
      if (f.spouses > 0) currentlyPaired++;
      if (f.children > 0) {
        withKids++;
        if (f.spouses === 0) kidsUnpaired++;
      }
    }

    expect(withKids).toBeGreaterThan(80);
    // Majority of parents should not be frozen in lifelong marriage at snapshot time
    expect(kidsUnpaired / withKids).toBeGreaterThan(0.4);
    // Most adults unpaired most of the time
    expect(currentlyPaired / n).toBeLessThan(0.45);
  });

  it("keeps human continuous model: unmarried snapshot has no household children", () => {
    const races = createDefaultRaces();
    const humanId = races.find(r => r.key === "human")!.i;
    // Force high unmarried chance path by sampling young adults heavily
    let unmarriedWithKids = 0;
    let unmarried = 0;
    for (let i = 0; i < 300; i++) {
      const f = generateFamily(22, "female", undefined, "ordinary", false, humanId);
      if (f.spouses === 0) {
        unmarried++;
        if (f.children > 0) unmarriedWithKids++;
      }
    }
    expect(unmarried).toBeGreaterThan(100);
    expect(unmarriedWithKids).toBe(0);
  });

  it("raises currently-paired chance while co-parenting is plausible", () => {
    const races = createDefaultRaces();
    const elf = races.find(r => r.key === "elf")!;
    const fert = elf.fertility!;
    const alone = getEpisodicCurrentlyPairedChance(500, "ordinary", false, undefined, 0, fert);
    const raising = getEpisodicCurrentlyPairedChance(200, "ordinary", false, undefined, 2, fert);
    const dynastic = getEpisodicCurrentlyPairedChance(200, "dynastic", false, undefined, 0, fert);
    expect(raising).toBeGreaterThan(alone);
    expect(dynastic).toBeGreaterThan(alone);
  });
});

describe("resolveRaceIdForCulture Wildlands", () => {
  afterEach(() => clearCharactersContext());

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    const races = createDefaultRaces();
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", base: 1, shield: "round", race: 0 },
        { i: 1, name: "Anor", base: 1, shield: "heater", race: 1 }
      ]
    } as unknown as PackedGraph;
  });

  it("maps Wildlands (race 0) to Human, not Unknown", () => {
    expect(resolveRaceIdForCulture(0)).toBe(1);
    expect(resolveRaceIdForCulture(1)).toBe(1);
  });
});

describe("createPerson bound servitors (wyrmkin under draconic)", () => {
  afterEach(() => clearCharactersContext());

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    const races = createDefaultRaces();
    const draconic = races.find(r => r.key === "draconic")!.i;
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Drake", base: 39, shield: "fantasy2", race: draconic }
      ],
      nameBases: []
    } as unknown as PackedGraph;
  });

  it("makes market merchants wyrmkin, not draconic", () => {
    const races = createDefaultRaces();
    const wyrmkin = races.find(r => r.key === "wyrmkin")!.i;
    const draconic = races.find(r => r.key === "draconic")!.i;
    const merchant = createPerson(0, 1, {
      roleClass: "merchant",
      primarySkill: "stewardship",
      homeStateId: 1
    });
    expect(merchant.race).toBe(wyrmkin);
    expect(merchant.race).not.toBe(draconic);
  });

  it("keeps rulers draconic under the same culture", () => {
    const races = createDefaultRaces();
    const draconic = races.find(r => r.key === "draconic")!.i;
    const ruler = createPerson(0, 1, {
      roleClass: "ruler",
      homeStateId: 1,
      marriageExpectation: "dynastic"
    });
    expect(ruler.race).toBe(draconic);
  });
});

describe("createPerson bound servitors (fallen_angel and human under demon)", () => {
  let prevSet: string;

  afterEach(() => {
    clearCharactersContext();
    useOptionsState.setState({ culturesSet: prevSet });
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    prevSet = useOptionsState.getState().culturesSet;
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    const races = createDefaultRaces();
    const demon = races.find(r => r.key === "demon")!.i;
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Nethrakan", base: 41, shield: "fantasy3", race: demon }
      ],
      nameBases: []
    } as unknown as PackedGraph;
  });

  it("produces majority fallen_angel commanders and occasional demon commanders", () => {
    const races = createDefaultRaces();
    const fallenAngel = races.find(r => r.key === "fallen_angel")!.i;
    const demon = races.find(r => r.key === "demon")!.i;

    const commanders = Array.from({ length: 100 }, () =>
      createPerson(0, 1, {
        roleClass: "commander",
        homeStateId: 1,
        allowOpenDemon: true
      })
    );

    const fallenCount = commanders.filter(c => c.race === fallenAngel).length;
    const demonCount = commanders.filter(c => c.race === demon).length;

    expect(fallenCount + demonCount).toBe(100);
    // Majority (~85%) are fallen angel
    expect(fallenCount).toBeGreaterThan(65);
    // Occasional/rare (~15%) are demon
    expect(demonCount).toBeGreaterThan(3);
  });

  it("produces human majority, rare fallen_angel, and extremely rare demon for merchants", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!.i;
    const fallenAngel = races.find(r => r.key === "fallen_angel")!.i;
    const demon = races.find(r => r.key === "demon")!.i;

    const merchants = Array.from({ length: 200 }, () =>
      createPerson(0, 1, {
        roleClass: "merchant",
        homeStateId: 1,
        allowOpenDemon: true
      })
    );

    const humanCount = merchants.filter(c => c.race === human).length;
    const fallenCount = merchants.filter(c => c.race === fallenAngel).length;
    const demonCount = merchants.filter(c => c.race === demon).length;

    expect(humanCount + fallenCount + demonCount).toBe(200);
    // Vast majority are human (~82%)
    expect(humanCount).toBeGreaterThan(130);
    // Occasional/rare are fallen angel (~15%)
    expect(fallenCount).toBeGreaterThan(10);
    // Extremely rare are demon (~3%)
    expect(demonCount).toBeLessThan(25);
  });

  it("keeps rulers demon under the demon culture", () => {
    const races = createDefaultRaces();
    const demon = races.find(r => r.key === "demon")!.i;
    const ruler = createPerson(0, 1, {
      roleClass: "ruler",
      homeStateId: 1,
      allowOpenDemon: true,
      marriageExpectation: "dynastic"
    });
    expect(ruler.race).toBe(demon);
  });

  it("applies bound servitor logic even when caller provides raceOverride as demon", () => {
    const races = createDefaultRaces();
    const demon = races.find(r => r.key === "demon")!.i;
    const fallenAngel = races.find(r => r.key === "fallen_angel")!.i;
    const human = races.find(r => r.key === "human")!.i;

    const commandersWithOverride = Array.from({ length: 50 }, () =>
      createPerson(0, 1, {
        roleClass: "commander",
        homeStateId: 1,
        raceOverride: demon,
        allowOpenDemon: true
      })
    );
    const commanderFallen = commandersWithOverride.filter(c => c.race === fallenAngel).length;
    expect(commanderFallen).toBeGreaterThan(30);

    const merchantsWithOverride = Array.from({ length: 50 }, () =>
      createPerson(0, 1, {
        roleClass: "merchant",
        homeStateId: 1,
        raceOverride: demon,
        allowOpenDemon: true
      })
    );
    const merchantHuman = merchantsWithOverride.filter(c => c.race === human).length;
    expect(merchantHuman).toBeGreaterThan(30);
  });
});

describe("createPerson fantasy race appearance", () => {
  afterEach(() => clearCharactersContext());

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    const races = createDefaultRaces();
    const demon = races.find(race => race.key === "demon")!;
    const beastfolk = races.find(race => race.key === "beastfolk")!;
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Infernal Court", base: 1, shield: "heater", race: demon.i },
        { i: 2, name: "Wildfolk", base: 1, shield: "heater", race: beastfolk.i }
      ],
      nameBases: []
    } as unknown as PackedGraph;
  });

  it("persists a selected horn animal or animal ancestry on automatically created characters", () => {
    const demon = createPerson(0, 1, { homeStateId: 1 });
    const beastfolk = createPerson(1, 2, { homeStateId: 1 });

    expect(demon.raceAppearance?.kind).toBe("demon");
    expect(beastfolk.raceAppearance?.kind).toBe("beastfolk");
    if (demon.raceAppearance?.kind === "demon") {
      expect(["antelope", "bison", "buffalo", "gazelle", "goat", "ibex", "oryx", "ram", "yak"]).toContain(
        demon.raceAppearance.hornAnimal
      );
    }
    if (beastfolk.raceAppearance?.kind === "beastfolk") {
      expect(beastfolk.raceAppearance.furryScale).toBeGreaterThanOrEqual(1);
      expect(beastfolk.raceAppearance.furryScale).toBeLessThanOrEqual(10);
    }
  });

  it("does not generate an exposed Demon on High Fantasy maps", () => {
    const previousSet = useOptionsState.getState().culturesSet;
    useOptionsState.setState({ culturesSet: "highFantasy" });

    try {
      const person = createPerson(0, 1, { homeStateId: 1 });
      const human = createDefaultRaces().find(race => race.key === "human")!;
      expect(person.race).toBe(human.i);
      expect(person.raceAppearance).toBeUndefined();
      expect(person.demonInfiltration).toBeUndefined();
    } finally {
      useOptionsState.setState({ culturesSet: previousSet });
    }
  });

  it("endows overt Demons with supreme prowess, martial, arcane, and abyssal dominion", () => {
    const races = createDefaultRaces();
    const demon = races.find(race => race.key === "demon")!;
    const overtDemon = createPerson(0, 1, {
      homeStateId: 1,
      raceOverride: demon.i,
      roleClass: "ruler",
      allowOpenDemon: true
    });

    expect(overtDemon.race).toBe(demon.i);
    expect(overtDemon.demonDominion).toBeDefined();
    expect(overtDemon.skills.prowess).toBeGreaterThanOrEqual(88);
    expect(overtDemon.skills.martial).toBeGreaterThanOrEqual(85);
    expect(overtDemon.skills.learning).toBeGreaterThanOrEqual(78);
    expect(overtDemon.arcane).toBeGreaterThanOrEqual(90);
    expect(overtDemon.demonInfiltration).toBeUndefined();
  });
});

describe("createPerson Arcane on fantasy maps", () => {
  const previous = useOptionsState.getState().culturesSet;

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previous });
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    const races = createDefaultRaces();
    const elf = races.find(r => r.key === "elf")!;
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Elvenhold", base: 1, shield: "heater", race: elf.i }
      ],
      nameBases: []
    } as unknown as PackedGraph;
  });

  it("omits Arcane on historical culture sets", () => {
    useOptionsState.setState({ culturesSet: "world" });
    const person = createPerson(0, 1, { homeStateId: 1 });
    expect(person.arcane).toBeUndefined();
  });

  it("rolls Arcane at or below the elf cap on High Fantasy", () => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
    const person = createPerson(0, 1, { homeStateId: 1, raceOverride: 2 });
    expect(person.arcane).toBeDefined();
    expect(person.arcane).toBeGreaterThanOrEqual(0);
    expect(person.arcane).toBeLessThanOrEqual(95);
  });
});
