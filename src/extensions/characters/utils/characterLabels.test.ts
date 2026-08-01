import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "./characterLabels";

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
});
