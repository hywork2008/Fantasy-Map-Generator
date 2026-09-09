/**
 * Court nicknames and the foolish-sovereign / sycophant pairing.
 * Spec: docs/plan/characters/court-favorite.md
 */

import { getSolidarity, inferRoleClass, setSolidarity } from "./backstoryProfile";
import { addCharacterBond, removeCharacterBond } from "./characterBonds";
import type { Character, CharacterRoleClass, CommitmentKind, CourtEpithetId } from "./characterTypes";
import { isCk3Character } from "./characterTypes";
import { characterPublicEpithetId, isSovereignRuler } from "./epithetCatalog";
import { humanCareerYears } from "./prestige";

/** Solidarity floor: the sovereign dotes on the favorite (solid band starts at 50). */
export const RULER_TO_FAVORITE_MIN = 58;
/** Performed loyalty — collegial on the surface, not an oath. */
export const FAVORITE_TO_RULER_MIN = 38;

const MINISTER_ROLES: ReadonlySet<CharacterRoleClass> = new Set(["central_officer", "commander", "religious"]);

/** Loyalty that is not the sitting sovereign as a person. */
const DISLOYAL_TO_RULER: ReadonlySet<CommitmentKind> = new Set([
  "self",
  "wealth",
  "house",
  "patron",
  "hedonism",
  "rivalry",
  "office"
]);

export function governingCompetence(character: Pick<Character, "skills">): number {
  const s = character.skills;
  return (s.diplomacy + s.stewardship + s.learning + s.geography) / 4;
}

export function beguileScore(character: Character): number {
  return (
    (character.skills.intrigue + character.skills.diplomacy) / 2 +
    character.personality.guile * 0.25 +
    character.personality.sociability * 0.2
  );
}

export { characterPublicEpithetId, isSovereignRuler };

function isMinisterLike(character: Character): boolean {
  return MINISTER_ROLES.has(inferRoleClass(character));
}

/**
 * 愚王・暗君: 全体的な統治能力・判断力・軍事・謀略が低水準な無能君主。
 * いずれかの分野で人並み以上の才覚を発揮している君主は愚君にしない。
 */
export function isFoolishSovereign(character: Character): boolean {
  if (!isSovereignRuler(character)) return false;
  const p = character.personality;
  const s = character.skills;
  if (p.rationality > 35) return false;
  if (governingCompetence(character) > 40) return false;
  if (s.intrigue > 40) return false;
  if (s.martial > 45) return false;
  return true;
}

/** High judgment, competent at the desk, and not blind to intrigue. */
export function isWiseSovereign(character: Character): boolean {
  if (!isSovereignRuler(character)) return false;
  const p = character.personality;
  return p.rationality >= 70 && governingCompetence(character) >= 65 && character.skills.intrigue >= 50;
}

/** Broader than 愚王: weak enough that a skilled courtier can capture the ear. */
export function isGullibleSovereign(character: Character): boolean {
  if (!isSovereignRuler(character)) return false;
  if (isWiseSovereign(character)) return false;
  if (governingCompetence(character) > 55) return false;
  const p = character.personality;
  return p.rationality <= 40 && (character.skills.intrigue <= 45 || governingCompetence(character) <= 45);
}

/**
 * 佞臣: skilled at beguiling, polished at court, and not committed to this ruler as a person.
 * Greed is not required — a house-first or office-first operator still qualifies.
 */
export function isCourtierDeceiver(character: Character): boolean {
  if (isSovereignRuler(character)) return false;
  if (!isMinisterLike(character)) return false;
  const p = character.personality;
  if (p.guile < 60 || p.sociability < 55 || p.honor > 55) return false;
  if (Math.max(character.skills.intrigue, character.skills.diplomacy) < 65) return false;
  const kind = character.backstory?.commitment.primary.kind;
  if (!kind || kind === "liege") return false;
  return DISLOYAL_TO_RULER.has(kind);
}

/**
 * 暴君: publicly cruel, not merely strict, observant, or calculating.
 * Requires genuine cruelty (compassion <= 20), thin moral restraint (honor <= 45),
 * and an aggressive impulse to oppress (ruthless retaliation, predatory greed, or domineering boldness).
 */
export function isTyrantSovereign(character: Character): boolean {
  if (!isSovereignRuler(character)) return false;
  const p = character.personality;
  // Genuine lack of mercy — 30 is merely pragmatic/detached, not cruel.
  if (p.compassion > 20) return false;
  // An honorable sovereign or devout moralist is not a tyrant.
  if (p.honor > 45) return false;

  // 1. 唯我独尊・覇道型 (Tyrannical Dominance)
  const tyrannicalDominance = p.boldness >= 70 && (p.confidence ?? 50) >= 70 && p.vengefulness >= 55;
  // 2. 苛烈な報復型 (Ruthless Retaliation)
  const ruthlessRetaliation =
    p.vengefulness >= 75 && p.boldness >= 45 && (p.boldness >= 60 || (p.confidence ?? 50) >= 60);
  // 3. 強欲と苛政型 (Tyrannical Greed)
  const tyrannicalGreed = p.honor <= 30 && p.greed >= 70 && (p.vengefulness >= 50 || p.boldness >= 50);
  // 4. 猜疑と粛清型 (Paranoid Purge)
  const paranoidPurge = p.vengefulness >= 70 && p.guile >= 65 && p.sociability <= 45;
  // 5. 狂信的弾圧型 (Zealous Inquisitor)
  const zealousPurge = p.zeal >= 75 && p.piety >= 65 && p.vengefulness >= 50;

  return tyrannicalDominance || ruthlessRetaliation || tyrannicalGreed || paranoidPurge || zealousPurge;
}

