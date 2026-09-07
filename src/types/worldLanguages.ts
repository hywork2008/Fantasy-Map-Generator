export interface LanguageDefinition {
  id: string;
  name: string;
  familyId?: string;
  scriptIds: string[];
}
export interface ScriptDefinition {
  id: string;
  name: string;
}
export interface CultureLanguageProfile {
  cultureId: number;
  languages: { languageId: string; share: number }[];
  literaryLanguageIds: string[];
  liturgicalLanguageIds: string[];
}
export interface StateLanguagePolicy {
  stateId: number;
  administrativeLanguageIds: string[];
  courtLanguageIds: string[];
  diplomaticLanguageIds: string[];
  recognizedLanguageIds: string[];
}
/** Host-owned map data. Absence preserves the pre-language simulation. */
export interface WorldLanguages {
  version: 1;
  languages: LanguageDefinition[];
  scripts: ScriptDefinition[];
  cultures: CultureLanguageProfile[];
  states: StateLanguagePolicy[];
}
export interface CharacterLanguageSkill {
  languageId: string;
  listening: number;
  speaking: number;
  literacy: { scriptId: string; reading: number; writing: number }[];
  acquisition: "native" | "learned" | "heritage";
  lastUsedYear?: number;
}
