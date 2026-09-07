/**
 * Public-epithet occupation catalog, sovereign stem inflection, and name-line picker.
 * Spec: docs/plan/characters/occupation-epithets.md
 */
import i18n from "../../i18n";
import type { Character, CharacterEpithet, EpithetLineage, OccupationEpithetId } from "./characterTypes";
import { resolveOfficeKind } from "./prestige";

/** Same suffix `getCharacterTitleLabel` strips. Stored English titles use this exact string. */
export const UNDER_REGENCY_SUFFIX = " (Under Regency)";

export type EpithetEligibility = "yes" | "rare" | "no";
export type SovereignEpithetStem = "king" | "queen" | "emperor" | "empress" | "lord";

const NAME_LINE_PRIORITY: readonly EpithetLineage[] = [
  "court",
  "war_legend",
  "craft",
  "commerce",
  "office",
  "war_conduct"
];

const SOVEREIGN_STEM_BY_TITLE: Readonly<Record<string, SovereignEpithetStem>> = {
  King: "king",
  Queen: "queen",
  Emperor: "emperor",
  Empress: "empress",
  Tsar: "emperor",
  Tsarina: "lord",
  Khan: "lord",
  Khatun: "lord",
  Khagan: "lord",
  Bey: "lord",
  Begum: "lord",
  Caliph: "lord",
  Emir: "lord",
  Emira: "lord",
  Shogun: "lord",
  Despot: "lord",
  Despotissa: "lord",
  Satrap: "lord",
  "Grand Duke": "lord",
  "Grand Duchess": "lord",
  Duke: "lord",
  Duchess: "lord",
  Prince: "lord",
  Princess: "lord",
  Margrave: "lord",
  Margravine: "lord",
  "Lord Protector": "lord",
  "Lady Protector": "lord",
  President: "lord",
  Chairman: "lord",
  Chairwoman: "lord",
  "High Priest": "lord",
  "High Priestess": "lord",
  Warlord: "lord"
};

const WAR_GOD_TITLE_RE = /^(Marshal|General|Minister of War|Commander|Admiral|Warlord|Shogun)$/i;
const WAR_CONDUCT_TITLE_RE = /^(Marshal|General|Minister of War|Commander|Admiral|Warlord|Shogun)$/i;
const _SPY_TITLE_RE = /spymaster|spy\b|intelligence|secretar.*state|whisper/i;
const INFLECTED_IDS = new Set(["wise_king", "foolish_king"]);

export function isSovereignRuler(character: Pick<Character, "titles">): boolean {
  return character.titles.some(t => t.landed && t.entityType === "state");
}

export function stripUnderRegencySuffix(title: string): string {
  return title.endsWith(UNDER_REGENCY_SUFFIX) ? title.slice(0, -UNDER_REGENCY_SUFFIX.length) : title;
}

export function landedSovereignTitle(character: Pick<Character, "titles">): string | undefined {
  return character.titles.find(t => t.landed && t.entityType === "state")?.title;
}

export function sovereignEpithetStem(title: string): SovereignEpithetStem {
  return SOVEREIGN_STEM_BY_TITLE[stripUnderRegencySuffix(title)] ?? "lord";
}

export function formatEpithetLabel(id: string, character: Pick<Character, "titles"> = { titles: [] }): string {
  const lang = i18n.language ?? "en";
  if (INFLECTED_IDS.has(id) && lang.startsWith("ja")) {
    const title = landedSovereignTitle(character);
    const stem = title ? sovereignEpithetStem(title) : "lord";
    return i18n.t(`characters.epithetStems.${id}.${stem}`);
  }
  return i18n.t(`characters.epithetNames.${id}`);
}

export function allCharacterEpithets(
  character: Pick<Character, "courtEpithetId" | "militaryRecord" | "epithets">
): Array<{ lineage: EpithetLineage; id: string }> {
  const out: Array<{ lineage: EpithetLineage; id: string }> = [];
  if (character.courtEpithetId) out.push({ lineage: "court", id: character.courtEpithetId });
  for (const entry of character.epithets ?? []) {
    if (out.some(e => e.lineage === entry.lineage)) continue;
    out.push({ lineage: entry.lineage, id: entry.id });
  }
  if (character.militaryRecord?.epithetId) {
    out.push({ lineage: "war_conduct", id: character.militaryRecord.epithetId });
  }
  return out;
}

