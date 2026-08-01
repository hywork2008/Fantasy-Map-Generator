import { create } from "zustand";
import i18n, { changeLanguage, type SupportedLanguage } from "../i18n";

interface LocaleState {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
}

export const useLocaleState = create<LocaleState>(set => ({
  language: i18n.language as SupportedLanguage,
  setLanguage: language => {
    void changeLanguage(language);
    set({ language });
  }
}));
