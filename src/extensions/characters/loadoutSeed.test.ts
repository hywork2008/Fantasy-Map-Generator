import { describe, expect, it } from "vitest";
import type { Character, CharacterPersonality, CharacterSkills } from "./characterTypes";
import {
  attireQualityFloor,
  backfillCharacterLoadouts,
  buildLoadoutGoodsCatalog,
  clampEquipmentQuality,
  FALLBACK_LOADOUT_GOOD_IDS,
  normalizeCharacterLoadout,
  qualityJitter,
  rollSeededQuality,
  seedCharacterLoadout,
  shouldSeedWeapon
} from "./loadoutSeed";

const BASE_SKILLS: CharacterSkills = {
  artistry: 40,
  diplomacy: 40,
  engineering: 40,
  geography: 40,
  intrigue: 40,
  learning: 40,
  martial: 40,
  prowess: 40,
  stewardship: 40
};

const BASE_PERSONALITY: CharacterPersonality = {
  boldness: 50,
  compassion: 50,
  greed: 50,
  honor: 50,
  rationality: 50,
  sociability: 50,
  vengefulness: 50,
  zeal: 50,
  energy: 50,
  piety: 50,
  guile: 50,
  confidence: 50
};

function makeCharacter(partial: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 35,
    gender: "male",
    culture: 1,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: { ...BASE_SKILLS },
    personality: { ...BASE_PERSONALITY },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 40,
    wealth: 10,
    pastTitles: [],
    ...partial
  };
}

const TEST_CATALOG = {
  garments: 101,
  cloth: 102,
  silk: 103,
  furs: 104,
  arms: 105,
  jewelry: 106
};

describe("buildLoadoutGoodsCatalog", () => {
  it("resolves essentials by name", () => {
    const catalog = buildLoadoutGoodsCatalog([
      { i: 1, name: "Garments" },
      { i: 2, name: "Arms" },
      { i: 3, name: "Cloth" },
      { i: 4, name: "Silk" }
    ]);
    expect(catalog).toEqual({
      garments: 1,
      arms: 2,
      cloth: 3,
      silk: 4,
      furs: 1, // falls back to garments when Furs missing
      linen: undefined,
      jewelry: undefined
    });
  });

  it("returns null when Garments or Arms are missing", () => {
    expect(buildLoadoutGoodsCatalog([{ i: 1, name: "Cloth" }])).toBeNull();
  });
});

describe("attireQualityFloor", () => {
  it("gives every estate at least quality 1", () => {
    expect(attireQualityFloor("freeman", "commoner", [])).toBe(1);
  });

  it("floors nobles at 3", () => {
    expect(attireQualityFloor("court_noble", "minor_noble", [])).toBe(3);
    expect(attireQualityFloor("landed_noble", "gentry", [])).toBe(3);
    expect(attireQualityFloor("reigning_dynasty", "royal", [])).toBe(3);
  });

  it("floors landed sovereign titles at 4", () => {
    expect(
      attireQualityFloor("officer", "commoner", [{ title: "King", landed: true, entityType: "state", entityId: 1 }])
    ).toBe(4);
  });
});

