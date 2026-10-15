import i18n from "../i18n";
import type { EncyclopediaLanguage, LocalizedText } from "./encyclopediaTypes";

export function toEncyclopediaLanguage(language: string | undefined): EncyclopediaLanguage {
  return language?.startsWith("ja") ? "ja" : "en";
}

/** Resolves bilingual text; falls back to English when the Japanese text is missing. */
export function resolveText(text: LocalizedText, language: EncyclopediaLanguage): string {
  if ("i18nKey" in text) return i18n.t(text.i18nKey, { lng: language });
  return (language === "ja" ? text.ja : undefined) ?? text.en;
}
