/**
 * Character backstory profile: origin, commitment, tastes, favor, and gifts.
 * Spec: docs/plan/characters/backstory-profile.md
 */
import { P, rand } from "../hostUtils";
import type {
  Character,
  CharacterBackstory,
  CharacterCommitment,
  CharacterOrigin,
  CharacterRoleClass,
  CharacterTaste,
  CommitmentFocus,
  CommitmentKind,
  ConflictPolicy,
  EstateStatus,
  FavorBand,
  GiftIntent,
  RaisedIn,
  SocialStratum,
  SolidarityBand,
  TastePolarity
} from "./characterTypes";
import { applyFormCommitmentBoost, applyFormStratumMultiplier } from "./cultureFormPacks";

// ---------------------------------------------------------------------------
// Relation score helpers (solidarity = political; favor = romantic only)
// ---------------------------------------------------------------------------

export function clampRelation(score: number): number {
  return Math.max(-100, Math.min(100, Math.round(score)));
}

/** @deprecated Prefer clampRelation — kept for call-site compatibility. */
export const clampFavor = clampRelation;

export function getSolidarity(from: Character, toId: number): number {
  if (from.i === toId) return 0;
  return from.solidarity?.[toId] ?? 0;
}

export function setSolidarity(from: Character, toId: number, score: number): number {
  if (from.i === toId) return 0;
  const next = clampRelation(score);
  if (!from.solidarity) from.solidarity = {};
  if (next === 0) {
    delete from.solidarity[toId];
    if (Object.keys(from.solidarity).length === 0) delete from.solidarity;
  } else {
    from.solidarity[toId] = next;
  }
  return next;
}

export function adjustSolidarity(from: Character, toId: number, delta: number): number {
  return setSolidarity(from, toId, getSolidarity(from, toId) + delta);
}

export function getSolidarityBand(score: number): SolidarityBand {
  if (score >= 80) return "bonded";
  if (score >= 50) return "solid";
  if (score >= 20) return "collegial";
  if (score <= -80) return "hostile";
  if (score <= -50) return "rivalrous";
  if (score <= -20) return "strained";
  return "neutral";
}

export function getFavor(from: Character, toId: number): number {
  if (from.i === toId) return 0;
  return from.favor?.[toId] ?? 0;
}

export function setFavor(from: Character, toId: number, score: number): number {
  if (from.i === toId) return 0;
  const next = clampRelation(score);
  if (!from.favor) from.favor = {};
  if (next === 0) {
    delete from.favor[toId];
    if (Object.keys(from.favor).length === 0) delete from.favor;
  } else {
    from.favor[toId] = next;
  }
  return next;
}

export function adjustFavor(from: Character, toId: number, delta: number): number {
  return setFavor(from, toId, getFavor(from, toId) + delta);
}

export function getFavorBand(score: number): FavorBand {
  if (score >= 80) return "devoted";
  if (score >= 50) return "fond";
  if (score >= 20) return "friendly";
  if (score <= -80) return "hatred";
  if (score <= -50) return "hostile";
  if (score <= -20) return "wary";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Role class inference
// ---------------------------------------------------------------------------

const RELIGIOUS_TITLE_RE = /chaplain|priest|dean|vicar|bishop|cleric|imam|monk|abb|pontiff|patriarch|caliph/i;
const COMMANDER_TITLES = new Set(["Commander", "Admiral"]);

export function inferRoleClass(character: Character): CharacterRoleClass {
  const roles = character.roles ?? [];
  if (roles.some(r => /market|merchant|guild|company/i.test(r.kind) || /merchant|guild/i.test(r.source))) {
    return "merchant";
  }

  for (const title of character.titles) {
    if (title.entityType === "province" && title.landed) return "province_lord";
    if (COMMANDER_TITLES.has(title.title)) return "commander";
    if (RELIGIOUS_TITLE_RE.test(title.title)) return "religious";
    if (title.landed && title.entityType === "state") return "ruler";
  }

  if (character.titles.some(t => t.entityType === "state" && !t.landed)) return "central_officer";
  return "ordinary";
}

// ---------------------------------------------------------------------------
// Weighted pick
// ---------------------------------------------------------------------------

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights).filter(([, w]) => typeof w === "number" && w > 0) as [T, number][];
  if (entries.length === 0) return "commoner" as T;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

function prestigeForStratum(stratum: SocialStratum): number {
  switch (stratum) {
    case "royal":
      return rand(70, 100);
    case "high_noble":
      return rand(55, 95);
    case "minor_noble":
      return rand(35, 80);
    case "gentry":
      return rand(25, 65);
    case "merchant_born":
      return rand(15, 70);
    case "commoner":
      return rand(5, 45);
    case "freedman":
    case "slave_born":
      return rand(1, 30);
    case "clergy_orphan":
      return rand(20, 60);
    case "foreigner":
      return rand(10, 55);
    case "unknown":
      return rand(1, 50);
  }
}

function estateForRole(roleClass: CharacterRoleClass, stratum: SocialStratum): EstateStatus {
  switch (roleClass) {
    case "ruler":
      return "reigning_dynasty";
    case "province_lord":
      return "landed_noble";
    case "commander":
      return "officer";
    case "central_officer":
      return stratum === "royal" || stratum === "high_noble" || stratum === "minor_noble" ? "court_noble" : "official";
    case "religious":
      return "cleric";
    case "merchant":
      return "burgher";
    default:
      return "freeman";
  }
}

function stratumWeights(roleClass: CharacterRoleClass, formName?: string): Partial<Record<SocialStratum, number>> {
  let weights: Partial<Record<SocialStratum, number>>;
  switch (roleClass) {
    case "ruler":
      weights = { royal: 70, high_noble: 25, unknown: 5 };
      break;
    case "central_officer":
      weights = { high_noble: 40, minor_noble: 30, gentry: 20, commoner: 10 };
      break;
    case "commander":
      weights = { minor_noble: 35, gentry: 25, commoner: 30, freedman: 5, foreigner: 5 };
      break;
    case "province_lord":
      weights = { high_noble: 30, minor_noble: 55, gentry: 15 };
      break;
    case "religious":
      weights = { clergy_orphan: 25, minor_noble: 30, gentry: 25, commoner: 20 };
      break;
    case "merchant":
      weights = { merchant_born: 50, commoner: 30, freedman: 10, minor_noble: 5, foreigner: 5 };
      break;
    default:
      weights = { commoner: 50, gentry: 20, merchant_born: 15, minor_noble: 10, freedman: 5 };
  }
  applyFormStratumMultiplier(weights, formName);
  return weights;
}

function raisedInFor(roleClass: CharacterRoleClass, stratum: SocialStratum, hasCapital: boolean): RaisedIn {
  if (roleClass === "religious" || stratum === "clergy_orphan") {
    return P(0.55) ? "monastery" : hasCapital ? "capital_city" : "provincial_seat";
  }
  if (roleClass === "merchant") {
    return P(0.7) ? "merchant_quarter" : hasCapital ? "capital_city" : "provincial_seat";
  }
  if (roleClass === "commander") {
    return pickWeighted({
      military_camp: 35,
      frontier_burg: 30,
      provincial_seat: 20,
      capital_city: 15
    });
  }
  if (roleClass === "ruler") {
    return hasCapital && P(0.8) ? "capital_court" : "provincial_seat";
  }
  if (roleClass === "central_officer") {
    return pickWeighted({
      capital_court: 40,
      capital_city: 35,
      provincial_seat: 20,
      foreign_court: 5
    });
  }
  if (roleClass === "province_lord") {
    return pickWeighted({ provincial_seat: 50, rural_manor: 30, frontier_burg: 20 });
  }
  return pickWeighted({
    capital_city: 15,
    provincial_seat: 25,
    rural_manor: 25,
    merchant_quarter: 15,
    street: 10,
    frontier_burg: 10
  });
}

// ---------------------------------------------------------------------------
// Commitment
// ---------------------------------------------------------------------------

