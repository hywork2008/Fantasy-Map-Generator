import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import {
  getCharacterEpithetSuffix,
  getCharacterOverviewRoleFilterLabel,
  getCharacterRoleClassLabel,
  getCharacterRoleLabel,
  getCharacterTitleLabel
} from "./characterLabels";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("character labels", () => {
  it("localizes saved political titles, including regencies and military ranks", async () => {
    await i18n.changeLanguage("ja");

    expect(getCharacterTitleLabel("Queen")).toBe("女王");
    expect(getCharacterTitleLabel("King (Under Regency)")).toBe("王（摂政統治下）");
    expect(getCharacterTitleLabel("General")).toBe("将軍");
    expect(getCharacterTitleLabel("Commander")).toBe("指揮官");
    expect(getCharacterTitleLabel("Knight")).toBe("騎士");
    expect(getCharacterTitleLabel("Marshal")).toBe("元帥");
  });

  it("uses stable role kinds and preserves custom role labels", async () => {
    await i18n.changeLanguage("ja");

    expect(getCharacterRoleLabel({ kind: "guildMaster", label: "Guild Master" })).toBe("ギルド親方");
    expect(getCharacterRoleLabel({ kind: "customRole", label: "Court Astrologer" })).toBe("Court Astrologer");
    expect(getCharacterRoleLabel({ kind: "officer", label: "Commander" })).toBe("指揮官");
    expect(i18n.t("characters.officer")).toBe("武官");
  });

  it("localizes semantic role class filter labels", async () => {
    expect(getCharacterRoleClassLabel("ruler")).toBe("State Ruler");

    await i18n.changeLanguage("ja");
    expect(getCharacterRoleClassLabel("ruler")).toBe("国家元首");
    expect(getCharacterRoleClassLabel("central_officer")).toBe("宮廷官");
  });

  it("prefers a court nickname over a war-conduct epithet", async () => {
    const king = {
      titles: [{ title: "King" as const, landed: true as const, entityType: "state" as const, entityId: 1 }]
    };
    expect(getCharacterEpithetSuffix({ ...king, courtEpithetId: "foolish_king" })).toBe(" (the Fool)");
    expect(getCharacterEpithetSuffix({ ...king, courtEpithetId: "tyrant_king" })).toBe(" (the Tyrant)");
    expect(
      getCharacterEpithetSuffix({
        ...king,
        courtEpithetId: "wise_king",
        militaryRecord: { wars: 1, services: [], epithetId: "vanguard" }
      })
    ).toBe(" (the Wise)");

    await i18n.changeLanguage("ja");
    expect(getCharacterEpithetSuffix({ ...king, courtEpithetId: "foolish_king" })).toBe(" (愚王)");
    expect(
      getCharacterEpithetSuffix({
        titles: [{ title: "Emperor", landed: true, entityType: "state", entityId: 1 }],
        courtEpithetId: "wise_king"
      })
    ).toBe(" (賢帝)");
    expect(getCharacterEpithetSuffix({ courtEpithetId: "sycophant" })).toBe(" (佞臣)");
    expect(getCharacterEpithetSuffix({ ...king, courtEpithetId: "tyrant_king" })).toBe(" (暴君)");
  });

  it("localizes guild-specific overview filter choices", async () => {
    expect(getCharacterOverviewRoleFilterLabel("guildMaster")).toBe("Guild Master");

    await i18n.changeLanguage("ja");
    expect(getCharacterOverviewRoleFilterLabel("guildApprentice")).toBe("ギルド見習い");
  });
});
