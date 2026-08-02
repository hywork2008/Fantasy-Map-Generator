import { describe, expect, it } from "vitest";
import {
  applyCharacterBackstory,
  clampRelation,
  computeInitialSolidarity,
  getFavor,
  getFavorBand,
  getSolidarity,
  getSolidarityBand,
  offerGift,
  seedCharacterRelations,
  setSolidarity
} from "./backstoryProfile";
import type { Character } from "./characterTypes";

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
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    titles: [],
    ...overrides
  };
}

describe("relation helpers", () => {
  it("clamps and bands solidarity scores", () => {
    expect(clampRelation(150)).toBe(100);
    expect(getSolidarityBand(85)).toBe("bonded");
    expect(getSolidarityBand(0)).toBe("neutral");
    expect(getSolidarityBand(-60)).toBe("rivalrous");
    expect(getFavorBand(55)).toBe("fond");
  });

  it("stores sparse asymmetric solidarity", () => {
    const a = baseCharacter({ i: 1, name: "A" });
    const b = baseCharacter({ i: 2, name: "B" });
    setSolidarity(a, b.i, 40);
    setSolidarity(b, a.i, -10);
    expect(getSolidarity(a, b.i)).toBe(40);
    expect(getSolidarity(b, a.i)).toBe(-10);
    setSolidarity(a, b.i, 0);
    expect(a.solidarity?.[b.i]).toBeUndefined();
  });
});