function commitmentWeights(roleClass: CharacterRoleClass, formName?: string): Partial<Record<CommitmentKind, number>> {
  const base: Partial<Record<CommitmentKind, number>> = (() => {
    switch (roleClass) {
      case "ruler":
        return { state: 30, house: 25, domain: 15, faith: 10, self: 10, ideology: 5, people: 5 };
      case "central_officer":
        return { house: 35, liege: 20, office: 15, state: 10, wealth: 10, self: 10 };
      case "province_lord":
        return { domain: 30, house: 30, family: 15, state: 10, liege: 10, wealth: 5 };
      case "commander":
        return { comrades: 25, liege: 20, craft: 15, state: 15, self: 10, house: 10, wealth: 5 };
      case "religious":
        return { faith: 45, office: 15, state: 10, people: 10, house: 10, craft: 10 };
      case "merchant":
        return { wealth: 30, craft: 20, family: 15, house: 10, self: 10, domain: 10, state: 5 };
      default:
        return { family: 25, self: 20, wealth: 15, craft: 15, state: 10, faith: 10, people: 5 };
    }
  })();

  // Form pack boosts (theocracy / republic / horde / empire / monarchy)
  applyFormCommitmentBoost(base, formName);

  // Sovereign rulers have no personal overlord to serve. Form packs (e.g. monarchy
  // liege:+10) and honor boosts must not reintroduce "liege" as their primary axis.
  // Vassal kings under a suzerain can be modeled later via diplomacy, not by default.
  if (roleClass === "ruler") {
    delete base.liege;
  }

  return base;
}

function applyPersonalityToCommitmentWeights(
  weights: Partial<Record<CommitmentKind, number>>,
  character: Character,
  roleClass: CharacterRoleClass
): Partial<Record<CommitmentKind, number>> {
  const p = character.personality;
  const w = { ...weights };
  if (p.piety >= 80 && p.zeal >= 70) w.faith = (w.faith ?? 0) + 40;
  if (p.greed >= 80 && p.honor <= 40) {
    w.wealth = (w.wealth ?? 0) + 30;
    w.self = (w.self ?? 0) + 20;
  }
  if (p.compassion >= 80 && p.greed <= 40) {
    w.people = (w.people ?? 0) + 25;
    w.family = (w.family ?? 0) + 15;
  }
  if (p.vengefulness >= 85) w.rivalry = (w.rivalry ?? 0) + 35;
  if (p.sociability <= 20) {
    w.comrades = Math.max(0, (w.comrades ?? 0) - 15);
    w.people = Math.max(0, (w.people ?? 0) - 10);
    w.craft = (w.craft ?? 0) + 15;
    w.self = (w.self ?? 0) + 10;
  }
  if (p.honor >= 85) {
    w.house = (w.house ?? 0) + 15;
    // High honor → personal fealty for subjects; for sovereigns, loyalty means crown/realm/house.
    if (roleClass !== "ruler") {
      w.liege = (w.liege ?? 0) + 15;
    } else {
      w.state = (w.state ?? 0) + 10;
      w.house = (w.house ?? 0) + 5;
    }
  }
  if (roleClass === "ruler") {
    delete w.liege;
  }
  return w;
}

function pickConflictPolicy(character: Character): ConflictPolicy {
  const p = character.personality;
  if (p.rationality <= 25 && p.zeal >= 70) return "burn_both";
  if (p.rationality >= 80) return "negotiate";
  if (p.boldness <= 30) return "whichever_hurts_less";
  return "primary_wins";
}

function buildCommitment(character: Character, roleClass: CharacterRoleClass, formName?: string): CharacterCommitment {
  const weights = applyPersonalityToCommitmentWeights(commitmentWeights(roleClass, formName), character, roleClass);
  const primaryKind = pickWeighted(weights);
  const secondaryWeights = { ...weights };
  delete secondaryWeights[primaryKind];
  const secondaryKind = Object.keys(secondaryWeights).length > 0 ? pickWeighted(secondaryWeights) : undefined;

  const primary: CommitmentFocus = {
    kind: primaryKind,
    weight: 100,
    label: primaryKind === "state" ? `State ${character.state}` : undefined
  };
  if (primaryKind === "state" || primaryKind === "liege") {
    // liege target should eventually be a character id (suzerain); state is only a placeholder for state commitment
    primary.targetId = character.state;
  }

  let secondary: CommitmentFocus | undefined;
  if (secondaryKind && P(0.75)) {
    secondary = { kind: secondaryKind, weight: rand(30, 70) };
    if (secondaryKind === "state") secondary.targetId = character.state;
  }

  return {
    primary,
    secondary,
    intensity: character.personality.zeal,
    conflictPolicy: pickConflictPolicy(character)
  };
}

// ---------------------------------------------------------------------------
// Tastes
// ---------------------------------------------------------------------------

const TASTE_CATALOG = [
  "wine",
  "feast",
  "lust",
  "gambling",
  "luxury",
  "hunting",
  "sport",
  "books",
  "music",
  "art",
  "maps",
  "machinery",
  "theology",
  "law",
  "company",
  "salon",
  "solitude",
  "flattery",
  "debate",
  "gossip",
  "ceremony",
  "soldiers",
  "courtiers",
  "merchants",
  "clergy",
  "peasants",
  "foreigners",
  "nobles",
  "war",
  "peace",
  "corruption",
  "gold",
  "land",
  "titles_glory",
  "piety_practice",
  "cruelty",
  "mercy"
] as const;

/** Good names preferred by each taste id (for gift matching). */
export const TASTE_GOOD_MATCH: Readonly<Record<string, readonly string[]>> = {
  wine: ["Wine", "Liquor", "Beer"],
  feast: ["Spices", "Wine", "Cheese", "Honey"],
  salon: ["Honey", "Spices", "Perfume", "Silk", "Cheese"],
  luxury: ["Silk", "Jewelry", "Perfume", "Garments"],
  art: ["Artworks", "Sculptures", "Tapestries", "Marble", "Ivory"],
  music: ["Instruments"],
  books: ["Books", "Paper", "Ink"],
  gold: ["Coins", "Gold Ingot", "Jewelry"],
  gambling: ["Coins"],
  theology: ["Incense", "Candles", "Relics"],
  piety_practice: ["Incense", "Candles", "Relics"],
  hunting: ["Horses", "Furs", "Arms"],
  lust: ["Perfume", "Silk", "Wine"],
  ceremony: ["Incense", "Silk", "Jewelry"],
  gossip: ["Perfume", "Wine", "Silk"]
};

/** Commoner-and-below strata: tavern vices (wine / lust / gambling) dominate leisure. */
function isPopularVicesStratum(stratum?: SocialStratum): boolean {
  return (
    stratum === "commoner" ||
    stratum === "freedman" ||
    stratum === "slave_born" ||
    stratum === "foreigner" ||
    stratum === "unknown"
  );
}

/**
 * Gender × rank multipliers for popular vices (design bias, not historical claim).
 * - Lower ranks: men lean hard into wine / lust / gambling; women less lust, almost no gambling, milder wine.
 * - Among nobles: men's wine & lust stronger the lower the rank; gambling fades as rank rises.
 */
function popularViceMultipliers(
  gender: Character["gender"],
  stratum: SocialStratum | undefined
): { wine: number; lust: number; gambling: number } {
  const female = gender === "female";

  if (isPopularVicesStratum(stratum)) {
    return female ? { wine: 0.55, lust: 0.35, gambling: 0.08 } : { wine: 1.15, lust: 1.1, gambling: 1.15 };
  }
  if (stratum === "merchant_born" || stratum === "gentry") {
    return female ? { wine: 0.5, lust: 0.3, gambling: 0.12 } : { wine: 1.0, lust: 0.95, gambling: 0.9 };
  }
  if (stratum === "minor_noble") {
    // Lower nobility: men still drink and chase; dice less than commoners
    return female ? { wine: 0.45, lust: 0.28, gambling: 0.1 } : { wine: 0.95, lust: 0.9, gambling: 0.45 };
  }
  if (stratum === "high_noble") {
    return female ? { wine: 0.4, lust: 0.22, gambling: 0.06 } : { wine: 0.7, lust: 0.65, gambling: 0.22 };
  }
  if (stratum === "royal") {
    return female ? { wine: 0.35, lust: 0.18, gambling: 0.04 } : { wine: 0.55, lust: 0.5, gambling: 0.12 };
  }
  // clergy_orphan / unknown-ish fallback
  return female ? { wine: 0.45, lust: 0.25, gambling: 0.1 } : { wine: 0.85, lust: 0.8, gambling: 0.7 };
}

