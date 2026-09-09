import { describe, expect, it } from "vitest";
import { getSolidarity } from "./backstoryProfile";
import { seedCharacterBonds } from "./characterBonds";
import type { Character, CharacterBackstory, CommitmentKind } from "./characterTypes";
import {
  beguileScore,
  characterPublicEpithetId,
  chooseRulerEpithet,
  FAVORITE_TO_RULER_MIN,
  isCourtierDeceiver,
  isFoolishSovereign,
  isTyrantSovereign,
  isWiseSovereign,
  RULER_TO_FAVORITE_MIN,
  seedCourtFavorites,
  selectCourtFavorite
} from "./courtFavorite";
import { generateCharacterHooks } from "./flavorHooks";

function backstory(primary: CommitmentKind): CharacterBackstory {
  return {
    origin: {
      socialStratum: "minor_noble",
      estateStatus: "court_noble",
      birthStateId: 1,
      raisedIn: "capital_court"
    },
    commitment: { primary: { kind: primary }, intensity: 70, conflictPolicy: "primary_wins" },
    tastes: []
  };
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 45,
    gender: "male",
    culture: 1,
    titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 40,
      diplomacy: 50,
      engineering: 30,
      geography: 50,
      intrigue: 40,
      learning: 40,
      martial: 40,
      prowess: 40,
      stewardship: 40
    },
    personality: {
      boldness: 50,
      compassion: 50,
      greed: 40,
      honor: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 40,
      zeal: 50,
      energy: 60,
      piety: 40,
      guile: 40,
      confidence: 60
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 60,
    wealth: 0,
    pastTitles: [],
    backstory: backstory("state"),
    ...overrides
  };
}

function fool(overrides: Partial<Character> = {}): Character {
  return character({
    i: 1,
    name: "Fool",
    skills: {
      artistry: 20,
      diplomacy: 25,
      engineering: 20,
      geography: 25,
      intrigue: 20,
      learning: 22,
      martial: 40,
      prowess: 45,
      stewardship: 20
    },
    personality: {
      boldness: 55,
      compassion: 40,
      greed: 50,
      honor: 45,
      rationality: 22,
      sociability: 60,
      vengefulness: 35,
      zeal: 40,
      energy: 50,
      piety: 40,
      guile: 25,
      confidence: 70
    },
    ...overrides
  });
}

function sage(overrides: Partial<Character> = {}): Character {
  return character({
    i: 1,
    name: "Sage",
    skills: {
      artistry: 50,
      diplomacy: 80,
      engineering: 40,
      geography: 75,
      intrigue: 70,
      learning: 78,
      martial: 45,
      prowess: 30,
      stewardship: 82
    },
    personality: {
      boldness: 45,
      compassion: 60,
      greed: 30,
      honor: 70,
      rationality: 85,
      sociability: 55,
      vengefulness: 20,
      zeal: 50,
      energy: 60,
      piety: 50,
      guile: 40,
      confidence: 65
    },
    ...overrides
  });
}

function deceiver(overrides: Partial<Character> = {}): Character {
  return character({
    i: 2,
    name: "Whisper",
    titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
    skills: {
      artistry: 40,
      diplomacy: 80,
      engineering: 20,
      geography: 40,
      intrigue: 85,
      learning: 50,
      martial: 30,
      prowess: 25,
      stewardship: 45
    },
    personality: {
      boldness: 40,
      compassion: 25,
      greed: 50,
      honor: 30,
      rationality: 70,
      sociability: 80,
      vengefulness: 40,
      zeal: 45,
      energy: 65,
      piety: 20,
      guile: 85,
      confidence: 75
    },
    backstory: backstory("self"),
    ...overrides
  });
}

