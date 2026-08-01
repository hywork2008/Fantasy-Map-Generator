import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ja from "./locales/ja.json";

export const LANGUAGE_STORAGE_KEY = "fmg-language";
export const SUPPORTED_LANGUAGES = ["en", "ja"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value !== null && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

function getInitialLanguage(): SupportedLanguage {
  const storedLanguage = typeof localStorage === "undefined" ? null : localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(storedLanguage) ? storedLanguage : "en";
}

function setDocumentLanguage(language: SupportedLanguage): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

const initialLanguage = getInitialLanguage();
setDocumentLanguage(initialLanguage);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja }
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});

export function changeLanguage(language: SupportedLanguage): Promise<void> {
  if (typeof localStorage !== "undefined") localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  setDocumentLanguage(language);
  return i18n.changeLanguage(language).then(() => undefined);
}

export default i18n;
