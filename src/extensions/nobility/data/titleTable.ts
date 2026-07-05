import type { State } from "../../hostTypes";
import type { Gender } from "../generators/characters-generator";

interface GenderedTitle {
  male: string;
  female: string;
}

// Keyed by State.formName, reusing the exact vocabulary produced by
// defineStateForms() in src/generators/states-generator.ts.
const FORMNAME_TITLES: Record<string, GenderedTitle> = {
  Kingdom: { male: "King", female: "Queen" },
  Empire: { male: "Emperor", female: "Empress" },
  Khanate: { male: "Khan", female: "Khatun" },
  Khaganate: { male: "Khagan", female: "Khatun" },
  Horde: { male: "Khan", female: "Khatun" },
  Beylik: { male: "Bey", female: "Begum" },
  Tsardom: { male: "Tsar", female: "Tsarina" },
  Caliphate: { male: "Caliph", female: "Caliph" },
  Emirate: { male: "Emir", female: "Emira" },
  Shogunate: { male: "Shogun", female: "Shogun" },
  Despotate: { male: "Despot", female: "Despotissa" },
  Ulus: { male: "Khan", female: "Khatun" },
  Satrapy: { male: "Satrap", female: "Satrap" },
  "Grand Duchy": { male: "Grand Duke", female: "Grand Duchess" },
  Duchy: { male: "Duke", female: "Duchess" },
  Principality: { male: "Prince", female: "Princess" },
  Marches: { male: "Margrave", female: "Margravine" },
  Dominion: { male: "Lord Protector", female: "Lady Protector" },
  Protectorate: { male: "Lord Protector", female: "Lady Protector" }
};

// Fallback keyed by State.form when formName has no specific entry above.
const FORM_FALLBACK_TITLES: Record<string, GenderedTitle> = {
  Monarchy: { male: "King", female: "Queen" },
  Republic: { male: "President", female: "President" },
  Union: { male: "Chairman", female: "Chairwoman" },
  Theocracy: { male: "High Priest", female: "High Priestess" },
  Anarchy: { male: "Warlord", female: "Warlord" }
};

const DEFAULT_TITLE: GenderedTitle = FORM_FALLBACK_TITLES.Monarchy;

export function resolveRulerTitle(state: Pick<State, "form" | "formName">, gender: Gender): string {
  const table =
    (state.formName && FORMNAME_TITLES[state.formName]) ||
    (state.form && FORM_FALLBACK_TITLES[state.form]) ||
    DEFAULT_TITLE;
  return table[gender];
}

// Fixed set of central government offices generated for every state in phase 1.
export const CENTRAL_OFFICES: readonly string[] = ["Prime Minister", "Minister of War", "Minister of the Treasury"];