export function isBenevolentSovereign(character: Character): boolean {
  if (!isSovereignRuler(character)) return false;
  if (isFoolishSovereign(character) || isTyrantSovereign(character)) return false;
  return character.personality.compassion >= 70 && governingCompetence(character) >= 50;
}

export function isRenownedSovereign(character: Character): boolean {
  if (!isSovereignRuler(character)) return false;
  if (isFoolishSovereign(character) || isTyrantSovereign(character)) return false;
  if (humanCareerYears(character) < 25) return false;
  if ((character.prestige ?? 0) < 95) return false;
  if (governingCompetence(character) < 70) return false;
  return character.skills.diplomacy >= 75;
}

export function chooseRulerEpithet(character: Character): CourtEpithetId | undefined {
  if (!isSovereignRuler(character)) return undefined;
  if (isFoolishSovereign(character)) return "foolish_king";
  if (isTyrantSovereign(character)) return "tyrant_king";
  if (isWiseSovereign(character)) return "wise_king";
  if (isBenevolentSovereign(character)) return "benevolent_king";
  if (isRenownedSovereign(character)) return "renowned_king";
  return undefined;
}

function courtAllowsFavorite(ruler: Character): boolean {
  const id = ruler.courtEpithetId;
  return !id || id === "foolish_king" || id === "tyrant_king";
}

export function selectCourtFavorite(ruler: Character, court: readonly Character[]): Character | undefined {
  if (!isSovereignRuler(ruler)) return undefined;
  if (!courtAllowsFavorite(ruler)) return undefined;
  if (ruler.courtEpithetId !== "foolish_king" && !isGullibleSovereign(ruler)) return undefined;
  if (isWiseSovereign(ruler) || ruler.courtEpithetId === "wise_king") return undefined;

  const peers = court.filter(c => c.i !== ruler.i && !c.dead && c.state === ruler.state);
  const existing = peers.find(c => c.courtEpithetId === "sycophant");
  if (existing) return existing;

  const candidates = peers.filter(c => isCourtierDeceiver(c) && !isSovereignRuler(c));
  if (!candidates.length) return undefined;
  return candidates.slice().sort((a, b) => {
    const delta = beguileScore(b) - beguileScore(a);
    return delta !== 0 ? delta : a.i - b.i;
  })[0];
}

function assignRulerEpithets(living: readonly Character[]): void {
  for (const character of living) {
    if (character.courtEpithetId) continue;
    const epithet = chooseRulerEpithet(character);
    if (epithet) character.courtEpithetId = epithet;
  }
}

function bindFavoritePair(ruler: Character, favorite: Character, currentYear?: number): void {
  setSolidarity(ruler, favorite.i, Math.max(getSolidarity(ruler, favorite.i), RULER_TO_FAVORITE_MIN));
  setSolidarity(favorite, ruler.i, Math.max(getSolidarity(favorite, ruler.i), FAVORITE_TO_RULER_MIN));

  if (!favorite.courtEpithetId) favorite.courtEpithetId = "sycophant";

  addCharacterBond(
    ruler,
    {
      kind: "favorite",
      targetType: "character",
      targetId: favorite.i,
      strength: Math.min(100, 40 + Math.max(0, getSolidarity(ruler, favorite.i)) / 2),
      sinceYear: currentYear,
      note: "Court favorite"
    },
    true
  );
  addCharacterBond(
    favorite,
    {
      kind: "patron",
      targetType: "character",
      targetId: ruler.i,
      strength: Math.min(100, 35 + Math.max(0, getSolidarity(favorite, ruler.i)) / 2),
      sinceYear: currentYear,
      note: "Sovereign as meal-ticket"
    },
    true
  );
  // Surface loyalty is an act — not a benefactor/liege bond.
  removeCharacterBond(favorite, { kind: "benefactor", targetType: "character", targetId: ruler.i });
}

function pairCourtFavorites(living: Character[], currentYear?: number): void {
  const byState = new Map<number, Character[]>();
  for (const character of living) {
    if (!character.state) continue;
    const list = byState.get(character.state) ?? [];
    list.push(character);
    byState.set(character.state, list);
  }

  for (const court of byState.values()) {
    const ruler = court.find(isSovereignRuler);
    if (!ruler) continue;
    const favorite = selectCourtFavorite(ruler, court);
    if (!favorite) continue;
    bindFavoritePair(ruler, favorite, currentYear);
  }
}

/**
 * Assign 愚王/賢王 nicknames and bind at most one 佞臣 per gullible court.
 * Solidarity uses max() so re-runs do not stack. Call after general bond seeding
 * so the featured pair can replace a mistaken benefactor label.
 */
export function seedCourtFavorites(characters: readonly Character[], currentYear?: number): void {
  const living = characters.filter(c => !c.dead && isCk3Character(c));
  assignRulerEpithets(living);
  pairCourtFavorites(living, currentYear);
}

/** Peer add: re-evaluate only the affected state's court. */
export function seedCourtFavoritesForPeer(character: Character, all: readonly Character[], currentYear?: number): void {
  if (!isCk3Character(character)) return;
  seedCourtFavorites(
    all.filter(c => !c.dead && (c.i === character.i || c.state === character.state)),
    currentYear
  );
}