function tryViceLike(
  likes: CharacterTaste[],
  id: "wine" | "lust" | "gambling",
  baseChance: number,
  mult: number,
  intensityLo: number,
  intensityHi: number
): void {
  const chance = Math.min(0.92, Math.max(0, baseChance * mult));
  if (chance > 0 && P(chance)) {
    pushTaste(likes, id, "like", rand(intensityLo, intensityHi));
  }
}

/**
 * Gambling needs appetite for variance and excitement. High rationality, low boldness,
 * low energy, and low confidence suppress dice even when greed is high (greedy engineers
 * want sure coin, not a game of chance).
 */
export function gamblingPersonalityMult(p: Character["personality"], skills: Character["skills"]): number {
  let m = 1;

  if (p.rationality >= 85) m *= 0.12;
  else if (p.rationality >= 70) m *= 0.28;
  else if (p.rationality >= 55) m *= 0.55;
  else if (p.rationality <= 30) m *= 1.3;

  if (p.boldness <= 20) m *= 0.15;
  else if (p.boldness <= 35) m *= 0.35;
  else if (p.boldness <= 50) m *= 0.65;
  else if (p.boldness >= 75) m *= 1.2;

  if (p.energy <= 20) m *= 0.25;
  else if (p.energy <= 35) m *= 0.45;
  else if (p.energy >= 75) m *= 1.15;

  if (p.confidence <= 25) m *= 0.3;
  else if (p.confidence <= 40) m *= 0.55;

  // Methodical greed: accumulate, don't wager
  if (p.greed >= 70 && p.rationality >= 70) m *= 0.2;
  if (p.greed >= 70 && p.boldness <= 30) m *= 0.35;

  if (skills.engineering >= 75) m *= 0.45;
  if (skills.stewardship >= 75 && p.rationality >= 55) m *= 0.55;
  if (skills.learning >= 75 && p.rationality >= 60) m *= 0.7;

  return Math.min(1.6, Math.max(0.02, m));
}

/** Steward / engineer types prefer sure holdings over games of chance. */
function skillsLikeSteward(skills: Character["skills"]): boolean {
  return skills.stewardship >= 70 || skills.engineering >= 70;
}

/** Court / office holders who can skim or take bribes as a lifestyle. */
function isPowerHolder(roleClass: CharacterRoleClass): boolean {
  return (
    roleClass === "ruler" ||
    roleClass === "province_lord" ||
    roleClass === "central_officer" ||
    roleClass === "merchant" ||
    roleClass === "commander"
  );
}

/**
 * How much a character is drawn to formal parade / court ritual.
 * Low-rank camp warriors often detest empty ceremony; high office + honor loves the pageant.
 */
function ceremonyParadeScore(
  character: Character,
  roleClass: CharacterRoleClass,
  stratum: SocialStratum | undefined,
  raisedIn?: RaisedIn
): { like: number; dislike: number } {
  const p = character.personality;
  const prestige = character.prestige ?? 50;
  const highStratum = stratum === "royal" || stratum === "high_noble";
  const midStratum = stratum === "minor_noble" || stratum === "gentry";
  const lowStratum =
    stratum === "commoner" || stratum === "freedman" || stratum === "slave_born" || stratum === "foreigner";

  let like = 0;
  let dislike = 0;

  if (roleClass === "ruler") like += 0.45;
  if (roleClass === "province_lord") like += 0.3;
  if (roleClass === "central_officer") like += 0.2;
  if (roleClass === "religious") like += 0.15;
  if (highStratum) like += 0.35;
  else if (midStratum) like += 0.1;
  if (prestige >= 75) like += 0.3;
  else if (prestige >= 55) like += 0.15;
  if (p.honor >= 75) like += 0.25;
  else if (p.honor >= 55) like += 0.1;
  if (p.piety >= 70) like += 0.1;
  if (raisedIn === "capital_court") like += 0.2;
  if (raisedIn === "military_camp" || raisedIn === "frontier_burg") dislike += 0.2;

  const warrior = roleClass === "commander" || character.skills.martial >= 65;
  if (warrior) {
    // Parade marshals vs mud-boot captains
    if (prestige >= 60 || highStratum || roleClass === "ruler") {
      like += 0.35; // military pageantry, reviews, banners
    } else if (prestige < 45 || lowStratum || (midStratum && prestige < 50)) {
      dislike += 0.55; // empty court ritual, standing for hours
    } else {
      dislike += 0.2;
    }
    if (p.honor <= 40) dislike += 0.15;
    if (p.boldness >= 70 && p.piety < 45) dislike += 0.1;
  }

  if (lowStratum && roleClass === "ordinary") dislike += 0.15;
  if (p.sociability <= 25) dislike += 0.1;

  return { like, dislike };
}

/**
 * Appetite for receiving / taking under-the-table money — not the same as liking gold.
 * Power + greed + soft honor + guile opens the palm.
 */
function corruptionLikeChance(
  character: Character,
  roleClass: CharacterRoleClass,
  commitment: CharacterCommitment | undefined,
  worldlyCleric: boolean
): number {
  const p = character.personality;
  if (p.honor >= 75 && p.greed < 80) return 0;
  if (p.greed < 55) return 0;

  const power = isPowerHolder(roleClass) || worldlyCleric;
  if (!power) {
    // Street-level crooks can still like bribes a little
    if (p.greed >= 80 && p.honor <= 35 && p.guile >= 55) return 0.2;
    return 0;
  }

  let chance =
    ((p.greed - 50) / 100) * 0.5 +
    Math.max(0, (55 - p.honor) / 100) * 0.55 +
    (p.guile >= 65 ? 0.18 : p.guile >= 50 ? 0.08 : 0);

  const primary = commitment?.primary.kind;
  if (primary === "wealth" || primary === "self" || primary === "office" || primary === "hedonism") {
    chance += 0.18;
  }
  if (roleClass === "ruler" || roleClass === "province_lord") chance += 0.12;
  if (roleClass === "central_officer") chance += 0.1;
  if (roleClass === "merchant" && p.guile >= 55) chance += 0.08;
  if (worldlyCleric) chance += 0.15;

  return Math.min(0.78, Math.max(0, chance));
}

/**
 * "Broken-precept" / worldly cleric (生臭坊主) — vocation is religious, but character
 * is driven by greed, hollow piety, spite, or low self-control rather than sincere zeal.
 * Design bias for flavor: high piety + low zeal is the classic "office faith" pattern;
 * greed/vengefulness/low honor make the hypocrisy obvious in tastes.
 */
export function isWorldlyClericProfile(character: Character, roleClass: CharacterRoleClass): boolean {
  if (roleClass !== "religious") return false;
  const p = character.personality;
  // Outward devotion without fire
  const hollowPiety = p.piety >= 70 && p.zeal <= 50;
  // Office held for gain
  const greedyOffice = p.greed >= 70 && (p.honor <= 55 || p.guile >= 55);
  // Spiteful accumulation
  const spitefulGreed = p.greed >= 80 || (p.greed >= 65 && p.vengefulness >= 70);
  // Impulsive, poorly governed appetites
  const recklessAppetites = p.rationality <= 35 && (p.greed >= 60 || p.boldness >= 70);
  // Married clergy / large households often signal worldly life (when family already rolled)
  const worldlyHousehold =
    (character.family?.spouses ?? 0) >= 1 && ((character.family?.children ?? 0) >= 3 || p.greed >= 65);
  return hollowPiety || greedyOffice || spitefulGreed || recklessAppetites || worldlyHousehold;
}

function pushTaste(list: CharacterTaste[], id: string, polarity: TastePolarity, intensity: number): void {
  if (list.some(t => t.id === id)) return;
  list.push({ id, polarity, intensity: Math.max(1, Math.min(100, Math.round(intensity))) });
}

