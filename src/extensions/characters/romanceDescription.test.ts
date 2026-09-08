import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ja from "../../i18n/locales/ja.json";
import type { CharacterPersonality } from "./characterTypes";
import { getRomanceDescriptionKeys, type RomanceDescriptionContext } from "./romanceDescription";

const neutral: CharacterPersonality = {
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
const keys = (p: Partial<CharacterPersonality> = {}, context?: RomanceDescriptionContext) =>
  getRomanceDescriptionKeys({ ...neutral, ...p }, context).map(key => key.split(".").at(-1)!);

type Example = [string, Partial<CharacterPersonality>, RomanceDescriptionContext?];
const examples: Example[] = [
  ["retreatFromRomance", { boldness: 15, zeal: 35, energy: 35 }],
  ["passiveRomance", { boldness: 35, zeal: 35, energy: 35 }],
  ["hesitantBeauty", { confidence: 35 }, { appearance: 65 }],
  ["beautyAssured", { confidence: 65 }, { appearance: 65, norms: { appearanceImportance: 65 } }],
  ["beautyConditional", { confidence: 65 }, { appearance: 65 }],
  ["romanticRush", { boldness: 65, energy: 65, rationality: 35 }],
  ["ardentPursuit", { boldness: 65, zeal: 65, energy: 65 }],
  ["quietLonging", { boldness: 35, zeal: 65 }],
  ["confidentApproach", { confidence: 65 }],
  ["cautiousApproach", { boldness: 35 }],
  ["naturalApproach", {}],
  ["faithfulMonogamy", { honor: 65 }, { norms: { marriage: "monogamous" } }],
  ["honorablePlurality", { piety: 65 }, { norms: { marriage: "plural" } }],
  ["honorableSeasons", { honor: 65 }, { norms: { marriage: "episodic" } }],
  ["localPromises", { piety: 65 }],
  ["hiddenLovers", { honor: 35, piety: 35, greed: 65, guile: 65 }],
  ["insatiableAffection", { honor: 35, piety: 35, greed: 85 }],
  ["multipleLovers", { honor: 35, piety: 35, greed: 65 }],
  ["selfDefinedBonds", { honor: 35, piety: 35 }],
  ["negotiatedBonds", {}],
  ["selflessAffection", { compassion: 85 }],
  ["quietAffection", { compassion: 65, sociability: 35 }],
  ["caringAffection", { compassion: 65 }],
  ["absorbingAffection", { zeal: 85, energy: 65 }],
  ["guardedAffection", { guile: 65 }],
  ["reasonedAffection", { rationality: 65 }],
  ["constantCompany", { sociability: 65, energy: 65 }],
  ["independentAffection", { energy: 35 }],
  ["balancedAffection", {}],
  ["restrainedJealousy", { compassion: 65, vengefulness: 85, zeal: 85, guile: 85 }],
  ["gentleConflict", { compassion: 65 }],
  ["consumingJealousy", { compassion: 35, vengefulness: 85, zeal: 65 }],
  ["schemingJealousy", { vengefulness: 65, zeal: 65, guile: 65 }],
  ["fierceJealousy", { vengefulness: 65, zeal: 65 }],
  ["lingeringHurt", { vengefulness: 65 }],
  ["lettingGo", { vengefulness: 15 }],
  ["noScorekeeping", { vengefulness: 35 }],
  ["talkThroughConflict", { rationality: 65 }],
  ["ordinaryConflict", {}]
];

describe("romance descriptions", () => {
  it.each(examples)("describes %s", (expected, personality, context) => {
    const result = keys(personality, context);
    expect(result).toContain(expected);
    expect(new Set(result).size).toBe(4);
    for (const key of result) {
      expect(ja.characters.romanceDescription).toHaveProperty(key);
      expect(en.characters.romanceDescription).toHaveProperty(key);
    }
  });

  it("covers every localized variant", () => {
    const covered = examples.map(([key]) => key).sort();
    expect(covered).toEqual(Object.keys(ja.characters.romanceDescription).sort());
    expect(covered).toEqual(Object.keys(en.characters.romanceDescription).sort());
  });

  it("lets compassion restrain jealousy without erasing it", () => {
    const jealous = { vengefulness: 90, zeal: 90, guile: 90 };
    expect(keys({ ...jealous, compassion: 20 })[3]).toBe("consumingJealousy");
    expect(keys({ ...jealous, compassion: 80 })[3]).toBe("restrainedJealousy");
  });

  it("does not equate piety with monogamy or low piety alone with infidelity", () => {
    expect(keys({ piety: 90 }, { norms: { marriage: "plural" } })[1]).toBe("honorablePlurality");
    expect(keys({ piety: 10, honor: 90, greed: 90 }, { norms: { marriage: "monogamous" } })[1]).toBe(
      "faithfulMonogamy"
    );
    expect(keys({ piety: 10, honor: 10, greed: 50 })[1]).toBe("selfDefinedBonds");
    expect(keys({ piety: 90 })[1]).toBe("localPromises");
  });

  it("does not infer beauty-based social standing where looks matter little or are missing", () => {
    expect(keys({ confidence: 90 }, { appearance: 90, norms: { appearanceImportance: 20 } })[0]).toBe(
      "confidentApproach"
    );
    for (const appearanceImportance of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(keys({ confidence: 90 }, { appearance: 90, norms: { appearanceImportance } })[0]).toBe(
        "beautyConditional"
      );
    }
    for (const appearance of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 64]) {
      expect(keys({ confidence: 90 }, { appearance })[0]).toBe("confidentApproach");
    }
  });

  it("prioritizes withdrawal over confidence in looks", () => {
    expect(
      keys(
        { boldness: 10, zeal: 10, energy: 10, confidence: 90 },
        {
          appearance: 90,
          norms: { appearanceImportance: 90 }
        }
      )[0]
    ).toBe("retreatFromRomance");
  });

  it("uses neutral fallbacks and is deterministic without mutating saved data", () => {
    expect(keys({ confidence: undefined, zeal: Number.NaN })).toEqual(keys());
    const p = Object.freeze({ ...neutral });
    const context = Object.freeze({ appearance: 80, norms: Object.freeze({ marriage: "monogamous" as const }) });
    expect(getRomanceDescriptionKeys(p, context)).toEqual(getRomanceDescriptionKeys(p, context));
  });
});
