import type { CharacterSkills, Gender } from "../../characters/characterTypes";
import type { Province, State } from "../../hostTypes";

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

// Keyed by Province.formName, reusing the exact vocabulary produced by the per-state-form
// title pools in defineProvinceForms() in src/generators/provinces-generator.ts. Landed
// province lords (frontier margraves/counts/etc. — see assignProvinceLords()) resolve their
// title from this table so it matches the flavor text already on the map instead of a
// single generic "Margrave" for every frontier province.
const PROVINCE_FORMNAME_TITLES: Record<string, GenderedTitle> = {
  // Monarchy provinces
  County: { male: "Count", female: "Countess" },
  Earldom: { male: "Earl", female: "Countess" },
  Shire: { male: "Sheriff", female: "Sheriff" },
  Landgrave: { male: "Landgrave", female: "Landgravine" },
  Margrave: { male: "Margrave", female: "Margravine" },
  Barony: { male: "Baron", female: "Baroness" },
  Captaincy: { male: "Captain", female: "Captain" },
  Seneschalty: { male: "Seneschal", female: "Seneschal" },
  // Theocracy provinces
  Parish: { male: "Vicar", female: "Vicar" },
  Deanery: { male: "Dean", female: "Dean" },
  // Republic / Union provinces
  Province: { male: "Governor", female: "Governor" },
  Department: { male: "Prefect", female: "Prefect" },
  Governorate: { male: "Governor", female: "Governor" },
  District: { male: "Magistrate", female: "Magistrate" },
  Canton: { male: "Magistrate", female: "Magistrate" },
  Prefecture: { male: "Prefect", female: "Prefect" },
  State: { male: "Governor", female: "Governor" },
  Republic: { male: "Governor", female: "Governor" },
  Council: { male: "Councilor", female: "Councilor" },
  // Anarchy provinces
  Commune: { male: "Chief", female: "Chief" },
  Community: { male: "Elder", female: "Elder" },
  Tribe: { male: "Chieftain", female: "Chieftain" },
  // Wild/leftover provinces
  Island: { male: "Lord", female: "Lady" },
  Islands: { male: "Lord", female: "Lady" },
  Colony: { male: "Governor", female: "Governor" },
  Territory: { male: "Warden", female: "Warden" },
  Land: { male: "Warden", female: "Warden" },
  Region: { male: "Warden", female: "Warden" },
  Clan: { male: "Clan Chief", female: "Clan Chief" },
  Dependency: { male: "Steward", female: "Steward" },
  Area: { male: "Warden", female: "Warden" }
};

const DEFAULT_PROVINCE_LORD_TITLE: GenderedTitle = { male: "Lord", female: "Lady" };

export function resolveProvinceLordTitle(province: Pick<Province, "formName">, gender: Gender): string {
  const table = (province.formName && PROVINCE_FORMNAME_TITLES[province.formName]) || DEFAULT_PROVINCE_LORD_TITLE;
  return table[gender];
}

export interface OfficeConfig {
  title: string;
  primarySkill?: keyof CharacterSkills;
}

export const OFFICES_BY_ERA: Record<string, OfficeConfig[]> = {
  medieval: [
    { title: "Chancellor", primarySkill: "diplomacy" },
    { title: "Marshal", primarySkill: "martial" },
    { title: "Steward", primarySkill: "stewardship" },
    { title: "Spymaster", primarySkill: "intrigue" },
    { title: "Court Chaplain", primarySkill: "learning" }
  ],
  modern: [
    { title: "Prime Minister", primarySkill: "stewardship" },
    { title: "Minister of Foreign Affairs", primarySkill: "diplomacy" },
    { title: "Minister of War", primarySkill: "martial" },
    { title: "Minister of Finance", primarySkill: "stewardship" },
    { title: "Director of Intelligence", primarySkill: "intrigue" }
  ]
};

// Fixed set of central government offices generated for every state in phase 1.
// Defaulting to medieval era as per user request.
export const CENTRAL_OFFICES: readonly OfficeConfig[] = OFFICES_BY_ERA.medieval;
