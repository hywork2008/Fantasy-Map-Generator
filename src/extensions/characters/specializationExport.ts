import type { WorldLanguages } from "../../types/worldLanguages";
import type { Character } from "./characterTypes";
import { SPECIALIZATION_DEFINITIONS } from "./specializationCatalog";
import { readSpecializationAxis } from "./specializations";
import type { PracticalSkillReader } from "./specializationTypes";

/** RFC4180 cells, including names supplied by the map editor. */
export function specializationCsvRows(
  character: Character,
  world?: WorldLanguages,
  readPractice?: PracticalSkillReader
): string[] {
  const csv = (cells: unknown[]) => cells.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
  const rows = [csv(["Specializations", "Knowledge", "Practice", "Appraisal"])];
  for (const definition of SPECIALIZATION_DEFINITIONS) {
    const scores = (["knowledge", "practice", "appraisal"] as const).map(axis =>
      readSpecializationAxis(character, definition.id, axis, readPractice)
    );
    if (
      scores.every(score => score === undefined) &&
      !character.specializations?.domains.some(entry => entry.domainId === definition.id)
    )
      continue;
    rows.push(csv([definition.id, ...scores]));
  }
  rows.push(csv(["Languages", "Listening", "Speaking", "Acquisition", "Script", "Reading", "Writing"]));
  for (const language of character.specializations?.languages ?? []) {
    const name = world?.languages.find(entry => entry.id === language.languageId)?.name ?? language.languageId;
    for (const literacy of language.literacy.length ? language.literacy : [undefined])
      rows.push(
        csv([
          name,
          language.listening,
          language.speaking,
          language.acquisition,
          literacy?.scriptId,
          literacy?.reading,
          literacy?.writing
        ])
      );
  }
  rows.push(csv(["Familiarity", "Kind", "Target", "Knowledge", "Practice"]));
  for (const entry of character.specializations?.familiarities ?? [])
    rows.push(csv([entry.domainId, entry.kind, entry.id, entry.knowledge, entry.practice]));
  rows.push(csv(["Experience", "Year", "Field", "Activity", "Years", "Role", "Outcome", "Source"]));
  for (const entry of character.specializations?.experience ?? [])
    rows.push(
      csv([entry.id, entry.year, entry.domainId, entry.mode, entry.coverage, entry.role, entry.outcome, entry.source])
    );
  return rows;
}
