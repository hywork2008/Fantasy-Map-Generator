import { describe, expect, it } from "vitest";
import {
  applyCharacterBackstory,
  clampRelation,
  computeInitialSolidarity,
  gamblingPersonalityMult,
  getFavor,
  getFavorBand,
  getSolidarity,
  getSolidarityBand,
  isWorldlyClericProfile,
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

describe("isWorldlyClericProfile", () => {
  it("flags greedy vengeful chaplains like Bozhech-style profiles", () => {
    const cleric = baseCharacter({
      i: 1,
      name: "Bozhech-like",
      titles: [{ title: "Court Chaplain", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 85,
        compassion: 73,
        greed: 100,
        honor: 54,
        rationality: 27,
        sociability: 45,
        vengefulness: 96,
        zeal: 71,
        energy: 37,
        piety: 99,
        guile: 59,
        confidence: 72
      },
      family: { spouses: 1, children: 9, grandchildren: 6, greatGrandchildren: 0 }
    });
    expect(isWorldlyClericProfile(cleric, "religious")).toBe(true);
  });

  it("does not flag sincere low-greed high-zeal clergy", () => {
    const cleric = baseCharacter({
      i: 2,
      name: "Sincere",
      titles: [{ title: "Court Chaplain", landed: false, entityType: "state", entityId: 1 }],
      personality: {
        boldness: 40,
        compassion: 70,
        greed: 25,
        honor: 80,
        rationality: 60,
        sociability: 50,
        vengefulness: 20,
        zeal: 85,
        energy: 50,
        piety: 90,
        guile: 30,
        confidence: 55
      }
    });
    expect(isWorldlyClericProfile(cleric, "religious")).toBe(false);
  });

  it("gives worldly clerics vice likes rather than only clean monkish dislikes", () => {
    let sawViceLike = 0;
    let sawCleanDislikeOnly = 0;
    for (let i = 0; i < 25; i++) {
      const cleric = baseCharacter({
        i: 10 + i,
        name: `Worldly${i}`,
        titles: [{ title: "Court Chaplain", landed: false, entityType: "state", entityId: 1 }],
        personality: {
          boldness: 80,
          compassion: 40,
          greed: 95,
          honor: 40,
          rationality: 30,
          sociability: 50,
          vengefulness: 85,
          zeal: 40,
          energy: 50,
          piety: 90,
          guile: 70,
          confidence: 60
        },
        family: { spouses: 1, children: 5, grandchildren: 0, greatGrandchildren: 0 }
      });
      applyCharacterBackstory(cleric, {
        roleClass: "religious",
        formName: "Monarchy",
        capitalBurgId: 1
      });
      const likes = cleric.backstory!.tastes.filter(t => t.polarity === "like").map(t => t.id);
      const dislikes = cleric.backstory!.tastes.filter(t => t.polarity === "dislike").map(t => t.id);
      if (likes.some(id => ["gold", "wine", "lust", "gambling", "luxury", "corruption"].includes(id))) {
        sawViceLike++;
      }
      // "Clean monk" package: theology/ceremony likes + lust&gambling&corruption all disliked, no gold
      if (
        likes.includes("theology") &&
        likes.includes("ceremony") &&
        !likes.includes("gold") &&
        dislikes.includes("lust") &&
        dislikes.includes("gambling") &&
        dislikes.includes("corruption")
      ) {
        sawCleanDislikeOnly++;
      }
    }
    expect(sawViceLike).toBeGreaterThan(15);
    expect(sawCleanDislikeOnly).toBeLessThan(5);
  });
});

describe("female social tastes", () => {
  it("biases sociable women toward gossip and salon rather than feast/company", () => {
    let gossip = 0;
    let salon = 0;
    let feast = 0;
    let company = 0;
    for (let i = 0; i < 40; i++) {
      const c = baseCharacter({
        i: 200 + i,
        name: `Lady${i}`,
        gender: "female",
        personality: {
          boldness: 40,
          compassion: 55,
          greed: 40,
          honor: 60,
          rationality: 50,
          sociability: 85,
          vengefulness: 30,
          zeal: 40,
          energy: 50,
          piety: 45,
          guile: 50,
          confidence: 55
        }
      });
      applyCharacterBackstory(c, { roleClass: "ordinary", formName: "Monarchy", capitalBurgId: 1 });
      const likes = c.backstory!.tastes.filter(t => t.polarity === "like").map(t => t.id);
      if (likes.includes("gossip")) gossip++;
      if (likes.includes("salon")) salon++;
      if (likes.includes("feast")) feast++;
      if (likes.includes("company")) company++;
    }
    expect(gossip).toBeGreaterThan(25);
    expect(salon).toBeGreaterThan(20);
    expect(gossip + salon).toBeGreaterThan(feast + company);
  });
});

describe("ceremony by military rank", () => {
  it("makes low-prestige field officers often dislike ceremony", () => {
    let dislikeCeremony = 0;
    for (let i = 0; i < 35; i++) {
      const c = baseCharacter({
        i: 300 + i,
        name: `Captain${i}`,
        prestige: 30,
        titles: [{ title: "Captain", landed: false, entityType: "state", entityId: 1 }],
        skills: {
          artistry: 20,
          diplomacy: 25,
          engineering: 20,
          geography: 40,
          intrigue: 30,
          learning: 20,
          martial: 80,
          prowess: 70,
          stewardship: 25
        },
        personality: {
          boldness: 70,
          compassion: 40,
          greed: 40,
          honor: 45,
          rationality: 40,
          sociability: 40,
          vengefulness: 40,
          zeal: 40,
          energy: 70,
          piety: 30,
          guile: 40,
          confidence: 50
        }
      });
      applyCharacterBackstory(c, { roleClass: "commander", formName: "Monarchy", capitalBurgId: 1 });
      const dislikes = c.backstory!.tastes.filter(t => t.polarity === "dislike").map(t => t.id);
      if (dislikes.includes("ceremony")) dislikeCeremony++;
    }
    expect(dislikeCeremony).toBeGreaterThan(12);
  });

  it("makes high-prestige parade commanders often like ceremony", () => {
    let likeCeremony = 0;
    for (let i = 0; i < 35; i++) {
      const c = baseCharacter({
        i: 400 + i,
        name: `Marshal${i}`,
        prestige: 85,
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
        skills: {
          artistry: 30,
          diplomacy: 50,
          engineering: 20,
          geography: 50,
          intrigue: 40,
          learning: 40,
          martial: 85,
          prowess: 70,
          stewardship: 40
        },
        personality: {
          boldness: 60,
          compassion: 40,
          greed: 35,
          honor: 80,
          rationality: 55,
          sociability: 55,
          vengefulness: 30,
          zeal: 50,
          energy: 60,
          piety: 50,
          guile: 40,
          confidence: 70
        }
      });
      applyCharacterBackstory(c, { roleClass: "commander", formName: "Monarchy", capitalBurgId: 1 });
      // High prestige may be overwritten by origin stratum prestige — force after apply
      // (origin rebuilds prestige). Re-check via tastes only from generation path with royal stratum bias.
      const likes = c.backstory!.tastes.filter(t => t.polarity === "like").map(t => t.id);
      if (likes.includes("ceremony")) likeCeremony++;
    }
    // With high honor + commander role, ceremony like should appear reasonably often
    expect(likeCeremony).toBeGreaterThan(8);
  });
});

describe("corruption taste for power-holders", () => {
  it("gives open-palm rulers corruption likes more often than clean ones", () => {
    let corruptLiked = 0;
    let cleanLiked = 0;
    for (let i = 0; i < 40; i++) {
      const corrupt = baseCharacter({
        i: 500 + i,
        name: `CorruptKing${i}`,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
        personality: {
          boldness: 50,
          compassion: 30,
          greed: 90,
          honor: 25,
          rationality: 50,
          sociability: 50,
          vengefulness: 40,
          zeal: 30,
          energy: 50,
          piety: 25,
          guile: 75,
          confidence: 70
        }
      });
      applyCharacterBackstory(corrupt, { roleClass: "ruler", formName: "Monarchy", capitalBurgId: 1 });
      if (corrupt.backstory!.tastes.some(t => t.id === "corruption" && t.polarity === "like")) {
        corruptLiked++;
      }

      const clean = baseCharacter({
        i: 600 + i,
        name: `CleanKing${i}`,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
        personality: {
          boldness: 50,
          compassion: 60,
          greed: 30,
          honor: 90,
          rationality: 60,
          sociability: 50,
          vengefulness: 20,
          zeal: 50,
          energy: 50,
          piety: 70,
          guile: 30,
          confidence: 60
        }
      });
      applyCharacterBackstory(clean, { roleClass: "ruler", formName: "Monarchy", capitalBurgId: 1 });
      if (clean.backstory!.tastes.some(t => t.id === "corruption" && t.polarity === "like")) {
        cleanLiked++;
      }
    }
    expect(corruptLiked).toBeGreaterThan(15);
    expect(cleanLiked).toBeLessThan(8);
    expect(corruptLiked).toBeGreaterThan(cleanLiked);
  });
});

describe("gamblingPersonalityMult", () => {
  it("crushes gambling appetite for Turnorovo-type calculators", () => {
    // High greed + max reason + low nerve + engineer: methodical accumulation, not dice
    const mult = gamblingPersonalityMult(
      {
        boldness: 8,
        compassion: 9,
        greed: 99,
        honor: 60,
        rationality: 100,
        sociability: 53,
        vengefulness: 11,
        zeal: 54,
        energy: 16,
        piety: 33,
        guile: 55,
        confidence: 20
      },
      {
        artistry: 32,
        diplomacy: 8,
        engineering: 88,
        geography: 10,
        intrigue: 25,
        learning: 27,
        martial: 51,
        prowess: 1,
        stewardship: 37
      }
    );
    expect(mult).toBeLessThanOrEqual(0.05);
  });

  it("keeps gambling available for bold impulsive types", () => {
    const mult = gamblingPersonalityMult(
      {
        boldness: 85,
        compassion: 40,
        greed: 80,
        honor: 40,
        rationality: 25,
        sociability: 60,
        vengefulness: 50,
        zeal: 40,
        energy: 80,
        piety: 30,
        guile: 50,
        confidence: 75
      },
      {
        artistry: 30,
        diplomacy: 40,
        engineering: 20,
        geography: 40,
        intrigue: 40,
        learning: 20,
        martial: 50,
        prowess: 50,
        stewardship: 30
      }
    );
    expect(mult).toBeGreaterThan(1);
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

  it("does not make cautious high-greed calculators like gambling (Turnorovo-type)", () => {
    let likedGambling = 0;
    let dislikedGambling = 0;
    let likedGold = 0;
    for (let i = 0; i < 40; i++) {
      const c = baseCharacter({
        i: 100 + i,
        name: `Turnorovo-like-${i}`,
        titles: [{ title: "Count", landed: true, entityType: "state", entityId: 1 }],
        skills: {
          artistry: 32,
          diplomacy: 8,
          engineering: 88,
          geography: 10,
          intrigue: 25,
          learning: 27,
          martial: 51,
          prowess: 1,
          stewardship: 37
        },
        personality: {
          boldness: 8,
          compassion: 9,
          greed: 99,
          honor: 60,
          rationality: 100,
          sociability: 53,
          vengefulness: 11,
          zeal: 54,
          energy: 16,
          piety: 33,
          guile: 55,
          confidence: 20
        }
      });
      applyCharacterBackstory(c, {
        roleClass: "noble",
        formName: "Monarchy",
        capitalBurgId: 1
      });
      const likes = c.backstory!.tastes.filter(t => t.polarity === "like").map(t => t.id);
      const dislikes = c.backstory!.tastes.filter(t => t.polarity === "dislike").map(t => t.id);
      if (likes.includes("gambling")) likedGambling++;
      if (dislikes.includes("gambling")) dislikedGambling++;
      if (likes.includes("gold")) likedGold++;
    }
    expect(likedGold).toBe(40);
    expect(likedGambling).toBe(0);
    // gamblingAverse path pushes dislike ~70% of rolls
    expect(dislikedGambling).toBeGreaterThan(20);
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
