import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { getCharacterRoleClassLabel, getCharacterRoleLabel, getCharacterTitleLabel } from "./characterLabels";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("character labels", () => {
  it("localizes saved political titles, including regencies", async () => {
    await i18n.changeLanguage("ja");

    expect(getCharacterTitleLabel("Queen")).toBe("女王");
    expect(getCharacterTitleLabel("King (Under Regency)")).toBe("王（摂政統治下）");
  });

  it("uses stable role kinds and preserves custom role labels", async () => {
    await i18n.changeLanguage("ja");

    expect(getCharacterRoleLabel({ kind: "guildMaster", label: "Guild Master" })).toBe("ギルド親方");
    expect(getCharacterRoleLabel({ kind: "customRole", label: "Court Astrologer" })).toBe("Court Astrologer");
  });

  it("localizes semantic role class filter labels", async () => {
    expect(getCharacterRoleClassLabel("ruler")).toBe("State Ruler");

    await i18n.changeLanguage("ja");
    expect(getCharacterRoleClassLabel("ruler")).toBe("国家元首");
    expect(getCharacterRoleClassLabel("central_officer")).toBe("宮廷官");
  });
});
