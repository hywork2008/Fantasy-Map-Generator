import { describe, expect, it } from "vitest";
import { HUMAN_RACE_ID } from "../../data/races";
import type { Campaign } from "../../types/models";
import type { Character } from "./characterTypes";
import {
  applyMilitaryWarRecord,
  chooseWarConduct,
  epithetFromServices,
  isWarRecordEligible,
  prestigeDeltaForConduct,
  reconstructMilitaryWarRecord,
  SEASONED_CAREER_YEARS
} from "./militaryWarRecord";
import { humanCareerYears } from "./prestige";

function character(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 55,
    gender: "male",
    culture: 1,
    race: HUMAN_RACE_ID,
    titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1, startYear: 1000 }],
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
      martial: 80,
      prowess: 80,
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

function war(overrides: Partial<Campaign> = {}): Campaign {
  return {
    name: "Northern War",
    start: 1010,
    end: 1014,
    attacker: 2,
    defender: 1,
    ...overrides
  };
}

describe("war-record eligibility", () => {
  it("treats Shogun as a military career like Warlord", () => {
    expect(
      isWarRecordEligible(character({ titles: [{ title: "Shogun", landed: true, entityType: "state", entityId: 1 }] }))
    ).toBe(true);
  });
});

describe("war conduct is not state win/loss", () => {
  it("does not treat campaign.end as a personal victory", () => {
    expect(humanCareerYears(character())).toBeGreaterThanOrEqual(SEASONED_CAREER_YEARS);
    let ended: ReturnType<typeof reconstructMilitaryWarRecord>;
    let open: ReturnType<typeof reconstructMilitaryWarRecord>;
    for (let i = 1; i < 80; i++) {
      ended = reconstructMilitaryWarRecord(
        character({ i }),
        [war({ end: 1014, attacker: 1, defender: 2, name: "Ended campaign" })],
        1040
      );
      if (!ended?.services.length) continue;
      open = reconstructMilitaryWarRecord(
        character({ i }),
        [war({ end: undefined, attacker: 1, defender: 2, name: "Ended campaign" })],
        1040
      );
      break;
    }
    expect(ended?.services.length).toBeGreaterThan(0);
    expect(ended?.services[0]?.conduct).toBe(open?.services[0]?.conduct);
  });

  it("makes a cautious low-energy officer more likely to sit in the rear than a bold marshal", () => {
    const timid = character({
      personality: {
        boldness: 20,
        compassion: 40,
        greed: 40,
        honor: 30,
        rationality: 50,
        sociability: 40,
        vengefulness: 30,
        zeal: 40,
        energy: 20,
        piety: 40,
        guile: 70,
        confidence: 40
      }
    });
    const bold = character({
      personality: {
        boldness: 85,
        compassion: 40,
        greed: 40,
        honor: 50,
        rationality: 50,
        sociability: 50,
        vengefulness: 40,
        zeal: 50,
        energy: 80,
        piety: 40,
        guile: 30,
        confidence: 70
      }
    });
    const timidKinds = new Set(Array.from({ length: 20 }, (_, i) => chooseWarConduct(timid, false, (i + 0.5) / 20)));
    const boldKinds = new Set(Array.from({ length: 20 }, (_, i) => chooseWarConduct(bold, false, (i + 0.5) / 20)));
    expect(timidKinds.has("rear_idle") || timidKinds.has("cautious_avoid")).toBe(true);
    expect(boldKinds.has("front_assault")).toBe(true);
  });

  it("makes honorable defenders more likely to hold or cover a retreat", () => {
    const guardian = character({
      personality: {
        boldness: 55,
        compassion: 80,
        greed: 20,
        honor: 85,
        rationality: 50,
        sociability: 50,
        vengefulness: 20,
        zeal: 50,
        energy: 70,
        piety: 50,
        guile: 30,
        confidence: 60
      }
    });
    const kinds = Array.from({ length: 20 }, (_, i) => chooseWarConduct(guardian, true, (i + 0.5) / 20));
    expect(kinds.some(k => k === "rearguard_rescue" || k === "defensive_hold")).toBe(true);
  });
});

describe("epithet and prestige from conduct", () => {
  it("gives 守護神 / guardian only after repeated rescue or rescue plus a hold", () => {
    expect(
      epithetFromServices([
        { campaignName: "A", year: 1, opponentStateId: 2, side: "defender", conduct: "rearguard_rescue" },
        { campaignName: "B", year: 2, opponentStateId: 3, side: "defender", conduct: "rearguard_rescue" }
      ])
    ).toBe("guardian");
    expect(
      epithetFromServices([
        { campaignName: "A", year: 1, opponentStateId: 2, side: "defender", conduct: "rearguard_rescue" }
      ])
    ).toBe("last_guard");
    expect(
      epithetFromServices([
        { campaignName: "A", year: 1, opponentStateId: 2, side: "attacker", conduct: "front_assault" }
      ])
    ).toBeUndefined();
  });

  it("does not reward hiding in the rear like a front assault", () => {
    expect(prestigeDeltaForConduct("rear_idle")).toBeLessThan(prestigeDeltaForConduct("front_assault"));
    expect(prestigeDeltaForConduct("rearguard_rescue")).toBeGreaterThan(prestigeDeltaForConduct("front_assault"));
    expect(prestigeDeltaForConduct("cautious_avoid")).toBe(0);
  });
});

describe("applyMilitaryWarRecord", () => {
  it("skips young officers even when the state has old wars", () => {
    const young = character({
      age: 28,
      titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1, startYear: 1035 }]
    });
    expect(applyMilitaryWarRecord(young, [war({ start: 1010, end: 1012 })], 1040)).toBeUndefined();
    expect(young.militaryRecord).toBeUndefined();
  });

  it("adds battle experience and can move prestige without using campaign.end as a win", () => {
    const wars = [
      war({ name: "River War", start: 1010, end: 1013, attacker: 2, defender: 1 }),
      war({ name: "Hill War", start: 1020, end: 1022, attacker: 1, defender: 3 })
    ];
    let marshal = character({ prestige: 60, i: 1 });
    let record = applyMilitaryWarRecord(marshal, wars, 1040);
    for (let i = 2; i < 80 && !record; i++) {
      marshal = character({ prestige: 60, i });
      record = applyMilitaryWarRecord(marshal, wars, 1040);
    }
    expect(record).toBeDefined();
    expect(record!.wars).toBeGreaterThan(0);
    expect(marshal.specializations?.experienceYears.battle).toBe(record!.wars);
    expect(marshal.specializations?.experience.some(e => e.mode === "battle")).toBe(true);
    const expected = 60 + record!.services.reduce((sum, s) => sum + prestigeDeltaForConduct(s.conduct), 0);
    expect(marshal.prestige).toBe(Math.max(1, Math.min(100, expected)));
  });
});