export function characterPublicEpithetId(
  character: Pick<Character, "courtEpithetId" | "militaryRecord" | "epithets">
): string | undefined {
  const all = allCharacterEpithets(character);
  for (const lineage of NAME_LINE_PRIORITY) {
    const hit = all.find(e => e.lineage === lineage);
    if (hit) return hit.id;
  }
  return undefined;
}

function hasRole(character: Pick<Character, "roles">, kind: string, domain?: string): boolean {
  return (character.roles ?? []).some(
    r => r.kind === kind && r.endYear === undefined && (domain === undefined || r.domain === domain)
  );
}

function isSpyOnly(character: Character): boolean {
  return resolveOfficeKind(character) === "spymaster";
}

function hasWarGodTitle(character: Pick<Character, "titles">): boolean {
  return character.titles.some(t => WAR_GOD_TITLE_RE.test(stripUnderRegencySuffix(t.title)));
}

function hasWarConductTitle(character: Pick<Character, "titles">): boolean {
  return (
    character.titles.some(t => WAR_CONDUCT_TITLE_RE.test(stripUnderRegencySuffix(t.title))) ||
    character.titles.some(t => t.landed && t.entityType === "province")
  );
}

function isIndoorMerchantOrg(character: Pick<Character, "roles">): boolean {
  return (character.roles ?? []).some(r =>
    ["merchantOrganizationSecretary", "merchantOrganizationExecutive", "merchantOrganizationAgent"].includes(r.kind)
  );
}

/**
 * Occupation × lineage eligibility. Generated jobs only: non-metallurgy guild masters are rare/future.
 */
export function eligibilityFor(character: Character, lineage: EpithetLineage): EpithetEligibility {
  if (hasRole(character, "guildMaster", "metallurgy")) {
    if (lineage === "craft") return "yes";
  }
  if (hasRole(character, "guildMaster") && lineage === "craft") return "rare";
  if (hasRole(character, "guildApprentice") && lineage === "craft") return "no";
  if (isIndoorMerchantOrg(character)) return "no";
  if (isSpyOnly(character)) return "no";

  if (lineage === "court") {
    if (isSovereignRuler(character)) return "yes";
    const office = resolveOfficeKind(character);
    if (office === "province_lord" || office === "ordinary" || office === "merchant") return "no";
    if (character.titles.some(t => t.entityType === "state" && !t.landed)) return "yes";
    return "no";
  }
  if (lineage === "war_legend") return hasWarGodTitle(character) ? "yes" : "no";
  if (lineage === "war_conduct") return hasWarConductTitle(character) ? "yes" : "no";
  if (lineage === "craft") return "no";
  if (lineage === "commerce") {
    const office = resolveOfficeKind(character);
    if (
      hasRole(character, "merchantOrganizationHead") ||
      hasRole(character, "marketManager") ||
      hasRole(character, "marketRivalMerchant") ||
      office === "merchant"
    ) {
      return "rare";
    }
    return "no";
  }
  if (lineage === "office") {
    const office = resolveOfficeKind(character);
    if (office === "chancellor" || office === "steward") return "rare";
    if (office === "chaplain") return "rare";
    return "no";
  }
  return "no";
}

export function eligibilityByLineage(character: Character): Partial<Record<EpithetLineage, EpithetEligibility>> {
  const lineages: EpithetLineage[] = ["court", "war_conduct", "war_legend", "craft", "commerce", "office"];
  const out: Partial<Record<EpithetLineage, EpithetEligibility>> = {};
  for (const lineage of lineages) {
    const value = eligibilityFor(character, lineage);
    if (value !== "no") out[lineage] = value;
  }
  return out;
}

export function upsertOccupationEpithet(character: Character, entry: CharacterEpithet): void {
  character.epithets ??= [];
  if (character.epithets.some(e => e.lineage === entry.lineage)) return;
  character.epithets.push(entry);
}

export function hasOccupationEpithet(character: Pick<Character, "epithets">, id: OccupationEpithetId): boolean {
  return (character.epithets ?? []).some(e => e.id === id);
}
