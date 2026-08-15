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
    expect(i18n.t("mapContextMenu.distanceFromHere")).toBe("ここからの距離");
    expect(i18n.t("mapContextMenu.distanceToHere")).toBe("ここまでの距離");
    expect(i18n.t("menu.layers")).toBe("レイヤー");
    expect(i18n.t("sticked.newMap")).toBe("新しい地図");
    expect(i18n.t("generation.settlementPattern")).toBe("集落パターン");
    expect(i18n.t("generationProgress.generateEntireMap")).toBe("地図をすべて生成");
    expect(i18n.t("generationProgress.stages.landscape.title")).toBe("地形の輪郭");
    expect(i18n.t("layersTab.names.toggleBiomes")).toBe("バイオーム");
    expect(i18n.t("tools.edit")).toBe("編集");
    expect(i18n.t("dialogs.titles.advanceTime")).toBe("時間を進める");
    expect(i18n.t("dialogs.titles.cellInfo")).toBe("セル情報");
    expect(i18n.t("dialogs.chrome.closeAll")).toBe("すべてのダイアログを閉じる");
    expect(i18n.t("dialogs.regenerate.title", { feature: "国家" })).toBe("国家 を再生成");
  });

  it("keeps English and Japanese catalogs on the same keys", () => {
    const flatten = (value: unknown, prefix = ""): string[] => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
          flatten(nested, prefix ? `${prefix}.${key}` : key)
        );
      }
      return [prefix];
    };

    const englishKeys = flatten(i18n.getResourceBundle("en", "translation")).sort();
    const japaneseKeys = flatten(i18n.getResourceBundle("ja", "translation")).sort();
    expect(japaneseKeys).toEqual(englishKeys);
  });

  it("uses the requested default value for an untranslated key", () => {
    expect(i18n.t("missing.translation.key", { defaultValue: "English fallback" })).toBe("English fallback");
  });
});
