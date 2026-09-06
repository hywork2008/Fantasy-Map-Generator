import { describe, expect, it } from "vitest";
import type { Character, CharacterPersonality, CharacterSkills } from "./characterTypes";
import { chooseIdleHawkMischief, idleHawkAmbition, idleHawkLoyalty } from "./idleHawkMischief";

const SKILLS: CharacterSkills = {
  artistry: 40,
  diplomacy: 40,
  engineering: 40,
  geography: 40,
  intrigue: 40,
  learning: 40,
  martial: 80,
  prowess: 70,
  stewardship: 40
};

function personality(overrides: Partial<CharacterPersonality> = {}): CharacterPersonality {
  return {
    boldness: 80,
    compassion: 40,
    greed: 90,
    honor: 20,
    rationality: 40,
    sociability: 40,
    vengefulness: 40,
    zeal: 40,
    energy: 80,
    piety: 40,
    guile: 30,
    confidence: 60,
    ...overrides
  };
}

function person(overrides: Partial<Character> = {}): Character {
  return {
    i: 2,
    name: "Marshal",
    age: 40,
    gender: "male",
    culture: 1,
    titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
    affinities: {},
    marriages: [],
    state: 1,
    skills: { ...SKILLS },
    personality: personality(),
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

const king = person({
  i: 1,
  name: "King",
  titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
  personality: personality({ boldness: 20, greed: 30, honor: 70 })
});

describe("chooseIdleHawkMischief", () => {
  it("lets a loyal or unambitious hawk leave rather than plot", () => {
    const loyal = person({
      personality: personality({ honor: 80, greed: 20, energy: 40, guile: 20 }),
      solidarity: { 1: 60 }
    });
    expect(idleHawkLoyalty(loyal, king, 1)).toBeGreaterThanOrEqual(40);
    expect(chooseIdleHawkMischief(loyal, king, 1)).toBe("none");

    const meek = person({ personality: personality({ greed: 20, energy: 20, honor: 15 }) });
    expect(idleHawkAmbition(meek)).toBeLessThan(55);
    expect(chooseIdleHawkMischief(meek, king, 1)).toBe("none");
  });

  it("picks a coup for a disloyal ambitious hawk who is not a schemer", () => {
    const marshal = person({ solidarity: { 1: -50 } });
    expect(chooseIdleHawkMischief(marshal, king, 1)).toBe("coup");
  });

  it("picks war-provocation when intrigue or guile is high", () => {
    const schemer = person({
      solidarity: { 1: -50 },
      personality: personality({ guile: 80 }),
      skills: { ...SKILLS, intrigue: 40 }
    });
    expect(chooseIdleHawkMischief(schemer, king, 1)).toBe("provoke-war");

    const spymind = person({
      solidarity: { 1: -40 },
      personality: personality({ guile: 40 }),
      skills: { ...SKILLS, intrigue: 75 }
    });
    expect(chooseIdleHawkMischief(spymind, king, 1)).toBe("provoke-war");
  });
});