function buildTastes(
  character: Character,
  roleClass: CharacterRoleClass,
  commitment?: CharacterCommitment,
  origin?: CharacterOrigin
): CharacterTaste[] {
  const p = character.personality;
  const s = character.skills;
  const stratum = origin?.socialStratum;
  const raisedIn = origin?.raisedIn;
  const likes: CharacterTaste[] = [];
  const dislikes: CharacterTaste[] = [];
  const popularVices = isPopularVicesStratum(stratum) || raisedIn === "street";
  const merchantBorn = stratum === "merchant_born";
  const female = character.gender === "female";
  const viceMul = popularViceMultipliers(character.gender, stratum);
  const gambleMul = viceMul.gambling * gamblingPersonalityMult(p, s);
  // Street life amplifies tavern culture slightly (still gender-scaled)
  const streetBoost = raisedIn === "street" ? 1.15 : 1;
  const worldlyCleric = isWorldlyClericProfile(character, roleClass);
  // Sincere vocation: high piety + real zeal, without the worldly-cleric flags
  const sincereCleric = roleClass === "religious" && !worldlyCleric && p.piety >= 60 && p.zeal >= 55;
  // Cautious calculator: high reason + low nerve → actively rejects gambling
  const gamblingAverse = p.rationality >= 75 && p.boldness <= 35 && p.energy <= 40;

  // Social style: men lean tavern company / banquets; women lean gossip / salon tea society
  if (p.sociability >= 75) {
    if (female) {
      pushTaste(likes, "gossip", "like", rand(60, 95));
      if (P(0.75)) pushTaste(likes, "salon", "like", rand(55, 92));
      if (P(0.3)) pushTaste(likes, "company", "like", rand(45, 80));
      if (P(0.18)) pushTaste(likes, "feast", "like", rand(40, 75));
      if (P(0.4)) pushTaste(likes, "music", "like", rand(45, 85));
      tryViceLike(likes, "wine", 0.28, viceMul.wine, 40, 75);
    } else {
      pushTaste(likes, "company", "like", rand(60, 95));
      tryViceLike(likes, "wine", 0.5, viceMul.wine, 50, 90);
      if (P(0.45)) pushTaste(likes, "feast", "like", rand(50, 90));
      if (P(0.25)) pushTaste(likes, "gossip", "like", rand(40, 75));
    }
    pushTaste(dislikes, "solitude", "dislike", rand(40, 80));
  } else if (p.sociability >= 55 && female) {
    // Moderately social women still trade in salon talk more than banquets
    if (P(0.55)) pushTaste(likes, "gossip", "like", rand(50, 88));
    if (P(0.4)) pushTaste(likes, "salon", "like", rand(45, 85));
  } else if (p.sociability <= 25) {
    pushTaste(likes, "solitude", "like", rand(60, 95));
    if (P(0.5)) pushTaste(likes, "books", "like", rand(50, 90));
    pushTaste(dislikes, female && P(0.55) ? "salon" : "company", "dislike", rand(50, 90));
  }

  // Gossip: women and high-intrigue characters (courtiers, spies)
  if (!likes.some(t => t.id === "gossip")) {
    const gossipChance =
      (female ? 0.22 : 0.06) +
      (p.sociability >= 60 ? 0.12 : 0) +
      (s.intrigue >= 70 ? 0.35 : s.intrigue >= 55 ? 0.15 : 0) +
      (roleClass === "central_officer" ? 0.1 : 0);
    if (P(Math.min(0.75, gossipChance))) {
      pushTaste(likes, "gossip", "like", rand(45, 90));
    }
  }

  if (p.greed >= 75) {
    pushTaste(likes, "gold", "like", rand(70, 100));
    if (P(0.5)) pushTaste(likes, "luxury", "like", rand(50, 90));
    // Methodical greed → land/sure coin more than dice (gambleMul already damps cautious types)
    if (p.rationality >= 70 || skillsLikeSteward(s)) {
      if (P(0.45)) pushTaste(likes, "land", "like", rand(50, 90));
    }
    // Greedy gamblers need appetite for risk — not automatic with greed alone
    tryViceLike(likes, "gambling", worldlyCleric ? 0.55 : 0.35, gambleMul, 50, 90);
  }
  if (p.piety >= 75) {
    // Ceremony is useful for both sincere and worldly clergy (performance of office)
    if (P(worldlyCleric ? 0.55 : 0.9)) {
      pushTaste(likes, "ceremony", "like", rand(50, 90));
    }
    if (sincereCleric || (!worldlyCleric && P(0.85))) {
      pushTaste(likes, "theology", "like", rand(60, 95));
    } else if (worldlyCleric && P(0.4)) {
      // Some broken-precept clergy still enjoy argument / books of law more than doctrine
      pushTaste(likes, "theology", "like", rand(40, 75));
    }
    // Only sincere (or non-cleric devout) take the clean "anti-vice" package
    if (!worldlyCleric) {
      if (P(0.5)) pushTaste(dislikes, "lust", "dislike", rand(40, 80));
      if (P(0.45)) pushTaste(dislikes, "gambling", "dislike", rand(40, 80));
      if (P(0.4)) pushTaste(dislikes, "corruption", "dislike", rand(50, 90));
    }
  } else if (p.piety <= 25) {
    tryViceLike(likes, "wine", 0.5, viceMul.wine, 50, 90);
    if (P(0.3)) pushTaste(likes, "gold", "like", rand(50, 85));
  }

  // Worldly / broken-precept clergy: office + appetites (生臭坊主)
  if (worldlyCleric) {
    // Keep a fig leaf of vocation
    if (P(0.7)) pushTaste(likes, "ceremony", "like", rand(45, 85));
    if (P(0.35)) pushTaste(likes, "flattery", "like", rand(45, 85));
    // Appetites the clean path blocked
    tryViceLike(likes, "wine", 0.7, viceMul.wine * 1.05, 55, 95);
    tryViceLike(likes, "lust", 0.55, viceMul.lust * 1.05, 50, 92);
    tryViceLike(likes, "gambling", 0.5, gambleMul * 1.1, 50, 92);
    if (p.greed >= 70 && P(0.65)) pushTaste(likes, "gold", "like", rand(70, 100));
    if (p.greed >= 70 && P(0.45)) pushTaste(likes, "luxury", "like", rand(55, 92));
    // Hypocrisy: may dislike genuine piety practice in others, or peasants who see through them
    if (P(0.4)) pushTaste(dislikes, "piety_practice", "dislike", rand(40, 75));
    if (p.vengefulness >= 70 && P(0.35)) pushTaste(dislikes, "mercy", "dislike", rand(40, 70));
  }

  // Corruption / open palm: distinct from loving gold. Rulers and officers with soft honor
  // often enjoy receiving under-the-table money; clean high-honor types reject it.
  {
    const hasCorr = likes.some(t => t.id === "corruption") || dislikes.some(t => t.id === "corruption");
    if (!hasCorr) {
      const corrChance = corruptionLikeChance(character, roleClass, commitment, worldlyCleric);
      if (corrChance > 0 && P(corrChance)) {
        pushTaste(likes, "corruption", "like", rand(50, 95));
      } else if (p.honor >= 70 && P(0.35 + (p.honor - 70) / 120)) {
        pushTaste(dislikes, "corruption", "dislike", rand(50, 90));
      }
    }
  }

  // Ceremony: parade & court pageant vs camp disdain for empty ritual
  {
    const parade = ceremonyParadeScore(character, roleClass, stratum, raisedIn);
    if (!likes.some(t => t.id === "ceremony") && !dislikes.some(t => t.id === "ceremony")) {
      if (parade.like >= 0.4 && parade.like >= parade.dislike && P(Math.min(0.85, parade.like))) {
        pushTaste(likes, "ceremony", "like", rand(50, 95));
      } else if (parade.dislike >= 0.35 && P(Math.min(0.8, parade.dislike))) {
        pushTaste(dislikes, "ceremony", "dislike", rand(45, 88));
      }
    }
  }

  // --- Popular vices: wine / lust / gambling (gender × rank) ---
  // Design bias (not a historical study): lower-rank men → strong drink/sex/dice;
  // lower-rank women → milder wine, less lust, almost no gambling;
  // among noble men, wine & lust fall with rank and gambling drops faster upstream.
  // Worldly clerics use the dedicated block above; sincere clergy skip tavern path.
  if (roleClass !== "religious" && p.piety < 80) {
    const pietyDamp = Math.max(0.55, 1 - p.piety / 200);

    if (popularVices) {
      tryViceLike(likes, "wine", 0.78 * pietyDamp * streetBoost, viceMul.wine, 55, 95);
      tryViceLike(likes, "lust", 0.62 * pietyDamp * streetBoost, viceMul.lust, 50, 92);
      tryViceLike(likes, "gambling", 0.58 * pietyDamp * streetBoost, gambleMul, 50, 92);
    } else if (merchantBorn) {
      tryViceLike(likes, "wine", 0.55 * pietyDamp, viceMul.wine, 50, 90);
      tryViceLike(likes, "gambling", 0.45 * pietyDamp, gambleMul, 45, 88);
      if (p.piety < 65) tryViceLike(likes, "lust", 0.35 * pietyDamp, viceMul.lust, 45, 85);
    } else if (stratum === "gentry" || stratum === "minor_noble") {
      // Minor nobility / gentry men: wine & lust still present; gambling softer than commoners
      tryViceLike(likes, "wine", 0.5 * pietyDamp, viceMul.wine, 45, 88);
      if (p.piety < 65) tryViceLike(likes, "lust", 0.38 * pietyDamp, viceMul.lust, 45, 88);
      if (p.piety < 60) tryViceLike(likes, "gambling", 0.28 * pietyDamp, gambleMul, 40, 80);
    } else if (stratum === "high_noble" || stratum === "royal") {
      // Upstream: men drink/chase less than minor nobles; gambling rare
      tryViceLike(likes, "wine", 0.38 * pietyDamp, viceMul.wine, 40, 82);
      if (p.piety < 60) tryViceLike(likes, "lust", 0.28 * pietyDamp, viceMul.lust, 40, 80);
      if (p.piety < 55) tryViceLike(likes, "gambling", 0.18 * pietyDamp, gambleMul, 35, 70);
    }
  }

  // Extra lust path for secular / social / high-energy people (still gender-scaled)
  if (p.piety < 70 && !likes.some(t => t.id === "lust")) {
    const lustChance =
      ((p.piety <= 30 ? 0.28 : 0) +
        (p.sociability >= 65 ? 0.16 : 0) +
        (p.energy >= 65 ? 0.1 : 0) +
        (p.boldness >= 70 ? 0.08 : 0) +
        (character.appearance >= 70 ? 0.08 : 0) +
        (popularVices ? 0.12 : 0)) *
      viceMul.lust;
    if (P(Math.min(0.7, lustChance))) {
      pushTaste(likes, "lust", "like", rand(45, 92));
    }
  }
  // Hedonism-leaning commitment reinforces vices (gender still applies)
  if (commitment?.primary.kind === "hedonism" || commitment?.secondary?.kind === "hedonism") {
    if (p.piety < 75) {
      tryViceLike(likes, "lust", 0.85, viceMul.lust, 55, 95);
      tryViceLike(likes, "wine", 0.65, viceMul.wine, 50, 90);
      tryViceLike(likes, "gambling", 0.55, gambleMul, 50, 90);
    }
  }

  if (s.martial >= 75 || roleClass === "commander") {
    pushTaste(likes, "sport", "like", rand(50, 90));
    if (P(0.5)) pushTaste(likes, "hunting", "like", rand(50, 90));
    if (P(0.4)) pushTaste(likes, "soldiers", "like", rand(50, 90));
    // Camp life: drink and dice (male soldiers much more)
    if (p.piety < 65) tryViceLike(likes, "wine", 0.45, viceMul.wine, 45, 85);
    if (p.piety < 60) tryViceLike(likes, "gambling", 0.4, gambleMul, 45, 85);
    // Low-prestige field officers: more likely to resent court ceremony (if not already set)
    if (
      (character.prestige ?? 50) < 45 &&
      !likes.some(t => t.id === "ceremony") &&
      !dislikes.some(t => t.id === "ceremony") &&
      P(0.55)
    ) {
      pushTaste(dislikes, "ceremony", "dislike", rand(50, 88));
    }
  }
  if (s.intrigue >= 75) {
    if (P(0.55) && !likes.some(t => t.id === "gossip")) {
      pushTaste(likes, "gossip", "like", rand(55, 92));
    }
    if (P(0.4)) pushTaste(likes, "flattery", "like", rand(45, 85));
  }
  if (s.artistry >= 75) {
    pushTaste(likes, "art", "like", rand(70, 100));
    if (P(0.4)) pushTaste(likes, "music", "like", rand(50, 90));
  }
  if (s.learning >= 75) {
    pushTaste(likes, "books", "like", rand(60, 95));
  }
  if (p.compassion >= 75) {
    pushTaste(likes, "mercy", "like", rand(60, 95));
    pushTaste(dislikes, "cruelty", "dislike", rand(50, 90));
  } else if (p.compassion <= 25 && P(0.25)) {
    pushTaste(likes, "cruelty", "like", rand(40, 80));
  }

  if (roleClass === "merchant") {
    pushTaste(likes, "gold", "like", rand(70, 100));
    if (P(0.4)) pushTaste(likes, "merchants", "like", rand(50, 85));
    if (P(0.25)) pushTaste(dislikes, "soldiers", "dislike", rand(40, 75));
    tryViceLike(likes, "wine", 0.42, viceMul.wine, 45, 85);
    tryViceLike(likes, "gambling", 0.38, gambleMul, 45, 85);
  }
  if (roleClass === "religious" && sincereCleric) {
    pushTaste(likes, "theology", "like", rand(70, 100));
    pushTaste(likes, "ceremony", "like", rand(50, 90));
    // Sincere clerics lean against lust/gambling (wine often tolerated)
    if (P(0.55) && !likes.some(t => t.id === "lust")) {
      pushTaste(dislikes, "lust", "dislike", rand(45, 85));
    }
    if (P(0.5) && !likes.some(t => t.id === "gambling")) {
      pushTaste(dislikes, "gambling", "dislike", rand(45, 85));
    }
    if (P(0.4) && !likes.some(t => t.id === "corruption")) {
      pushTaste(dislikes, "corruption", "dislike", rand(45, 85));
    }
  }
  if (roleClass === "central_officer" && s.martial < 40 && P(0.35)) {
    pushTaste(dislikes, "war", "dislike", rand(40, 80));
  }

  // High nobility: public image often rejects dice (and sometimes lust) when devout
  // (skip for worldly clerics — they already have vice likes)
  if (!worldlyCleric && (stratum === "royal" || stratum === "high_noble") && p.piety >= 50 && P(0.4)) {
    if (!likes.some(t => t.id === "lust") && P(female ? 0.55 : 0.35)) {
      pushTaste(dislikes, "lust", "dislike", rand(35, 70));
    }
    if (!likes.some(t => t.id === "gambling") && P(female ? 0.6 : 0.45)) {
      pushTaste(dislikes, "gambling", "dislike", rand(35, 75));
    }
  }

  // Cautious calculators actively dislike gambling (Turnorovo-type: greed + reason, no nerve)
  if (gamblingAverse && !likes.some(t => t.id === "gambling") && P(0.7)) {
    pushTaste(dislikes, "gambling", "dislike", rand(45, 85));
  }

  // Pad to 2–4 likes and 1–3 dislikes with catalog fills
  // Popular-vices strata / worldly clerics: when padding likes, bias toward wine/lust/gambling.
  const canPadLustLike = (p.piety < 65 || worldlyCleric) && !sincereCleric && viceMul.lust >= 0.25;
  const canPadLustDislike = (p.piety >= 55 || sincereCleric) && !worldlyCleric;
  const canPadGamblingLike = (p.piety < 65 || worldlyCleric) && !sincereCleric && !gamblingAverse && gambleMul >= 0.12;
  const canPadGamblingDislike = ((p.piety >= 55 || sincereCleric) && !worldlyCleric) || gamblingAverse;
  const popularPadPool = (["wine", "lust", "gambling"] as const).filter(id => {
    if (id === "lust" && !canPadLustLike) return false;
    if (id === "gambling" && !canPadGamblingLike) return false;
    if (id === "wine" && viceMul.wine < 0.2) return false;
    return !likes.some(t => t.id === id) && !dislikes.some(t => t.id === id);
  });
  // Weight pad picks by gender multipliers (women rarely pad into gambling)
  const weightedPadPick = (): string | null => {
    if (!popularPadPool.length) return null;
    const weights = popularPadPool.map(id => {
      if (id === "wine") return viceMul.wine;
      if (id === "lust") return viceMul.lust;
      return gambleMul;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (let i = 0; i < popularPadPool.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return popularPadPool[i]!;
    }
    return popularPadPool[popularPadPool.length - 1]!;
  };
  // Female pad bias: salon / gossip / music over feast / company / gambling
  const femalePadPool = (["gossip", "salon", "music", "luxury", "art"] as const).filter(
    id => !likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)
  );
  while (likes.length < 2) {
    let id: string | null = null;
    if (female && femalePadPool.length && P(0.55)) {
      id = femalePadPool[rand(0, femalePadPool.length - 1)]!;
    } else if ((popularVices || worldlyCleric) && P(worldlyCleric ? 0.75 : 0.65)) {
      id = weightedPadPick();
    }
    if (!id) id = TASTE_CATALOG[rand(0, TASTE_CATALOG.length - 1)]!;
    if (id === "lust" && !canPadLustLike) continue;
    if (id === "gambling" && !canPadGamblingLike) continue;
    // Women rarely pad into rough company / heavy banquets
    if (female && (id === "feast" || id === "company") && P(0.7)) continue;
    // Worldly clerics / corrupt officers pad into gold/corruption rather than clean theology spam
    if (
      (worldlyCleric || likes.some(t => t.id === "corruption")) &&
      id === "theology" &&
      likes.some(t => t.id === "gold") &&
      P(0.5)
    ) {
      id = P(0.5) ? "gold" : "luxury";
    }
    if (!likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)) {
      pushTaste(likes, id, "like", rand(40, 75));
    } else break;
  }
  while (dislikes.length < 1) {
    const id = TASTE_CATALOG[rand(0, TASTE_CATALOG.length - 1)]!;
    if (id === "lust" && !canPadLustDislike) continue;
    if (id === "gambling" && !canPadGamblingDislike) continue;
    // Don't randomly make worldly lower-status men / worldly clerics / palm-open officers dislike their vices
    if (
      (popularVices || worldlyCleric || likes.some(t => t.id === "corruption")) &&
      (id === "wine" || id === "lust" || id === "gambling" || id === "corruption" || id === "gold") &&
      (worldlyCleric || likes.some(t => t.id === "corruption") || (!female && p.piety < 60))
    ) {
      continue;
    }
    if (!likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)) {
      pushTaste(dislikes, id, "dislike", rand(40, 75));
    } else break;
  }

  // Cap and sort each polarity by intensity (high → low) for UI/CSV consistency
  const sortByIntensity = (list: CharacterTaste[]) => list.sort((a, b) => b.intensity - a.intensity);
  return [...sortByIntensity(likes.slice(0, 4)), ...sortByIntensity(dislikes.slice(0, 3))];
}