describe("ruler epithets", () => {
  it("names a low-judgment, low-skill sovereign the Fool", () => {
    expect(isFoolishSovereign(fool())).toBe(true);
    expect(chooseRulerEpithet(fool())).toBe("foolish_king");
  });

  it("names a high-judgment, competent sovereign the Wise", () => {
    expect(isWiseSovereign(sage())).toBe(true);
    expect(chooseRulerEpithet(sage())).toBe("wise_king");
  });

  it("leaves a middling ruler without a court nickname", () => {
    expect(chooseRulerEpithet(character())).toBeUndefined();
  });

  it("names a cruel sovereign the Tyrant even when the desk skills are high", () => {
    const tyrant = character({
      skills: {
        artistry: 40,
        diplomacy: 80,
        engineering: 30,
        geography: 75,
        intrigue: 70,
        learning: 78,
        martial: 60,
        prowess: 40,
        stewardship: 82
      },
      personality: {
        boldness: 70,
        compassion: 18,
        greed: 75,
        honor: 25,
        rationality: 80,
        sociability: 40,
        vengefulness: 82,
        zeal: 50,
        energy: 60,
        piety: 20,
        guile: 70,
        confidence: 80
      }
    });
    expect(isTyrantSovereign(tyrant)).toBe(true);
    expect(isWiseSovereign(tyrant)).toBe(true);
    expect(chooseRulerEpithet(tyrant)).toBe("tyrant_king");
  });

  it("does not call a high-compassion schemer a tyrant", () => {
    const schemer = character({
      personality: { ...character().personality, compassion: 80, guile: 85, vengefulness: 75, honor: 20 }
    });
    expect(isTyrantSovereign(schemer)).toBe(false);
    expect(chooseRulerEpithet(schemer)).not.toBe("tyrant_king");
  });

  it("does not call an honorable or timid vengeful ruler a tyrant", () => {
    const honorableRuler = character({
      personality: { ...character().personality, compassion: 20, vengefulness: 80, honor: 75 }
    });
    expect(isTyrantSovereign(honorableRuler)).toBe(false);

    const timidVengeful = character({
      personality: { ...character().personality, compassion: 20, vengefulness: 80, honor: 20, boldness: 20 }
    });
    expect(isTyrantSovereign(timidVengeful)).toBe(false);

    const passiveGreedy = character({
      personality: {
        ...character().personality,
        compassion: 20,
        honor: 20,
        greed: 80,
        vengefulness: 20,
        boldness: 20
      }
    });
    expect(isTyrantSovereign(passiveGreedy)).toBe(false);
  });

  it("keeps an incompetent sovereign the Fool rather than the Tyrant", () => {
    const cruelFool = fool({
      personality: { ...fool().personality, compassion: 15, vengefulness: 80, honor: 20, greed: 80 }
    });
    expect(isFoolishSovereign(cruelFool)).toBe(true);
    expect(isTyrantSovereign(cruelFool)).toBe(true);
    expect(chooseRulerEpithet(cruelFool)).toBe("foolish_king");
  });

  it("does not treat a martial specialist as wise from prowess alone", () => {
    const warlord = character({
      skills: {
        artistry: 20,
        diplomacy: 30,
        engineering: 20,
        geography: 30,
        intrigue: 20,
        learning: 25,
        martial: 95,
        prowess: 90,
        stewardship: 25
      },
      personality: { ...character().personality, rationality: 80 }
    });
    expect(chooseRulerEpithet(warlord)).toBeUndefined();
  });
});

describe("courtier deceiver", () => {
  it("requires beguiling skill and a loyalty target that is not the ruler", () => {
    expect(isCourtierDeceiver(deceiver())).toBe(true);
    expect(isCourtierDeceiver(deceiver({ backstory: backstory("liege") }))).toBe(false);
    expect(isCourtierDeceiver(deceiver({ backstory: backstory("people") }))).toBe(false);
    expect(isCourtierDeceiver(deceiver({ skills: { ...deceiver().skills, intrigue: 40, diplomacy: 40 } }))).toBe(false);
  });

  it("allows a house-first operator who is not especially greedy", () => {
    const houseFirst = deceiver({
      personality: { ...deceiver().personality, greed: 40 },
      backstory: backstory("house")
    });
    expect(isCourtierDeceiver(houseFirst)).toBe(true);
  });
});