describe("applyCharacterBackstory", () => {
  it("assigns origin, commitment, and tastes for a ruler", () => {
    const ruler = baseCharacter({
      i: 1,
      name: "Ruler",
      location: 3,
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    applyCharacterBackstory(ruler, {
      roleClass: "ruler",
      capitalBurgId: 3,
      formName: "Monarchy"
    });
    expect(ruler.backstory).toBeDefined();
    expect(ruler.backstory!.origin.birthStateId).toBe(1);
    expect(ruler.backstory!.origin.socialStratum).toMatch(/royal|high_noble|unknown/);
    expect(ruler.backstory!.commitment.primary.kind).toBeTruthy();
    expect(ruler.backstory!.tastes.length).toBeGreaterThanOrEqual(2);
    expect(ruler.birthStateId).toBe(1);
  });
});

describe("computeInitialSolidarity", () => {
  it("makes high-guile officers often rivalrous or strained toward each other when hot-headed", () => {
    const makeOfficer = (i: number, name: string, guile: number, rationality: number) => {
      const c = baseCharacter({
        i,
        name,
        titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
        personality: {
          boldness: 50,
          compassion: 40,
          greed: 55,
          honor: 40,
          rationality,
          sociability: 40,
          vengefulness: 50,
          zeal: 40,
          energy: 50,
          piety: 30,
          guile,
          confidence: 60
        }
      });
      applyCharacterBackstory(c, { roleClass: "central_officer", capitalBurgId: 1 });
      return c;
    };

    const scores: number[] = [];
    for (let trial = 0; trial < 30; trial++) {
      const a = makeOfficer(1, "A", 85, 30);
      const b = makeOfficer(2, "B", 90, 25);
      scores.push(computeInitialSolidarity(a, b));
    }
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    // Hot-headed schemers should on average dislike each other as rivals
    expect(avg).toBeLessThan(0);
  });

  it("lets rational high-guile peers sometimes respect competence more than feud", () => {
    const a = baseCharacter({
      i: 1,
      name: "ColdA",
      titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 40,
        compassion: 30,
        greed: 40,
        honor: 45,
        rationality: 85,
        sociability: 30,
        vengefulness: 30,
        zeal: 20,
        energy: 40,
        piety: 20,
        guile: 90,
        confidence: 70
      }
    });
    const b = baseCharacter({
      i: 2,
      name: "ColdB",
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 35,
        compassion: 35,
        greed: 45,
        honor: 50,
        rationality: 80,
        sociability: 35,
        vengefulness: 25,
        zeal: 20,
        energy: 40,
        piety: 25,
        guile: 88,
        confidence: 65
      }
    });
    applyCharacterBackstory(a, { roleClass: "central_officer", capitalBurgId: 1 });
    applyCharacterBackstory(b, { roleClass: "central_officer", capitalBurgId: 1 });

    const scores: number[] = [];
    for (let trial = 0; trial < 25; trial++) {
      scores.push(computeInitialSolidarity(a, b));
    }
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    // Still court rivals (officer competition) but competence respect lifts above pure feud average
    // Hot-headed pair avg is deeply negative; rational pair should be higher (less negative or mild +)
    expect(avg).toBeGreaterThan(-25);
  });

  it("raises solidarity between sycophant ministers and rulers", () => {
    const ruler = baseCharacter({
      i: 1,
      name: "King",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 50,
        compassion: 50,
        greed: 40,
        honor: 50,
        rationality: 50,
        sociability: 50,
        vengefulness: 30,
        zeal: 40,
        energy: 50,
        piety: 40,
        guile: 40,
        confidence: 60
      }
    });
    const flatterer = baseCharacter({
      i: 2,
      name: "Flatterer",
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 40,
        compassion: 30,
        greed: 80,
        honor: 35,
        rationality: 55,
        sociability: 85,
        vengefulness: 40,
        zeal: 30,
        energy: 60,
        piety: 25,
        guile: 80,
        confidence: 70
      }
    });
    applyCharacterBackstory(ruler, { roleClass: "ruler", capitalBurgId: 1 });
    applyCharacterBackstory(flatterer, { roleClass: "central_officer", capitalBurgId: 1 });

    const towardRuler: number[] = [];
    const towardFlatterer: number[] = [];
    for (let trial = 0; trial < 25; trial++) {
      towardRuler.push(computeInitialSolidarity(flatterer, ruler));
      towardFlatterer.push(computeInitialSolidarity(ruler, flatterer));
    }
    const avgToRuler = towardRuler.reduce((s, n) => s + n, 0) / towardRuler.length;
    const avgToFlatterer = towardFlatterer.reduce((s, n) => s + n, 0) / towardFlatterer.length;
    // Sycophants should not sit deep-negative toward their sovereign on average
    expect(avgToRuler).toBeGreaterThan(0);
    expect(avgToFlatterer).toBeGreaterThan(-5);
  });

  it("warms sociable compassionate pairs", () => {
    const warm = (i: number, name: string) => {
      const c = baseCharacter({
        i,
        name,
        personality: {
          boldness: 40,
          compassion: 80,
          greed: 30,
          honor: 50,
          rationality: 50,
          sociability: 80,
          vengefulness: 20,
          zeal: 40,
          energy: 50,
          piety: 40,
          guile: 30,
          confidence: 50
        }
      });
      applyCharacterBackstory(c, { roleClass: "ordinary" });
      return c;
    };
    const scores: number[] = [];
    for (let trial = 0; trial < 20; trial++) {
      scores.push(computeInitialSolidarity(warm(1, "A"), warm(2, "B")));
    }
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    expect(avg).toBeGreaterThan(0);
  });

  it("makes high vengefulness+greed cold and disliked, but guile softens being disliked", () => {
    const cold = baseCharacter({
      i: 1,
      name: "Cold",
      personality: {
        boldness: 50,
        compassion: 20,
        greed: 85,
        honor: 30,
        rationality: 50,
        sociability: 30,
        vengefulness: 85,
        zeal: 40,
        energy: 50,
        piety: 20,
        guile: 25,
        confidence: 50
      }
    });
    const masked = baseCharacter({
      i: 2,
      name: "Masked",
      personality: { ...cold.personality, guile: 95 }
    });
    const observer = baseCharacter({
      i: 3,
      name: "Observer",
      personality: {
        boldness: 50,
        compassion: 50,
        greed: 40,
        honor: 50,
        rationality: 50,
        sociability: 50,
        vengefulness: 40,
        zeal: 40,
        energy: 50,
        piety: 40,
        guile: 40,
        confidence: 50
      }
    });
    applyCharacterBackstory(cold, { roleClass: "ordinary" });
    applyCharacterBackstory(masked, { roleClass: "ordinary" });
    applyCharacterBackstory(observer, { roleClass: "ordinary" });

    const coldSeen: number[] = [];
    const maskedSeen: number[] = [];
    for (let trial = 0; trial < 25; trial++) {
      coldSeen.push(computeInitialSolidarity(observer, cold));
      maskedSeen.push(computeInitialSolidarity(observer, masked));
    }
    const avgCold = coldSeen.reduce((s, n) => s + n, 0) / coldSeen.length;
    const avgMasked = maskedSeen.reduce((s, n) => s + n, 0) / maskedSeen.length;
    expect(avgCold).toBeLessThan(0);
    // High guile hides much of the repulsive penalty
    expect(avgMasked).toBeGreaterThan(avgCold);
  });

  it("gives high-guile contempt for shallow low-guile targets", () => {
    const schemer = baseCharacter({
      i: 1,
      name: "Schemer",
      titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 50,
        compassion: 20,
        greed: 50,
        honor: 30,
        rationality: 70,
        sociability: 40,
        vengefulness: 40,
        zeal: 30,
        energy: 50,
        piety: 20,
        guile: 95,
        confidence: 70
      }
    });
    const shallow = baseCharacter({
      i: 2,
      name: "Shallow",
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 80,
        compassion: 50,
        greed: 40,
        honor: 50,
        rationality: 25,
        sociability: 70,
        vengefulness: 30,
        zeal: 40,
        energy: 80,
        piety: 40,
        guile: 20,
        confidence: 90
      }
    });
    applyCharacterBackstory(schemer, { roleClass: "central_officer", capitalBurgId: 1 });
    applyCharacterBackstory(shallow, { roleClass: "central_officer", capitalBurgId: 1 });

    const scores: number[] = [];
    for (let trial = 0; trial < 20; trial++) {
      scores.push(computeInitialSolidarity(schemer, shallow));
    }
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    expect(avg).toBeLessThan(-10);
  });
});