// ---------------------------------------------------------------------------
// Origin + full backstory apply
// ---------------------------------------------------------------------------

export interface ApplyBackstoryOptions {
  roleClass?: CharacterRoleClass;
  isReligiousRole?: boolean;
  formName?: string;
  /** State capital burg id (for birth/home defaults). */
  capitalBurgId?: number;
  birthBurgId?: number;
  homeBurgId?: number;
  religionId?: number;
  /** When true, skip re-roll if backstory already present. */
  onlyIfMissing?: boolean;
}

function buildOrigin(
  character: Character,
  options: ApplyBackstoryOptions,
  roleClass: CharacterRoleClass
): CharacterOrigin {
  const capital = options.capitalBurgId;
  const location = character.location;
  const stratum = pickWeighted(stratumWeights(roleClass, options.formName));
  const estateStatus = estateForRole(roleClass, stratum);
  const hasCapital = capital !== undefined && capital > 0;

  let birthBurgId = options.birthBurgId;
  let homeBurgId = options.homeBurgId;

  if (roleClass === "ruler" && hasCapital) {
    birthBurgId ??= P(0.8) ? capital : (location ?? capital);
    homeBurgId ??= capital;
  } else if (roleClass === "central_officer" && hasCapital) {
    birthBurgId ??= P(0.4) ? capital : (location ?? capital);
    homeBurgId ??= P(0.6) ? capital : (location ?? capital);
  } else if (roleClass === "province_lord") {
    homeBurgId ??= location;
    birthBurgId ??= location ?? capital;
  } else if (roleClass === "merchant") {
    birthBurgId ??= location ?? capital;
    homeBurgId ??= location ?? capital;
  } else {
    birthBurgId ??= location ?? capital;
    homeBurgId ??= location ?? capital;
  }

  const raisedIn = raisedInFor(roleClass, stratum, hasCapital);
  const birthStateId = character.birthStateId ?? character.state;

  return {
    socialStratum: stratum,
    estateStatus,
    birthBurgId: birthBurgId && birthBurgId > 0 ? birthBurgId : undefined,
    birthStateId,
    homeBurgId: homeBurgId && homeBurgId > 0 ? homeBurgId : undefined,
    raisedIn,
    isDynasticClaimant: roleClass === "ruler" || stratum === "royal",
    religionId: options.religionId
  };
}