describe("court favorite pairing", () => {
  it("binds one sycophant to a foolish sovereign without rewriting commitment", () => {
    const ruler = fool();
    const whisper = deceiver();
    const loyal = deceiver({
      i: 3,
      name: "Loyal",
      backstory: backstory("liege"),
      personality: { ...deceiver().personality, honor: 80, guile: 30 }
    });

    seedCharacterBonds([ruler, whisper, loyal], 1200);
    seedCourtFavorites([ruler, whisper, loyal], 1200);

    expect(ruler.courtEpithetId).toBe("foolish_king");
    expect(whisper.courtEpithetId).toBe("sycophant");
    expect(loyal.courtEpithetId).toBeUndefined();
    expect(whisper.backstory?.commitment.primary.kind).toBe("self");
    expect(getSolidarity(ruler, whisper.i)).toBeGreaterThanOrEqual(RULER_TO_FAVORITE_MIN);
    expect(getSolidarity(whisper, ruler.i)).toBeGreaterThanOrEqual(FAVORITE_TO_RULER_MIN);
    expect(ruler.backstory?.bonds?.some(b => b.kind === "favorite" && b.targetId === whisper.i)).toBe(true);
    expect(whisper.backstory?.bonds?.some(b => b.kind === "patron" && b.targetId === ruler.i)).toBe(true);
    expect(whisper.backstory?.bonds?.some(b => b.kind === "benefactor" && b.targetId === ruler.i)).toBe(false);
  });

  it("lets a gullible tyrant keep a sycophant, but not a clear-sighted one", () => {
    const gullibleTyrant = character({
      skills: { ...character().skills, intrigue: 30, diplomacy: 40, stewardship: 40, learning: 40, geography: 40 },
      personality: {
        boldness: 60,
        compassion: 15,
        greed: 70,
        honor: 25,
        rationality: 38,
        sociability: 40,
        vengefulness: 80,
        zeal: 40,
        energy: 55,
        piety: 20,
        guile: 50,
        confidence: 70
      }
    });
    const whisper = deceiver();
    seedCourtFavorites([gullibleTyrant, whisper], 1200);
    expect(gullibleTyrant.courtEpithetId).toBe("tyrant_king");
    expect(whisper.courtEpithetId).toBe("sycophant");

    const sharpTyrant = character({
      i: 3,
      name: "Iron",
      skills: {
        artistry: 40,
        diplomacy: 80,
        engineering: 30,
        geography: 75,
        intrigue: 70,
        learning: 78,
        martial: 60,
        prowess: 40,
        stewardship: 82
      },
      personality: {
        boldness: 70,
        compassion: 18,
        greed: 75,
        honor: 25,
        rationality: 80,
        sociability: 40,
        vengefulness: 82,
        zeal: 50,
        energy: 60,
        piety: 20,
        guile: 70,
        confidence: 80
      }
    });
    const other = deceiver({ i: 4, name: "Other" });
    seedCourtFavorites([sharpTyrant, other], 1200);
    expect(sharpTyrant.courtEpithetId).toBe("tyrant_king");
    expect(other.courtEpithetId).toBeUndefined();
  });

  it("does not let a benevolent sovereign take a sycophant as favorite", () => {
    const ruler = character({
      i: 1,
      name: "Kind",
      skills: {
        artistry: 40,
        diplomacy: 60,
        engineering: 30,
        geography: 55,
        intrigue: 45,
        learning: 55,
        martial: 40,
        prowess: 30,
        stewardship: 55
      },
      personality: {
        boldness: 40,
        compassion: 80,
        greed: 25,
        honor: 70,
        rationality: 55,
        sociability: 60,
        vengefulness: 20,
        zeal: 50,
        energy: 55,
        piety: 50,
        guile: 30,
        confidence: 50
      }
    });
    const whisper = deceiver();
    seedCourtFavorites([ruler, whisper], 1200);
    expect(ruler.courtEpithetId).toBe("benevolent_king");
    expect(whisper.courtEpithetId).toBeUndefined();
    expect(selectCourtFavorite(ruler, [ruler, whisper])).toBeUndefined();
  });

  it("never treats a landed Warlord as a sycophant candidate", () => {
    const king = fool();
    const warlord = deceiver({
      i: 2,
      titles: [{ title: "Warlord", landed: true, entityType: "state", entityId: 1 }]
    });
    expect(isCourtierDeceiver(warlord)).toBe(false);
    seedCourtFavorites([king, warlord], 1200);
    expect(warlord.courtEpithetId).not.toBe("sycophant");
  });

  it("does not let a wise sovereign take a sycophant as favorite", () => {
    const ruler = sage();
    const whisper = deceiver();
    seedCourtFavorites([ruler, whisper], 1200);
    expect(ruler.courtEpithetId).toBe("wise_king");
    expect(whisper.courtEpithetId).toBeUndefined();
    expect(selectCourtFavorite(ruler, [ruler, whisper])).toBeUndefined();
    expect(ruler.backstory?.bonds?.some(b => b.kind === "favorite")).toBeFalsy();
  });

  it("keeps an existing sycophant instead of swapping to a higher scorer", () => {
    const ruler = fool();
    const kept = deceiver({ i: 2, name: "Kept", courtEpithetId: "sycophant" });
    const rival = deceiver({
      i: 3,
      name: "Rival",
      skills: { ...deceiver().skills, intrigue: 99, diplomacy: 99 }
    });
    expect(beguileScore(rival)).toBeGreaterThan(beguileScore(kept));
    expect(selectCourtFavorite(ruler, [ruler, kept, rival])?.i).toBe(kept.i);
  });

  it("prefers court nicknames over war-conduct epithets on the name line", () => {
    const ruler = fool({
      courtEpithetId: "foolish_king",
      militaryRecord: { wars: 2, services: [], epithetId: "vanguard" }
    });
    expect(characterPublicEpithetId(ruler)).toBe("foolish_king");
  });

  it("emits flavor hooks for the pair without inventing an incident", () => {
    const ruler = fool();
    const whisper = deceiver();
    seedCourtFavorites([ruler, whisper], 1200);
    const rulerHooks = generateCharacterHooks(ruler);
    const whisperHooks = generateCharacterHooks(whisper);
    expect(rulerHooks.some(h => h.id === "epithet.foolish_king")).toBe(true);
    expect(rulerHooks.some(h => h.id === "bonds.favorite")).toBe(true);
    expect(whisperHooks.some(h => h.id === "epithet.sycophant")).toBe(true);
    expect(whisperHooks.some(h => h.id === "bonds.sycophant")).toBe(true);
  });

  it("does not stack solidarity when run twice", () => {
    const ruler = fool();
    const whisper = deceiver();
    seedCourtFavorites([ruler, whisper], 1200);
    const first = getSolidarity(ruler, whisper.i);
    seedCourtFavorites([ruler, whisper], 1200);
    expect(getSolidarity(ruler, whisper.i)).toBe(first);
  });
});