describe("seedCharacterLoadout", () => {
  it("always seeds body attire for a living commoner", () => {
    const character = makeCharacter({
      i: 1,
      name: "Peasant",
      backstory: {
        origin: {
          socialStratum: "commoner",
          estateStatus: "freeman",
          birthStateId: 1,
          raisedIn: "street"
        },
        commitment: { primary: { kind: "family" }, intensity: 40, conflictPolicy: "primary_wins" },
        tastes: []
      }
    });

    const changed = seedCharacterLoadout(character, {
      catalog: TEST_CATALOG,
      roleClass: "ordinary"
    });

    expect(changed).toBe(true);
    expect(character.loadout?.body).toBeDefined();
    expect(character.loadout!.body!.quality).toBeGreaterThanOrEqual(1);
    expect(character.loadout!.body!.source).toBe("seeded");
    expect(character.loadout!.weapon).toBeUndefined();
    // Seeded kit does not mint inventory
    expect(character.inventory).toBeUndefined();
  });

  it("seeds high-quality attire and ceremonial arms for a sovereign", () => {
    const ruler = makeCharacter({
      i: 7,
      name: "King",
      wealth: 200,
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
      backstory: {
        origin: {
          socialStratum: "royal",
          estateStatus: "reigning_dynasty",
          birthStateId: 1,
          raisedIn: "capital_court"
        },
        commitment: { primary: { kind: "state" }, intensity: 70, conflictPolicy: "primary_wins" },
        tastes: []
      }
    });

    seedCharacterLoadout(ruler, { catalog: TEST_CATALOG, roleClass: "ruler" });

    expect(ruler.loadout?.body?.quality).toBeGreaterThanOrEqual(4);
    expect(ruler.loadout?.weapon).toBeDefined();
    expect(ruler.loadout!.weapon!.goodId).toBe(TEST_CATALOG.arms);
    expect(ruler.loadout?.accessory?.goodId).toBe(TEST_CATALOG.jewelry);
  });

  it("seeds a weapon for commanders but not merchants", () => {
    const commander = makeCharacter({
      i: 3,
      name: "Marshal",
      backstory: {
        origin: {
          socialStratum: "gentry",
          estateStatus: "officer",
          birthStateId: 1,
          raisedIn: "military_camp"
        },
        commitment: { primary: { kind: "office" }, intensity: 50, conflictPolicy: "primary_wins" },
        tastes: []
      }
    });
    const merchant = makeCharacter({
      i: 4,
      name: "Merchant",
      backstory: {
        origin: {
          socialStratum: "merchant_born",
          estateStatus: "burgher",
          birthStateId: 1,
          raisedIn: "merchant_quarter"
        },
        commitment: { primary: { kind: "wealth" }, intensity: 50, conflictPolicy: "primary_wins" },
        tastes: []
      }
    });

    seedCharacterLoadout(commander, { catalog: TEST_CATALOG, roleClass: "commander" });
    seedCharacterLoadout(merchant, { catalog: TEST_CATALOG, roleClass: "merchant" });

    expect(commander.loadout?.weapon).toBeDefined();
    expect(commander.loadout!.weapon!.quality).toBeGreaterThanOrEqual(2);
    expect(merchant.loadout?.body).toBeDefined();
    expect(merchant.loadout?.weapon).toBeUndefined();
  });

  it("is idempotent and does not overwrite equipped slots", () => {
    const character = makeCharacter({
      i: 9,
      name: "Hireling",
      backstory: {
        origin: {
          socialStratum: "commoner",
          estateStatus: "freeman",
          birthStateId: 1,
          raisedIn: "frontier_burg"
        },
        commitment: { primary: { kind: "self" }, intensity: 30, conflictPolicy: "primary_wins" },
        tastes: []
      },
      loadout: {
        body: { goodId: 999, quality: 2, source: "equipped", styleKey: "work_clothes" }
      }
    });

    const changed = seedCharacterLoadout(character, {
      catalog: TEST_CATALOG,
      roleClass: "ordinary",
      onlyIfMissing: true
    });

    expect(changed).toBe(false);
    expect(character.loadout?.body?.goodId).toBe(999);
    expect(character.loadout?.body?.source).toBe("equipped");
  });

  it("prefers furs for hunting cultures at mid quality", () => {
    const hunter = makeCharacter({
      i: 11,
      name: "Hunter",
      backstory: {
        origin: {
          socialStratum: "commoner",
          estateStatus: "freeman",
          birthStateId: 1,
          raisedIn: "frontier_burg"
        },
        commitment: { primary: { kind: "craft" }, intensity: 40, conflictPolicy: "primary_wins" },
        tastes: []
      }
    });

    seedCharacterLoadout(hunter, {
      catalog: TEST_CATALOG,
      roleClass: "ordinary",
      cultureType: "Hunting"
    });

    // Mid-band commoners typically Q2 — furs path applies for Q2–4.
    if ((hunter.loadout?.body?.quality ?? 0) >= 2 && (hunter.loadout?.body?.quality ?? 0) <= 4) {
      expect(hunter.loadout?.body?.goodId).toBe(TEST_CATALOG.furs);
    }
  });

  it("skips dead characters", () => {
    const dead = makeCharacter({ i: 2, name: "Dead", dead: true });
    expect(seedCharacterLoadout(dead, { catalog: TEST_CATALOG })).toBe(false);
    expect(dead.loadout).toBeUndefined();
  });
});

describe("backfillCharacterLoadouts", () => {
  it("fills only characters missing body", () => {
    const a = makeCharacter({ i: 1, name: "A" });
    const b = makeCharacter({
      i: 2,
      name: "B",
      loadout: { body: { goodId: 1, quality: 2, source: "seeded" } }
    });
    const count = backfillCharacterLoadouts([a, b], { catalog: TEST_CATALOG });
    expect(count).toBe(1);
    expect(a.loadout?.body).toBeDefined();
    expect(b.loadout?.body?.goodId).toBe(1);
  });
});

describe("normalizeCharacterLoadout", () => {
  it("clamps quality and drops invalid good ids", () => {
    const normalized = normalizeCharacterLoadout({
      body: { goodId: 10, quality: 9, source: "seeded", styleKey: "regalia" },
      weapon: { goodId: -1, quality: 3, source: "seeded" },
      accessory: { goodId: 5, quality: 0, source: "bogus" }
    });
    expect(normalized?.body?.quality).toBe(5);
    expect(normalized?.weapon).toBeUndefined();
    expect(normalized?.accessory?.quality).toBe(1);
    expect(normalized?.accessory?.source).toBe("seeded");
  });
});

describe("quality helpers", () => {
  it("clampEquipmentQuality bounds to 1..5", () => {
    expect(clampEquipmentQuality(0)).toBe(1);
    expect(clampEquipmentQuality(3.4)).toBe(3);
    expect(clampEquipmentQuality(99)).toBe(5);
  });

  it("qualityJitter is deterministic", () => {
    expect(qualityJitter(42, 1)).toBe(qualityJitter(42, 1));
  });

  it("rollSeededQuality respects floor", () => {
    for (let i = 0; i < 20; i++) {
      expect(rollSeededQuality(i, 1, 3, 1)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("shouldSeedWeapon", () => {
  it("detects martial titles and camps", () => {
    expect(shouldSeedWeapon("merchant", "burgher", "merchant_quarter", [])).toBe(false);
    expect(shouldSeedWeapon("commander", "officer", "capital_city", [])).toBe(true);
    expect(shouldSeedWeapon("ordinary", "freeman", "military_camp", [])).toBe(true);
    expect(
      shouldSeedWeapon("ordinary", "freeman", "street", [
        { title: "Marshal", landed: false, entityType: "state", entityId: 1 }
      ])
    ).toBe(true);
  });
});

describe("FALLBACK_LOADOUT_GOOD_IDS", () => {
  it("has positive essential ids", () => {
    expect(FALLBACK_LOADOUT_GOOD_IDS.garments).toBeGreaterThan(0);
    expect(FALLBACK_LOADOUT_GOOD_IDS.arms).toBeGreaterThan(0);
  });
});