/**
 * Populate `character.backstory`, align birthStateId/nationality, and bias prestige by stratum.
 * Safe to call after titles, roles, and location are assigned.
 */
export function applyCharacterBackstory(character: Character, options: ApplyBackstoryOptions = {}): void {
  if (options.onlyIfMissing && character.backstory) return;

  const roleClass =
    options.roleClass ?? (options.isReligiousRole ? "religious" : undefined) ?? inferRoleClass(character);

  const origin = buildOrigin(character, options, roleClass);
  const commitment = buildCommitment(character, roleClass, options.formName);
  const tastes = buildTastes(character, roleClass, commitment, origin);

  // Integrity: faith commitment with very low piety → boost piety slightly (G1 soft)
  if (commitment.primary.kind === "faith" && character.personality.piety < 20) {
    character.personality.piety = rand(20, 40);
  }

  character.backstory = {
    origin,
    commitment,
    tastes
  } satisfies CharacterBackstory;

  character.birthStateId ??= origin.birthStateId;
  character.nationalityStateId ??= character.state;

  // Soft prestige re-roll toward stratum band (keep some existing variance)
  const band = prestigeForStratum(origin.socialStratum);
  character.prestige = Math.round(character.prestige * 0.35 + band * 0.65);
  character.prestige = Math.max(1, Math.min(100, character.prestige));
}

// ---------------------------------------------------------------------------
// Solidarity (political) + Favor (romantic) seeding
// ---------------------------------------------------------------------------

function isMilitaryRole(character: Character): boolean {
  const cls = inferRoleClass(character);
  if (cls === "commander" || cls === "ruler") return true;
  return character.titles.some(t => COMMANDER_TITLES.has(t.title) || /Marshal|War|General|Admiral/i.test(t.title));
}

function isCourtPowerPlayer(character: Character): boolean {
  const cls = inferRoleClass(character);
  return cls === "ruler" || cls === "central_officer" || cls === "commander" || cls === "province_lord";
}

function isCentralGovernment(character: Character): boolean {
  return character.titles.some(t => t.entityType === "state");
}

/** Court minister / officer (not the sovereign) who can play the flatterer. */
function isMinisterLike(roleClass: CharacterRoleClass): boolean {
  return roleClass === "central_officer" || roleClass === "commander" || roleClass === "religious";
}

/**
 * 佞臣 profile: greedy, guileful, and socially agile enough to fawn on a sovereign.
 * Distinct from raw "high guile = threat" — sociability is the courtier's polish.
 */
function isSycophantProfile(p: Character["personality"]): boolean {
  return p.greed >= 65 && p.guile >= 65 && p.sociability >= 65;
}

/**
 * Personality-driven political regard from `from` toward `to`.
 * Same-regime peers get mild institutional solidarity, then power rivalry and
 * guile/honor/greed dynamics pull many court pairs into friction or rivalry.
 */
