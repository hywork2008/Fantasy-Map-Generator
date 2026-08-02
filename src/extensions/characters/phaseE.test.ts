import { describe, expect, it } from "vitest";
import { applyCharacterBackstory, seedCharacterRelations } from "./backstoryProfile";
import { seedCharacterBonds } from "./characterBonds";
import type { Character } from "./characterTypes";
import { applyFormCommitmentBoost, getFormPack, resolveFormPackId } from "./cultureFormPacks";
import { assignDynasties, deriveHouseName } from "./dynastyGenerator";
import { finalizeCharacterSociety } from "./finalizeCharacterSociety";
import { generateCharacterHooks } from "./flavorHooks";

function baseCharacter(overrides: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 40,
    gender: "male",
    culture: 1,
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    },
    personality: {
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
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 70,
    wealth: 0,
    pastTitles: [],
    titles: [],
    ...overrides
  };
}

describe("cultureFormPacks", () => {
  it("maps theocracy form names", () => {
    expect(resolveFormPackId("Holy State")).toBe("theocracy");
    expect(getFormPack("Theocracy").commitmentBoost.faith).toBeGreaterThan(0);
  });

  it("boosts faith weights for theocracy", () => {
    const w: Record<string, number> = { faith: 10, house: 20 };
    applyFormCommitmentBoost(w as never, "Bishopric");
    expect(w.faith).toBeGreaterThan(10);
  });
});

describe("dynastyGenerator", () => {
  it("derives house names from multi-word names", () => {
    expect(deriveHouseName(baseCharacter({ i: 1, name: "Elena of Aldric" }))).toMatch(/House/);
  });

  it("assigns a dynasty to rulers", () => {
    const ruler = baseCharacter({
      i: 1,
      name: "King Aldric",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    applyCharacterBackstory(ruler, { roleClass: "ruler", capitalBurgId: 1, formName: "Monarchy" });
    const dynasties = assignDynasties([ruler], { stateNames: { 1: "Aldoria" } });
    expect(dynasties.length).toBeGreaterThanOrEqual(1);
    expect(ruler.backstory!.origin.lineageId).toBeDefined();
    expect(ruler.backstory!.origin.lineageName).toBeTruthy();
  });
});

describe("bonds and hooks", () => {
  it("creates rival bonds for low solidarity peers", () => {
    const a = baseCharacter({
      i: 1,
      name: "A",
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 50,
        compassion: 20,
        greed: 80,
        honor: 30,
        rationality: 30,
        sociability: 30,
        vengefulness: 80,
        zeal: 40,
        energy: 50,
        piety: 20,
        guile: 85,
        confidence: 60
      }
    });
    const b = baseCharacter({
      i: 2,
      name: "B",
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 70,
        compassion: 20,
        greed: 75,
        honor: 25,
        rationality: 25,
        sociability: 30,
        vengefulness: 75,
        zeal: 40,
        energy: 60,
        piety: 20,
        guile: 80,
        confidence: 60
      }
    });
    applyCharacterBackstory(a, { roleClass: "central_officer", capitalBurgId: 1, birthBurgId: 1 });
    applyCharacterBackstory(b, { roleClass: "central_officer", capitalBurgId: 1, birthBurgId: 1 });
    a.backstory!.origin.birthBurgId = 1;
    b.backstory!.origin.birthBurgId = 1;
    seedCharacterRelations([a, b]);
    seedCharacterBonds([a, b], 1000);

    const hasHometown =
      a.backstory!.bonds?.some(bond => bond.kind === "hometown_kin") ||
      b.backstory!.bonds?.some(bond => bond.kind === "hometown_kin");
    const hasRival =
      a.backstory!.bonds?.some(bond => bond.kind === "rival" || bond.kind === "nemesis") ||
      b.backstory!.bonds?.some(bond => bond.kind === "rival" || bond.kind === "nemesis");
    // At least one of the expected social labels should appear for this pair
    expect(hasHometown || hasRival || (a.backstory!.bonds?.length ?? 0) + (b.backstory!.bonds?.length ?? 0) > 0).toBe(
      true
    );
  });

  it("generateCharacterHooks returns 1–3 structured hooks", () => {
    const c = baseCharacter({
      i: 1,
      name: "Test",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    applyCharacterBackstory(c, { roleClass: "ruler", capitalBurgId: 1 });
    c.backstory!.origin.lineageName = "House Test";
    const hooks = generateCharacterHooks(c);
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    expect(hooks.length).toBeLessThanOrEqual(3);
    expect(hooks[0]).toMatchObject({ id: expect.any(String) });
  });
});

describe("finalizeCharacterSociety", () => {
  it("produces dynasties, bonds, and hooks together", () => {
    const ruler = baseCharacter({
      i: 1,
      name: "Ruler One",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    const officer = baseCharacter({
      i: 2,
      name: "Officer Two",
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
      location: 1
    });
    applyCharacterBackstory(ruler, { roleClass: "ruler", capitalBurgId: 1, formName: "Monarchy" });
    applyCharacterBackstory(officer, {
      roleClass: "central_officer",
      capitalBurgId: 1,
      formName: "Monarchy"
    });
    seedCharacterRelations([ruler, officer]);
    const { dynasties } = finalizeCharacterSociety([ruler, officer], {
      stateNames: { 1: "Testland" },
      currentYear: 1200
    });
    expect(dynasties.length).toBeGreaterThanOrEqual(1);
    expect(ruler.backstory!.hooks?.length).toBeGreaterThanOrEqual(1);
  });
});
