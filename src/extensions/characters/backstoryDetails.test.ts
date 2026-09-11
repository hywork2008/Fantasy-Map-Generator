import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ja from "../../i18n/locales/ja.json";
import { backstoryDetailRows, formatCharacterTaste, formatOfficeExitReason } from "./backstoryDetails";
import type { CharacterBackstory } from "./characterTypes";

const backstory: CharacterBackstory = {
  origin: {
    socialStratum: "high_noble",
    estateStatus: "officer",
    birthStateId: 2,
    raisedIn: "monastery",
    migration: "immigrant",
    familyOccupation: "trade"
  },
  commitment: { primary: { kind: "state" }, intensity: 80, conflictPolicy: "negotiate" },
  tastes: [],
  goals: [{ kind: "return_home", intensity: 85, status: "active", target: { type: "burg", id: 4 } }],
  principles: ["spare_prisoners"],
  compassionScope: "everyone",
  religiousWar: "defensive",
  lifeEvents: [
    { kind: "office_exit", year: 1002, title: "Marshal", reason: "Resigned (Health)", entityType: "state", entityId: 1 }
  ]
};

describe("backstory display and CSV formatting", () => {
  it.each(["en", "ja"])("resolves optional fields, target names and taste aspects in %s", async language => {
    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { en: { translation: en }, ja: { translation: ja } } });
    const t = i18n.getFixedT(language);
    const rows = backstoryDetailRows(backstory, t, (type, id) => `${type}-${id}`);
    expect(rows).toHaveLength(7);
    expect(rows.find(row => row.key === "goals")?.value).toContain("burg-4");
    expect(rows.find(row => row.key === "lifeEvents")?.value).toContain("1002");
    expect(rows.map(row => row.label + row.value).join(" ")).not.toContain("characters.");
    const value = formatCharacterTaste({ id: "wine", aspect: "value", polarity: "dislike", intensity: 80 }, t);
    expect(value).toContain(language === "ja" ? "価値判断" : "Value");
    expect(formatCharacterTaste({ id: "gardening", polarity: "like", intensity: 90 }, t)).toContain(
      language === "ja" ? "園芸" : "Gardening"
    );
    expect(formatOfficeExitReason("An older custom exit", t)).toBe("An older custom exit");
    expect(
      backstoryDetailRows({ origin: backstory.origin, commitment: backstory.commitment, tastes: [] }, t, () => "")
    ).toHaveLength(2);

    for (const scope of ["self", "species"] as const) {
      const scopeRows = backstoryDetailRows(
        { origin: backstory.origin, commitment: backstory.commitment, tastes: [], compassionScope: scope },
        t,
        () => ""
      );
      const row = scopeRows.find(r => r.key === "compassionScope");
      expect(row?.value).toBeTruthy();
      expect(row?.value).not.toContain("characters.");
    }
  });
});