export function computeInitialSolidarity(from: Character, to: Character): number {
  const fp = from.personality;
  const tp = to.personality;
  const fromClass = inferRoleClass(from);
  const toClass = inferRoleClass(to);
  let score = rand(-12, 8); // slight negative prior: politics is cold

  // --- Institutional "same regime" (thin solidarity, not friendship) ---
  if (from.state === to.state && from.state !== 0) {
    if (isCourtPowerPlayer(from) && isCourtPowerPlayer(to)) {
      score += rand(2, 10); // we prop up the same state — on paper
    }

    // Power competition among peers who both hold state power
    if (isCentralGovernment(from) && isCentralGovernment(to)) {
      const fromRuler = fromClass === "ruler";
      const toRuler = toClass === "ruler";
      if (!fromRuler && !toRuler) {
        // Officers / commanders: colleagues and rivals for influence
        score -= rand(12, 28);
      } else if (fromRuler && !toRuler) {
        // Ruler viewing subordinate: useful tool vs threat
        score += rand(0, 8);
        const sycophantSubordinate = isMinisterLike(toClass) && isSycophantProfile(tp);
        if (sycophantSubordinate) {
          // Enjoys the flattery; less quick to read polished guile as pure threat
          score += rand(8, 16);
        } else {
          if (tp.guile >= 70 && tp.honor <= 45) score -= rand(10, 25);
          if (tp.honor >= 70 && tp.guile <= 40) score += rand(5, 15);
        }
      } else if (!fromRuler && toRuler) {
        // Subject viewing ruler: loyalty / fear / resentment
        if (fp.honor >= 60) score += rand(5, 18);
        const sycophantMinister = isMinisterLike(fromClass) && isSycophantProfile(fp);
        if (sycophantMinister) {
          // Fawns on the sovereign rather than resenting power for greed/guile
          score += rand(10, 20);
        } else {
          if (fp.greed >= 70 || fp.guile >= 70) score -= rand(5, 18);
        }
        if (fp.vengefulness >= 70) score -= rand(5, 15);
      }
    }

    // Marshal-like vs Spymaster-like office tension
    const fromTitles = from.titles.map(t => t.title);
    const toTitles = to.titles.map(t => t.title);
    const martialOffice = (titles: string[]) => titles.some(t => /Marshal|War|Commander|Admiral/i.test(t));
    const intrigueOffice = (titles: string[]) => titles.some(t => /Spy|Intelligence|Chaplain/i.test(t));
    if (martialOffice(fromTitles) && intrigueOffice(toTitles)) score -= rand(8, 20);
    if (intrigueOffice(fromTitles) && martialOffice(toTitles)) score -= rand(5, 15);
  }

  // --- Shared context: modest solidarity, not automatic friendship ---
  const ao = from.backstory?.origin;
  const bo = to.backstory?.origin;
  if (ao?.birthBurgId && ao.birthBurgId === bo?.birthBurgId) score += rand(4, 12);
  if (from.culture && from.culture === to.culture) score += rand(2, 8);
  if (ao?.religionId !== undefined && ao.religionId === bo?.religionId && ao.religionId !== 0) {
    score += rand(3, 10);
  }
  if (isMilitaryRole(from) && isMilitaryRole(to) && from.state === to.state) {
    // Comradeship (glory rivalry handled via general boldness cohort below, not a flat penalty)
    score += rand(4, 12);
  }

  // --- Guile / competence: schemers respect skill, despise the shallow ---
  if (fp.guile >= 70) {
    if (tp.guile >= 70) {
      // Fellow operators: rational ones trust competence; hot-headed ones feud
      if (fp.rationality >= 55 && tp.rationality >= 50) {
        score += rand(8, 22); // cold mutual respect
      } else {
        score -= rand(15, 35); // knife-fight rivals
      }
      // Still competing for the same dark corridors
      if (isCourtPowerPlayer(from) && isCourtPowerPlayer(to)) score -= rand(5, 15);
    } else if (tp.guile <= 35 || tp.rationality <= 35) {
      // Contempt for the thoughtless or transparent
      score -= rand(18, 40);
    }
  } else if (fp.guile <= 35 && tp.guile >= 70) {
    // Naive actor distrusts / fears the schemer — unless guile is high enough to stay liked on surface
    // (distrust of schemers is about from's reading of to; to's guile does not fully erase suspicion)
    score -= rand(12, 28);
  }

  // --- Warm cohort: high sociability + high compassion get along ---
  if (fp.sociability >= 65 && fp.compassion >= 65 && tp.sociability >= 65 && tp.compassion >= 65) {
    score += rand(10, 24);
  } else if (fp.sociability >= 65 && fp.compassion >= 65 && (tp.sociability >= 55 || tp.compassion >= 55)) {
    score += rand(4, 12);
  }

  // --- Cold / repulsive: high vengefulness + greed ---
  // Such people rarely warm to others...
  if (fp.vengefulness >= 70 && fp.greed >= 70) {
    score -= rand(10, 22);
  }
  // ...and are disliked by others — but high guile masks those traits
  if (tp.vengefulness >= 70 && tp.greed >= 70) {
    const mask = Math.min(1, Math.max(0, (tp.guile - 40) / 50)); // 0@40 → 1@90
    const rawPenalty = rand(12, 28);
    score -= Math.round(rawPenalty * (1 - mask * 0.85));
  }

  // --- Virtue cohort: high honor and/or piety on both sides ---
  const fromVirtue = fp.honor >= 65 || fp.piety >= 65;
  const toVirtue = tp.honor >= 65 || tp.piety >= 65;
  if (fromVirtue && toVirtue) {
    score += rand(8, 20);
  }
  // Friction when one side is virtuous and the other is not
  if (fp.honor >= 70 && tp.honor <= 35) score -= rand(12, 28);
  if (fp.piety >= 70 && tp.piety <= 30) score -= rand(8, 20);
  if (fp.honor <= 35 && tp.honor >= 75) score -= rand(8, 20);

  // --- Active cohort: high zeal / boldness / energy flock together ---
  const activeCount = (p: Character["personality"]) =>
    (p.zeal >= 65 ? 1 : 0) + (p.boldness >= 65 ? 1 : 0) + (p.energy >= 65 ? 1 : 0);
  if (activeCount(fp) >= 2 && activeCount(tp) >= 2) {
    score += rand(8, 20);
  }

  // --- Greed competition (distinct from cold+greedy personal coldness) ---
  if (fp.greed >= 70 && tp.greed >= 70) score -= rand(8, 22);
  if (fp.greed >= 75 && tp.greed <= 30 && tp.honor >= 60) score -= rand(5, 15);

  // --- Zeal mismatch when faith-committed ---
  if (fp.zeal >= 75 && tp.zeal <= 30 && from.backstory?.commitment.primary.kind === "faith") {
    score -= rand(8, 20);
  }

  // --- Commitment clash (house-first vs state-first, etc.) ---
  const fk = from.backstory?.commitment.primary.kind;
  const tk = to.backstory?.commitment.primary.kind;
  if (fk && tk && fk !== tk) {
    if ((fk === "house" || fk === "wealth" || fk === "self") && (tk === "state" || tk === "people" || tk === "liege")) {
      score -= rand(6, 16);
    }
    if (fk === "faith" && (tk === "wealth" || tk === "hedonism")) score -= rand(8, 18);
  }

  // --- Compassion mismatch (when not already covered by warm cohort) ---
  if (fp.compassion >= 75 && tp.compassion <= 25) score -= rand(8, 20);
  if (fp.compassion <= 25 && tp.compassion >= 75) score -= rand(5, 12);

  // --- Vengefulness digs in once relations are already bad ---
  if (fp.vengefulness >= 75 && score < 0) score -= rand(5, 15);

  // Market rivals
  if (
    from.roles?.some(r => r.kind === "marketRivalMerchant") &&
    to.roles?.some(r => r.kind === "marketRivalMerchant")
  ) {
    score -= rand(20, 45);
  }

  // Taste frictions
  if (from.backstory?.tastes.some(t => t.id === "soldiers" && t.polarity === "dislike") && isMilitaryRole(to)) {
    score -= rand(10, 25);
  }
  if (
    from.backstory?.tastes.some(t => t.id === "foreigners" && t.polarity === "dislike") &&
    from.culture !== to.culture
  ) {
    score -= rand(10, 25);
  }
  if (from.backstory?.tastes.some(t => t.id === "merchants" && t.polarity === "dislike") && toClass === "merchant") {
    score -= rand(8, 22);
  }
  if (from.backstory?.tastes.some(t => t.id === "nobles" && t.polarity === "dislike")) {
    const stratum = to.backstory?.origin.socialStratum;
    if (stratum === "royal" || stratum === "high_noble" || stratum === "minor_noble") score -= rand(8, 20);
  }

  return clampRelation(score);
}

function shouldRecordSolidarity(score: number, a: Character, b: Character): boolean {
  if (Math.abs(score) >= 10) return true;
  if (isCourtPowerPlayer(a) && isCourtPowerPlayer(b)) return true;
  if (a.titles.length > 0 && b.titles.length > 0) return true;
  const ao = a.backstory?.origin;
  const bo = b.backstory?.origin;
  if (ao?.birthBurgId && ao.birthBurgId === bo?.birthBurgId) return true;
  return false;
}

