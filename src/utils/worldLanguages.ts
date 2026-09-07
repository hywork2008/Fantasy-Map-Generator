import type { Culture, State } from "../types/models";
import type { CharacterLanguageSkill, WorldLanguages } from "../types/worldLanguages";

/** Uses independent stable IDs, never the names database or UI language. */
export function generateWorldLanguages(cultures: readonly Culture[], states: readonly State[]): WorldLanguages {
  const active = cultures.filter(culture => culture.i > 0 && !culture.removed);
  const world: WorldLanguages = {
    version: 1,
    languages: active.map(culture => ({
      id: `language-${culture.i}`,
      name: culture.name,
      scriptIds: [`script-${culture.i}`]
    })),
    scripts: active.map(culture => ({ id: `script-${culture.i}`, name: culture.name })),
    cultures: active.map(culture => ({
      cultureId: culture.i,
      languages: [{ languageId: `language-${culture.i}`, share: 1 }],
      literaryLanguageIds: [`language-${culture.i}`],
      liturgicalLanguageIds: []
    })),
    states: []
  };
  for (const state of states) {
    if (!state.i || state.removed) continue;
    const languages =
      world.cultures.find(culture => culture.cultureId === state.culture)?.languages.map(entry => entry.languageId) ??
      [];
    world.states.push({
      stateId: state.i,
      administrativeLanguageIds: [...languages],
      courtLanguageIds: [...languages],
      diplomaticLanguageIds: [...languages],
      recognizedLanguageIds: [...languages]
    });
  }
  return world;
}

export function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name}: expected object`);
}
export function assertList(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name}: expected array`);
}
export function assertScore(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
    throw new Error(`${name}: expected 0–100`);
}
export function assertId(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error(`${name}: invalid ID`);
}
function uniqueIds(value: unknown, name: string, allowed?: Set<string>): string[] {
  assertList(value, name);
  const seen = new Set<string>();
  for (const id of value) {
    assertId(id, name);
    if (seen.has(id) || (allowed && !allowed.has(id))) throw new Error(`${name}: duplicate or unknown ID ${id}`);
    seen.add(id);
  }
  return [...seen];
}

export function validateWorldLanguages(value: unknown): asserts value is WorldLanguages | undefined {
  if (value === undefined) return;
  assertObject(value, "languageWorld");
  if (value.version !== 1) throw new Error("languageWorld: unsupported version");
  for (const key of ["languages", "scripts", "cultures", "states"]) assertList(value[key], `languageWorld.${key}`);
  const scripts = new Set<string>();
  const languages = new Set<string>();
  for (const [key, ids] of [
    ["scripts", scripts],
    ["languages", languages]
  ] as const) {
    for (const entry of value[key] as unknown[]) {
      assertObject(entry, key);
      assertId(entry.id, key);
      assertId(entry.name, `${key}.name`);
      if (ids.has(entry.id)) throw new Error(`${key}: duplicate ID`);
      ids.add(entry.id);
      if (key === "languages") {
        uniqueIds(entry.scriptIds, "scriptIds", scripts);
        if (entry.familyId !== undefined) assertId(entry.familyId, "familyId");
      }
    }
  }
  for (const key of ["cultures", "states"] as const) {
    const seen = new Set<number>();
    for (const entry of value[key] as unknown[]) {
      assertObject(entry, key);
      const id = entry[key === "cultures" ? "cultureId" : "stateId"];
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || seen.has(id))
        throw new Error(`${key}: invalid or duplicate entity ID`);
      seen.add(id);
      if (key === "cultures") {
        assertList(entry.languages, "culture.languages");
        let sum = 0;
        const assigned = new Set<string>();
        for (const choice of entry.languages) {
          assertObject(choice, "culture.language");
          assertId(choice.languageId, "languageId");
          if (!languages.has(choice.languageId) || assigned.has(choice.languageId))
            throw new Error("culture: unknown or duplicate language");
          assigned.add(choice.languageId);
          if (
            typeof choice.share !== "number" ||
            !Number.isFinite(choice.share) ||
            choice.share <= 0 ||
            choice.share > 1
          )
            throw new Error("culture: invalid share");
          sum += choice.share;
        }
        if (Math.abs(sum - 1) > 0.000001) throw new Error("culture: language shares must sum to 1");
      }
      for (const field of key === "cultures"
        ? ["literaryLanguageIds", "liturgicalLanguageIds"]
        : ["administrativeLanguageIds", "courtLanguageIds", "diplomaticLanguageIds", "recognizedLanguageIds"])
        uniqueIds(entry[field], field, languages);
    }
  }
}

export function validateCharacterLanguages(
  value: unknown,
  world?: WorldLanguages
): asserts value is CharacterLanguageSkill[] {
  assertList(value, "character.languages");
  const seen = new Set<string>();
  for (const entry of value) {
    assertObject(entry, "language skill");
    assertId(entry.languageId, "languageId");
    if (seen.has(entry.languageId)) throw new Error("duplicate character language");
    seen.add(entry.languageId);
    const language = world?.languages.find(language => language.id === entry.languageId);
    if (world && !language) throw new Error("unknown character language");
    assertScore(entry.listening, "listening");
    assertScore(entry.speaking, "speaking");
    if (!["native", "learned", "heritage"].includes(String(entry.acquisition)))
      throw new Error("invalid language acquisition");
    if (entry.lastUsedYear !== undefined && !Number.isSafeInteger(entry.lastUsedYear))
      throw new Error("invalid language year");
    assertList(entry.literacy, "literacy");
    const scripts = new Set<string>();
    for (const literacy of entry.literacy) {
      assertObject(literacy, "literacy");
      assertId(literacy.scriptId, "scriptId");
      if (scripts.has(literacy.scriptId) || (language && !language.scriptIds.includes(literacy.scriptId)))
        throw new Error("duplicate or incompatible script");
      scripts.add(literacy.scriptId);
      assertScore(literacy.reading, "reading");
      assertScore(literacy.writing, "writing");
    }
  }
}

export function conversationScore(
  a: readonly CharacterLanguageSkill[],
  b: readonly CharacterLanguageSkill[],
  languageId: string
): number {
  const first = a.find(language => language.languageId === languageId);
  const second = b.find(language => language.languageId === languageId);
  return first && second ? Math.min(first.speaking, second.listening, second.speaking, first.listening) : 0;
}

export function literacyScore(
  languages: readonly CharacterLanguageSkill[],
  languageId: string,
  scriptId: string,
  mode: "reading" | "writing"
): number {
  return (
    languages
      .find(language => language.languageId === languageId)
      ?.literacy.find(script => script.scriptId === scriptId)?.[mode] ?? 0
  );
}