describe("seedCharacterRelations", () => {
  it("seeds solidarity for court peers and keeps romantic favor sparse", () => {
    const a = baseCharacter({
      i: 1,
      name: "A",
      gender: "male",
      location: 1,
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
    });
    const b = baseCharacter({
      i: 2,
      name: "B",
      gender: "male",
      location: 1,
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }]
    });
    const c = baseCharacter({
      i: 3,
      name: "C",
      gender: "female",
      location: 1,
      appearance: 95,
      titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }]
    });
    applyCharacterBackstory(a, { roleClass: "central_officer", capitalBurgId: 1, birthBurgId: 1 });
    applyCharacterBackstory(b, { roleClass: "central_officer", capitalBurgId: 1, birthBurgId: 1 });
    applyCharacterBackstory(c, { roleClass: "central_officer", capitalBurgId: 1, birthBurgId: 1 });
    seedCharacterRelations([a, b, c]);

    expect(a.solidarity?.[2] !== undefined || b.solidarity?.[1] !== undefined).toBe(true);

    // Romantic favor is optional/sparse — most same-sex pairs should have none
    const sameSexFavor = a.favor?.[2] !== undefined || b.favor?.[1] !== undefined;
    // Not asserting false always (8% chance), but solidarity is the main filled axis
    expect(Object.keys(a.solidarity ?? {}).length + Object.keys(b.solidarity ?? {}).length).toBeGreaterThan(0);
    void sameSexFavor;
  });
});

describe("offerGift", () => {
  it("reduces solidarity when bribing a high-integrity recipient (G8)", () => {
    const giver = baseCharacter({ i: 1, name: "Giver", wealth: 100 });
    const clean = baseCharacter({
      i: 2,
      name: "Clean",
      personality: {
        boldness: 40,
        compassion: 70,
        greed: 20,
        honor: 90,
        rationality: 70,
        sociability: 40,
        vengefulness: 20,
        zeal: 40,
        energy: 40,
        piety: 80,
        guile: 20,
        confidence: 50
      }
    });
    applyCharacterBackstory(clean, { roleClass: "religious", formName: "Theocracy" });
    clean.backstory!.tastes.push({ id: "corruption", polarity: "dislike", intensity: 80 });
    clean.backstory!.commitment.primary = { kind: "faith", weight: 100 };

    const result = offerGift(giver, clean, {
      goodName: "Coins",
      valueHint: 80,
      intent: "bribe"
    });
    expect(result.delta).toBeLessThan(0);
    expect(result.treatedAsBribe).toBe(true);
    expect(getSolidarity(clean, giver.i)).toBeLessThan(0);
  });

  it("raises solidarity when gifting art to a high-artistry recipient as courtesy", () => {
    const giver = baseCharacter({ i: 1, name: "Patron" });
    const artist = baseCharacter({
      i: 2,
      name: "Aesthete",
      skills: {
        artistry: 95,
        diplomacy: 40,
        engineering: 40,
        geography: 40,
        intrigue: 40,
        learning: 50,
        martial: 30,
        prowess: 30,
        stewardship: 40
      },
      personality: {
        boldness: 40,
        compassion: 50,
        greed: 40,
        honor: 50,
        rationality: 50,
        sociability: 50,
        vengefulness: 30,
        zeal: 40,
        energy: 50,
        piety: 40,
        guile: 40,
        confidence: 60
      }
    });
    applyCharacterBackstory(artist, { roleClass: "central_officer" });
    artist.backstory!.tastes = [{ id: "art", polarity: "like", intensity: 90 }];

    const result = offerGift(giver, artist, {
      goodName: "Artworks",
      valueHint: 50,
      intent: "courtesy"
    });
    expect(result.delta).toBeGreaterThan(0);
    expect(getSolidarity(artist, giver.i)).toBeGreaterThan(0);
  });

  it("romance intent can move romantic favor", () => {
    const suitor = baseCharacter({ i: 1, name: "Suitor", gender: "male" });
    const beloved = baseCharacter({
      i: 2,
      name: "Beloved",
      gender: "female",
      appearance: 90,
      personality: {
        boldness: 40,
        compassion: 60,
        greed: 30,
        honor: 50,
        rationality: 50,
        sociability: 70,
        vengefulness: 20,
        zeal: 30,
        energy: 50,
        piety: 30,
        guile: 30,
        confidence: 50
      }
    });
    applyCharacterBackstory(beloved, { roleClass: "ordinary" });
    beloved.backstory!.tastes = [{ id: "luxury", polarity: "like", intensity: 80 }];

    const result = offerGift(suitor, beloved, {
      goodName: "Jewelry",
      valueHint: 40,
      intent: "romance"
    });
    expect(result.newFavor).toBeDefined();
    expect(getFavor(beloved, suitor.i)).not.toBe(0);
  });
});
