import type { TFunction } from "i18next";
import type { CharacterBackstory, CharacterTaste } from "./characterTypes";
import { OFFICE_EXIT_REASONS } from "./officeResignation";

export function formatOfficeExitReason(reason: string, t: TFunction): string {
  const cause = Object.entries(OFFICE_EXIT_REASONS).find(([, value]) => value === reason)?.[0];
  return cause ? t("characters.resignedFor", { reason: t(`characters.officeExitReasonNames.${cause}`) }) : reason;
}

export function formatCharacterTaste(taste: CharacterTaste, t: TFunction): string {
  const label = t(`characters.tasteNames.${taste.id}`, { defaultValue: taste.id });
  const aspect =
    taste.aspect && taste.aspect !== "preference" ? ` · ${t(`characters.tasteAspectNames.${taste.aspect}`)}` : "";
  return `${label} (${taste.intensity})${aspect}`;
}

/** One formatter for Details and CSV, including optional old-save-safe profile extensions. */
export function backstoryDetailRows(
  backstory: CharacterBackstory,
  t: TFunction,
  targetName: (type: "character" | "state" | "burg", id: number) => string
): Array<{ key: string; label: string; value: string }> {
  const rows: Array<{ key: string; label: string; value: string }> = [];
  const add = (key: string, value: string) => rows.push({ key, label: t(`characters.${key}`), value });
  if (backstory.origin.migration) add("migration", t(`characters.migrationNames.${backstory.origin.migration}`));
  if (backstory.origin.familyOccupation)
    add("familyOccupation", t(`characters.familyOccupationNames.${backstory.origin.familyOccupation}`));
  if (backstory.goals?.length)
    add(
      "goals",
      backstory.goals
        .map(
          g =>
            `${t(`characters.goalNames.${g.kind}`)}${g.target ? ` — ${targetName(g.target.type, g.target.id)}` : ""} (${g.intensity}, ${t(`characters.goalStatusNames.${g.status}`)})`
        )
        .join("; ")
    );
  if (backstory.principles?.length)
    add("principles", backstory.principles.map(p => t(`characters.principleNames.${p}`)).join(", "));
  if (backstory.compassionScope)
    add("compassionScope", t(`characters.compassionScopeNames.${backstory.compassionScope}`));
  if (backstory.religiousWar) add("religiousWar", t(`characters.religiousWarNames.${backstory.religiousWar}`));
  if (backstory.lifeEvents?.length)
    add(
      "lifeEvents",
      backstory.lifeEvents.map(e => `${e.year}: ${e.title} — ${formatOfficeExitReason(e.reason, t)}`).join("; ")
    );
  return rows;
}
