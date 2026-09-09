/**
 * Occupation-lineage epithets (軍神 / 名工 / 豪商 / 悪徳商人 / 能吏).
 * Spec: docs/plan/characters/occupation-epithets.md
 */
import { type Character, type EpithetLineage, isCk3Character, type OccupationEpithetId } from "./characterTypes";
import { eligibilityFor, hasOccupationEpithet, upsertOccupationEpithet } from "./epithetCatalog";
import { SEASONED_CAREER_YEARS } from "./militaryWarRecord";
import { humanCareerYears, resolveOfficeKind } from "./prestige";
import { readEconomyCraftSkill } from "./specializationRuntime";

const WAR_GOD_TITLE_RE = /^(Marshal|General|Minister of War|Commander|Admiral|Warlord|Shogun)$/i;

function hasLineage(character: Character, lineage: EpithetLineage): boolean {
  return (character.epithets ?? []).some(e => e.lineage === lineage);
}

function tryAssign(
  character: Character,
  id: OccupationEpithetId,
  lineage: "war_legend" | "craft" | "commerce" | "office"
): void {
  if (hasLineage(character, lineage)) return;
  upsertOccupationEpithet(character, { lineage, id });
}

export function hasWarGodTitle(character: Pick<Character, "titles">): boolean {
  return character.titles.some(t => WAR_GOD_TITLE_RE.test(t.title));
}

export function isWarGodEligible(character: Character): boolean {
  if (!hasWarGodTitle(character)) return false;
  if (humanCareerYears(character) < SEASONED_CAREER_YEARS) return false;
  if (character.skills.martial < 80 || character.skills.prowess < 75) return false;
  const record = character.militaryRecord;
  if (!record || record.services.length < 1) return false;
  if (record.epithetId === "idle_banner") return false;
  return eligibilityFor(character, "war_legend") !== "no";
}

function isMasterArtisanEligible(character: Character): boolean {
  if (eligibilityFor(character, "craft") !== "yes") return false;
  if (humanCareerYears(character) < 15) return false;
  const skill = readEconomyCraftSkill(character.i, "blacksmithing");
  if (!skill) return false;
  if (skill.proficiency >= 85) return true;
  return skill.proficiency >= 80 && (skill.aptitude === "gifted" || skill.aptitude === "exceptional");
}

function isProdigyEligible(character: Character): boolean {
  const apprentice = (character.roles ?? []).some(
    r => r.kind === "guildApprentice" && r.domain === "metallurgy" && r.endYear === undefined
  );
  if (!apprentice) return false;
  return character.skills.engineering >= 90;
}

function hasMerchantRole(character: Character, kind: string): boolean {
  return (character.roles ?? []).some(r => r.kind === kind && r.endYear === undefined);
}

function isMerchantLike(character: Character): boolean {
  if (hasMerchantRole(character, "merchantOrganizationHead")) return true;
  return resolveOfficeKind(character) === "merchant";
}

/** Capital-market faces of tax farming and the moneylender syndicate. */
function isFiscalMerchant(character: Character): boolean {
  return (
    hasMerchantRole(character, "merchantOrganizationHead") ||
    hasMerchantRole(character, "marketManager") ||
    hasMerchantRole(character, "marketRivalMerchant")
  );
}

function isMagnateEligible(character: Character, all: readonly Character[]): boolean {
  if (eligibilityFor(character, "commerce") === "no") return false;
  if (!isMerchantLike(character)) return false;
  if (character.skills.stewardship < 70 || character.prestige < 55) return false;
  const peers = all.filter(c => !c.dead && c.state === character.state && isMerchantLike(c));
  if (peers.length < 2) return character.wealth >= 80;
  const sorted = peers.map(c => c.wealth ?? 0).sort((a, b) => b - a);
  const cutoff = sorted[Math.max(0, Math.floor(sorted.length * 0.25))] ?? 0;
  return (character.wealth ?? 0) >= Math.max(40, cutoff);
}

function isUnscrupulousMerchantEligible(character: Character): boolean {
  if (eligibilityFor(character, "commerce") === "no") return false;
  if (!isFiscalMerchant(character) && !isMerchantLike(character)) return false;
  const greed = character.personality.greed ?? 50;
  const honor = character.personality.honor ?? 50;
  return greed >= 75 && honor <= 35;
}

function isAbleMinisterEligible(character: Character): boolean {
  if (character.courtEpithetId === "sycophant") return false;
  if (eligibilityFor(character, "office") === "no") return false;
  const office = resolveOfficeKind(character);
  const career = humanCareerYears(character);
  if (office === "chancellor") {
    return character.skills.diplomacy >= 80 && character.prestige >= 50 && career >= 15;
  }
  if (office === "steward") {
    return character.skills.stewardship >= 85 && character.prestige >= 55 && career >= 20;
  }
  return false;
}

export function isBlunderingSchemerEligible(character: Character): boolean {
  if (eligibilityFor(character, "office") === "no") return false;
  const p = character.personality;
  const s = character.skills;
  if (!p || !s) return false;
  if (p.guile < 60 || s.intrigue > 40) return false;

  let blunderDrive = 0;
  if (p.boldness >= 60) blunderDrive += 1;
  if (p.zeal >= 60) blunderDrive += 1;
  if (p.confidence >= 60) blunderDrive += 1;
  if (p.rationality <= 45) blunderDrive += 1;
  if (p.energy >= 55) blunderDrive += 1;

  const gap = p.guile - s.intrigue;
  const threshold = gap >= 40 ? 1 : 2;
  return blunderDrive >= threshold;
}

function assignOccupationEpithetsFor(character: Character, all: readonly Character[]): void {
  if (isWarGodEligible(character)) tryAssign(character, "war_god", "war_legend");
  if (isMasterArtisanEligible(character)) tryAssign(character, "master_artisan", "craft");
  else if (isProdigyEligible(character)) tryAssign(character, "prodigy", "craft");
  if (isUnscrupulousMerchantEligible(character)) tryAssign(character, "unscrupulous_merchant", "commerce");
  else if (isMagnateEligible(character, all)) tryAssign(character, "magnate", "commerce");
  if (isAbleMinisterEligible(character)) tryAssign(character, "able_minister", "office");
  else if (isBlunderingSchemerEligible(character)) tryAssign(character, "blundering_schemer", "office");
}

/** Generation and peer-add only. Load does not call this. Fill-if-empty per lineage. */
export function seedOccupationEpithets(characters: readonly Character[]): void {
  const living = characters.filter(c => !c.dead && isCk3Character(c));
  for (const character of living) assignOccupationEpithetsFor(character, living);
}

export function seedOccupationEpithetsForPeer(character: Character, all: readonly Character[]): void {
  if (!isCk3Character(character) || character.dead) return;
  const living = all.filter(c => !c.dead && isCk3Character(c) && (c.i === character.i || c.state === character.state));
  assignOccupationEpithetsFor(character, living);
}

export { hasOccupationEpithet };
