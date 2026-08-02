import { afterEach, describe, expect, it } from "vitest";
import i18n, { changeLanguage, LANGUAGE_STORAGE_KEY } from "./index";

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  document.documentElement.lang = "en";
});

describe("internationalization", () => {
  it("switches to Japanese and persists the selection", async () => {
    await changeLanguage("ja");

    expect(i18n.language).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
    expect(i18n.t("uiSettings.language")).toBe("言語");
    expect(i18n.t("characters.dialogTitle", { name: "Ari" })).toBe("人物詳細：Ari");
    expect(i18n.t("economy.goods.names.Wood")).toBe("木材");
  });

  it("uses the requested default value for an untranslated key", () => {
    expect(i18n.t("missing.translation.key", { defaultValue: "English fallback" })).toBe("English fallback");
  });
});
