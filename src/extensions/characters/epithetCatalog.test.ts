import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import type { Character } from "./characterTypes";
import { governingCompetence } from "./courtFavorite";
import {
  characterPublicEpithetId,
  eligibilityFor,
  formatEpithetLabel,
  isSovereignRuler,
  sovereignEpithetStem,
  stripUnderRegencySuffix
} from "./epithetCatalog";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

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
    ...overrides
  };
}

describe("sovereign stem", () => {
  it("strips the under-regency suffix before lookup", () => {
    expect(stripUnderRegencySuffix("King (Under Regency)")).toBe("King");
    expect(sovereignEpithetStem("King (Under Regency)")).toBe("king");
    expect(sovereignEpithetStem("Queen (Under Regency)")).toBe("queen");
    expect(sovereignEpithetStem("Emperor")).toBe("emperor");
    expect(sovereignEpithetStem("Tsarina")).toBe("lord");
    expect(sovereignEpithetStem("Khagan")).toBe("lord");
    expect(sovereignEpithetStem("President")).toBe("lord");
  });

  it("inflects Japanese wise/foolish labels from the landed title", async () => {
    await i18n.changeLanguage("ja");
    expect(
      formatEpithetLabel(
        "wise_king",
        character({ titles: [{ title: "King (Under Regency)", landed: true, entityType: "state", entityId: 1 }] })
      )
    ).toBe("賢王");
    expect(
      formatEpithetLabel(
        "wise_king",
        character({ titles: [{ title: "Emperor", landed: true, entityType: "state", entityId: 1 }] })
      )
    ).toBe("賢帝");
    expect(
      formatEpithetLabel(
        "wise_king",
        character({ titles: [{ title: "President", landed: true, entityType: "state", entityId: 1 }] })
      )
    ).toBe("賢君");
    expect(
      formatEpithetLabel(
        "foolish_king",
        character({ titles: [{ title: "Queen", landed: true, entityType: "state", entityId: 1 }] })
      )
    ).toBe("愚女王");
    expect(formatEpithetLabel("able_minister", character())).toBe("能吏");
  });

  it("keeps English labels title-agnostic", () => {
    expect(
      formatEpithetLabel(
        "wise_king",
        character({ titles: [{ title: "Emperor", landed: true, entityType: "state", entityId: 1 }] })
      )
    ).toBe("the Wise");
    expect(formatEpithetLabel("able_minister", character())).toBe("the Able");
  });
});

describe("isSovereignRuler", () => {
  it("treats landed state titles as sovereign even when inferRoleClass is not ruler", () => {
    expect(
      isSovereignRuler(character({ titles: [{ title: "Warlord", landed: true, entityType: "state", entityId: 1 }] }))
    ).toBe(true);
    expect(
      isSovereignRuler(character({ titles: [{ title: "Caliph", landed: true, entityType: "state", entityId: 1 }] }))
    ).toBe(true);
    expect(
      isSovereignRuler(
        character({ titles: [{ title: "High Priest", landed: true, entityType: "state", entityId: 1 }] })
      )
    ).toBe(true);
    expect(
      isSovereignRuler(character({ titles: [{ title: "Shogun", landed: true, entityType: "state", entityId: 1 }] }))
    ).toBe(true);
    expect(
      isSovereignRuler(character({ titles: [{ title: "President", landed: true, entityType: "state", entityId: 1 }] }))
    ).toBe(true);
    expect(
      isSovereignRuler(character({ titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }] }))
    ).toBe(false);
    expect(
      isSovereignRuler(character({ titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }] }))
    ).toBe(false);
  });
});

describe("eligibilityFor", () => {
  it("is per lineage so a Warlord can be court and war_legend", () => {
    const warlord = character({ titles: [{ title: "Warlord", landed: true, entityType: "state", entityId: 1 }] });
    expect(eligibilityFor(warlord, "court")).toBe("yes");
    expect(eligibilityFor(warlord, "war_legend")).toBe("yes");
    expect(eligibilityFor(warlord, "war_conduct")).toBe("yes");
  });

  it("marks metallurgy guild masters as craft yes and spies as no", () => {
    const master = character({
      titles: [],
      roles: [
        {
          source: "economy",
          kind: "guildMaster",
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Master"
        }
      ]
    });
    expect(eligibilityFor(master, "craft")).toBe("yes");
    const spy = character({ titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }] });
    expect(eligibilityFor(spy, "court")).toBe("no");
    expect(eligibilityFor(spy, "office")).toBe("no");
  });
});

describe("name-line priority", () => {
  it("prefers court over war_legend over war_conduct", () => {
    const c = character({
      courtEpithetId: "wise_king",
      epithets: [{ lineage: "war_legend", id: "war_god" }],
      militaryRecord: { wars: 2, services: [], epithetId: "vanguard" }
    });
    expect(characterPublicEpithetId(c)).toBe("wise_king");
    expect(characterPublicEpithetId({ ...c, courtEpithetId: undefined })).toBe("war_god");
  });
});

describe("governingCompetence", () => {
  it("does not include martial", () => {
    const c = character({
      skills: {
        artistry: 10,
        diplomacy: 80,
        engineering: 10,
        geography: 80,
        intrigue: 10,
        learning: 80,
        martial: 100,
        prowess: 100,
        stewardship: 80
      }
    });
    expect(governingCompetence(c)).toBe(80);
  });
});