/**
 * Romantic / sexual interest only. Sparse; not seeded for every peer pair.
 * High appearance, lust taste, and sociability raise chance and score.
 */
export function computeRomanticFavor(from: Character, to: Character): number | null {
  if (from.i === to.i || from.dead || to.dead) return null;
  // Default: heterosexual court pairing; rare same-sex interest
  if (from.gender === to.gender && !P(0.08)) return null;

  const lust = from.backstory?.tastes.find(t => t.id === "lust" && t.polarity === "like");
  const appearancePull = (to.appearance - 45) / 55; // -0.8..1
  const sociability = from.personality.sociability / 100;
  const baseChance = 0.04 + Math.max(0, appearancePull) * 0.12 + (lust ? lust.intensity / 400 : 0) + sociability * 0.04;
  if (!P(Math.min(0.35, baseChance))) return null;

  let score = rand(5, 25) + Math.round(to.appearance * 0.45) + (lust ? Math.round(lust.intensity * 0.2) : 0);
  score += Math.round((from.personality.sociability - 40) * 0.15);
  if (from.personality.piety >= 75) score -= rand(10, 25);
  if (from.backstory?.tastes.some(t => t.id === "lust" && t.polarity === "dislike")) score -= rand(20, 40);
  // Prestige / forbidden fruit for social climbers
  if (from.personality.greed >= 60) score += Math.round((to.prestige - 40) * 0.15);

  return clampRelation(score);
}

/** Seed solidarity (and sparse romantic favor) for same-state pairs. */
export function seedCharacterRelations(characters: Character[]): void {
  const living = characters.filter(c => !c.dead);
  const byState = new Map<number, Character[]>();
  for (const c of living) {
    const list = byState.get(c.state) ?? [];
    list.push(c);
    byState.set(c.state, list);
  }

  for (const group of byState.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const ab = computeInitialSolidarity(a, b);
        const ba = computeInitialSolidarity(b, a);
        if (shouldRecordSolidarity(ab, a, b) || shouldRecordSolidarity(ba, b, a)) {
          setSolidarity(a, b.i, ab);
          setSolidarity(b, a.i, ba);
        }
        const fab = computeRomanticFavor(a, b);
        if (fab !== null) setFavor(a, b.i, fab);
        const fba = computeRomanticFavor(b, a);
        if (fba !== null) setFavor(b, a.i, fba);
      }
    }
  }
}

/** @deprecated Use seedCharacterRelations */
export const seedCharacterFavor = seedCharacterRelations;

/** When a single character is added later, seed relations against same-state peers. */
export function seedRelationsWithPeers(character: Character, allCharacters: Character[]): void {
  if (character.dead) return;
  for (const other of allCharacters) {
    if (other.dead || other.i === character.i || other.state !== character.state) continue;
    const ab = computeInitialSolidarity(character, other);
    const ba = computeInitialSolidarity(other, character);
    if (shouldRecordSolidarity(ab, character, other) || shouldRecordSolidarity(ba, other, character)) {
      setSolidarity(character, other.i, ab);
      setSolidarity(other, character.i, ba);
    }
    const fab = computeRomanticFavor(character, other);
    if (fab !== null) setFavor(character, other.i, fab);
    const fba = computeRomanticFavor(other, character);
    if (fba !== null) setFavor(other, character.i, fba);
  }
}

/** @deprecated Use seedRelationsWithPeers */
export const seedFavorWithPeers = seedRelationsWithPeers;

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

export interface OfferGiftOptions {
  /** Catalog good name (preferred for matching). */
  goodName?: string;
  goodId?: number;
  amount?: number;
  /** Relative gift value 1–100 when not using catalog value. */
  valueHint?: number;
  intent: GiftIntent;
}

export interface OfferGiftResult {
  delta: number;
  /** Recipient's solidarity toward the giver after the gift. */
  newSolidarity: number;
  /** Recipient's romantic favor toward giver; only moved on romance intent. */
  newFavor?: number;
  matchScore: number;
  treatedAsBribe: boolean;
}

function tasteMatchScore(recipient: Character, goodName: string | undefined): number {
  if (!goodName) return 0;
  const tastes = recipient.backstory?.tastes ?? [];
  let score = 0;
  for (const taste of tastes) {
    const goods = TASTE_GOOD_MATCH[taste.id];
    if (!goods?.some(g => g.toLowerCase() === goodName.toLowerCase())) continue;
    const weight = taste.intensity / 100;
    score += taste.polarity === "like" ? 40 * weight : -45 * weight;
  }
  if (/artwork|sculpture|tapestry|instrument/i.test(goodName)) {
    score += (recipient.skills.artistry - 40) * 0.35;
  }
  if (/book/i.test(goodName)) score += (recipient.skills.learning - 40) * 0.25;
  if (/wine|liquor|beer/i.test(goodName) && recipient.personality.sociability >= 60) score += 10;
  if (/coin|gold|jewelry|ingot/i.test(goodName)) score += (recipient.personality.greed - 40) * 0.3;
  return score;
}

function isHighIntegrity(recipient: Character): boolean {
  const p = recipient.personality;
  const dislikesCorruption = recipient.backstory?.tastes.some(
    t => t.id === "corruption" && t.polarity === "dislike" && t.intensity >= 50
  );
  if (p.honor >= 70 && p.greed <= 40) return true;
  if (p.piety >= 75 && dislikesCorruption) return true;
  const primary = recipient.backstory?.commitment.primary.kind;
  if (primary && ["faith", "people", "state"].includes(primary) && p.greed <= 45 && p.honor >= 55) {
    return true;
  }
  return Boolean(dislikesCorruption && p.honor >= 55);
}

/**
 * Apply a gift/bribe from `from` to `to`.
 * Moves the recipient's **solidarity** toward the giver (political standing).
 * `intent: "romance"` also nudges romantic **favor**.
 */
export function offerGift(from: Character, to: Character, options: OfferGiftOptions): OfferGiftResult {
  const amount = options.amount ?? 1;
  const valueHint = options.valueHint ?? 40;
  const matchScore = tasteMatchScore(to, options.goodName);
  const looksLikeBribe =
    options.intent === "bribe" ||
    (options.intent === "courtesy" && valueHint >= 70 && /coin|gold|ingot|jewelry/i.test(options.goodName ?? ""));
  const integrity = isHighIntegrity(to);
  const treatedAsBribe = looksLikeBribe;

  let delta = 0;
  if (treatedAsBribe && integrity) {
    // Clean characters resent being bought
    const irony = matchScore > 20 ? 1.25 : 1;
    delta = -rand(15, 50) * irony - valueHint * 0.15;
  } else if (matchScore > 5) {
    const greedFactor = 0.6 + to.personality.greed / 200;
    delta = (8 + matchScore * 0.35 + valueHint * 0.08) * greedFactor;
    if (options.intent === "bribe") delta *= 1.15;
  } else if (matchScore < -5) {
    delta = -rand(5, 20) + matchScore * 0.2;
  } else {
    delta = options.intent === "bribe" ? (integrity ? -rand(10, 30) : rand(5, 20)) : rand(1, 8);
  }

  // Transfer inventory if both goodId and stock exist
  if (options.goodId !== undefined && from.inventory) {
    const have = from.inventory[options.goodId] ?? 0;
    const give = Math.min(amount, have);
    if (give > 0) {
      from.inventory[options.goodId] = have - give;
      if (from.inventory[options.goodId] <= 0) delete from.inventory[options.goodId];
      if (!to.inventory) to.inventory = {};
      to.inventory[options.goodId] = (to.inventory[options.goodId] ?? 0) + give;
    }
  }

  const newSolidarity = adjustSolidarity(to, from.i, delta);
  let newFavor: number | undefined;
  if (options.intent === "romance") {
    const romanceDelta = treatedAsBribe && integrity ? -rand(5, 15) : Math.max(2, Math.round(delta * 0.6));
    newFavor = adjustFavor(to, from.i, romanceDelta);
  }
  return {
    delta: clampRelation(delta),
    newSolidarity,
    newFavor,
    matchScore,
    treatedAsBribe
  };
}
