/**
 * Character backstory profile: origin, commitment, tastes, favor, and gifts.
 * Spec: docs/plan/characters/backstory-profile.md
 */
import { isBoundServitorRaceKey } from "../../data/raceBoundServitors";
import { getRaceById } from "../../data/races";
import { P, rand } from "../hostUtils";
import { attractiveness, isSameRace } from "./appearance";
import {
  getWorldContext,
  hasCharactersContext,
  resolveCultureTypeForLoadout,
  resolveLoadoutGoodsCatalog
} from "./charactersContext";
import type {
  Character,
  CharacterBackstory,
  CharacterCommitment,
  CharacterOrigin,
  CharacterRole,
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
import {
  applyFormCommitmentBoost,
  applyFormRaisedInMultiplier,
  applyFormStratumMultiplier,
  expectsClericalCelibacy,
  getFormPack,
  isSlaveryCommonForm
} from "./cultureFormPacks";
import { seedCharacterLoadout } from "./loadoutSeed";
import { applyBackgroundSkillBias, syncCk3AbilityProfileSkills } from "./skillGeneration";

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
/** Field command and war leadership — includes Marshal / General (not only "Commander"). */
const MARTIAL_COMMAND_TITLE_RE = /^(Commander|Admiral|Marshal|General|Warlord)$/i;
const SPYMASTER_TITLE_RE = /spymaster|spy\b|intelligence|secretar.*state|whisper/i;

export function isSpymasterTitle(title: string): boolean {
  return SPYMASTER_TITLE_RE.test(title);
}

export function isMartialCommandTitle(title: string): boolean {
  return MARTIAL_COMMAND_TITLE_RE.test(title);
}

export function characterHasSpymasterOffice(character: Character): boolean {
  return character.titles.some(t => isSpymasterTitle(t.title));
}

function characterRaceKey(character: Character | undefined): string | undefined {
  if (!character || !hasCharactersContext()) return undefined;
  try {
    return getRaceById(getWorldContext().pack.races, character.race)?.key;
  } catch {
    return undefined;
  }
}

export function inferRoleClass(character: Character): CharacterRoleClass {
  const roles = character.roles ?? [];
  if (roles.some(r => /market|merchant|guild|company/i.test(r.kind) || /merchant|guild/i.test(r.source))) {
    return "merchant";
  }

  for (const title of character.titles) {
    if (title.entityType === "province" && title.landed) return "province_lord";
    // Marshal / Admiral / field generals are military careers, not generic court officers.
    if (isMartialCommandTitle(title.title)) return "commander";
    if (RELIGIOUS_TITLE_RE.test(title.title)) return "religious";
    if (title.landed && title.entityType === "state") return "ruler";
  }

  if (character.titles.some(t => t.entityType === "state" && !t.landed)) return "central_officer";
  return "ordinary";
}

function isNobleStratum(stratum?: SocialStratum): boolean {
  return stratum === "royal" || stratum === "high_noble" || stratum === "minor_noble" || stratum === "gentry";
}

function isLowBirthStratum(stratum?: SocialStratum): boolean {
  return stratum === "commoner" || stratum === "freedman" || stratum === "slave_born" || stratum === "unknown";
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
      // Usurpers / elected heads are still reigning; blood claim is socialStratum's job.
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
      // Birth can leave ordinary people unfree even without a high office.
      if (stratum === "slave_born") return "slave";
      if (stratum === "freedman") return "freeman";
      return "freeman";
  }
}

function stratumWeights(
  roleClass: CharacterRoleClass,
  formName?: string,
  character?: Character
): Partial<Record<SocialStratum, number>> {
  const pack = getFormPack(formName);
  let weights: Partial<Record<SocialStratum, number>>;

  // Bound thralls (wyrmkin under dragons): slave/freedman stock, not free merchant dynasties.
  const raceKey = characterRaceKey(character);
  if (isBoundServitorRaceKey(raceKey)) {
    if (roleClass === "merchant") {
      weights = { slave_born: 45, freedman: 30, commoner: 15, merchant_born: 10 };
    } else {
      weights = { slave_born: 40, freedman: 35, commoner: 25 };
    }
  } else if (character && characterHasSpymasterOffice(character) && roleClass === "central_officer") {
    // Spymasters: deliberately blurred origins (spec §3.3) — not the high-noble court table.
    weights = { minor_noble: 30, gentry: 30, commoner: 25, foreigner: 10, unknown: 5 };
  } else {
    switch (roleClass) {
      case "ruler":
        // Form packs may replace the feudal "blood royal" prior (republic / theocracy / horde).
        weights = pack.rulerStratumWeights
          ? { ...pack.rulerStratumWeights }
          : { royal: 70, high_noble: 25, unknown: 5 };
        break;
      case "central_officer":
        // Medieval Western courts lean noble; empires later inject freedman/slave paths via form mult.
        weights = { high_noble: 35, minor_noble: 28, gentry: 22, commoner: 12, foreigner: 3 };
        break;
      case "commander":
        // Blend field captains (commoner rise) with aristocratic marshals (high_noble).
        weights = {
          high_noble: 18,
          minor_noble: 32,
          gentry: 18,
          commoner: 22,
          freedman: 5,
          foreigner: 5
        };
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
  }

  applyFormStratumMultiplier(weights, formName);

  // Slavery-common forms: open rare slave_born / freedman slots on power careers.
  if (isSlaveryCommonForm(formName)) {
    if (roleClass === "commander" || roleClass === "central_officer") {
      weights.slave_born = (weights.slave_born ?? 0) + 6;
      weights.freedman = (weights.freedman ?? 0) + 8;
    }
    if (roleClass === "ordinary") {
      weights.slave_born = (weights.slave_born ?? 0) + 4;
      weights.freedman = (weights.freedman ?? 0) + 6;
    }
  }

  return weights;
}

function raisedInFor(
  roleClass: CharacterRoleClass,
  stratum: SocialStratum,
  hasCapital: boolean,
  formName?: string
): RaisedIn {
  let weights: Partial<Record<RaisedIn, number>>;

  if (roleClass === "religious" || stratum === "clergy_orphan") {
    weights = {
      monastery: 55,
      capital_city: hasCapital ? 25 : 0,
      provincial_seat: 20
    };
  } else if (roleClass === "merchant") {
    weights = {
      merchant_quarter: 55,
      capital_city: hasCapital ? 25 : 10,
      provincial_seat: 20
    };
  } else if (roleClass === "commander") {
    // High-born marshals more often raised at court; low-born at camp/frontier.
    if (stratum === "high_noble" || stratum === "royal") {
      weights = {
        capital_court: 30,
        provincial_seat: 25,
        military_camp: 25,
        frontier_burg: 20
      };
    } else {
      weights = {
        military_camp: 35,
        frontier_burg: 30,
        provincial_seat: 20,
        capital_city: 15
      };
    }
  } else if (roleClass === "ruler") {
    weights = hasCapital
      ? { capital_court: 70, provincial_seat: 15, military_camp: 10, capital_city: 5 }
      : { provincial_seat: 50, military_camp: 30, rural_manor: 20 };
  } else if (roleClass === "central_officer") {
    weights = {
      capital_court: 40,
      capital_city: 30,
      provincial_seat: 18,
      foreign_court: 7,
      monastery: 5
    };
  } else if (roleClass === "province_lord") {
    weights = {
      provincial_seat: 45,
      rural_manor: 28,
      frontier_burg: 15,
      capital_court: 12
    };
  } else if (stratum === "slave_born" || stratum === "freedman") {
    weights = {
      street: 25,
      military_camp: 20,
      rural_manor: 20,
      provincial_seat: 15,
      merchant_quarter: 10,
      frontier_burg: 10
    };
  } else {
    weights = {
      capital_city: 15,
      provincial_seat: 25,
      rural_manor: 25,
      merchant_quarter: 15,
      street: 10,
      frontier_burg: 10
    };
  }

  applyFormRaisedInMultiplier(weights, formName);
  return pickWeighted(weights);
}

// ---------------------------------------------------------------------------
// Commitment
// ---------------------------------------------------------------------------

function commitmentWeights(
  roleClass: CharacterRoleClass,
  formName?: string,
  character?: Character
): Partial<Record<CommitmentKind, number>> {
  const base: Partial<Record<CommitmentKind, number>> = (() => {
    // Spymasters: personal loyalty, office secrecy, self-preservation (spec §4.5).
    if (character && characterHasSpymasterOffice(character) && roleClass === "central_officer") {
      return { liege: 25, office: 20, self: 20, state: 15, wealth: 10, house: 10 };
    }
    switch (roleClass) {
      case "ruler":
        return { state: 30, house: 25, domain: 15, faith: 10, self: 10, ideology: 5, people: 5 };
      case "central_officer":
        return { house: 35, liege: 20, office: 15, state: 10, wealth: 10, self: 10 };
      case "province_lord":
        return { domain: 30, house: 30, family: 15, state: 10, liege: 10, wealth: 5 };
      case "commander":
        // Marshals lean state/office slightly more than camp captains (craft/comrades).
        return { comrades: 22, liege: 18, craft: 14, state: 18, office: 8, self: 8, house: 8, wealth: 4 };
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

/**
 * Birth vs office gap: commoners elevated to power chase self/wealth/office more than house glory.
 * Freedmen / slave-born retain family & patron loyalty (spec §4.5).
 */
function applyStratumToCommitmentWeights(
  weights: Partial<Record<CommitmentKind, number>>,
  stratum: SocialStratum | undefined,
  roleClass: CharacterRoleClass
): Partial<Record<CommitmentKind, number>> {
  const w = { ...weights };
  if (!stratum) return w;

  const elevatedOffice =
    roleClass === "central_officer" ||
    roleClass === "commander" ||
    roleClass === "province_lord" ||
    roleClass === "ruler";

  if (isLowBirthStratum(stratum) && elevatedOffice) {
    w.self = (w.self ?? 0) + 20;
    w.wealth = (w.wealth ?? 0) + 15;
    w.office = (w.office ?? 0) + 12;
    w.house = Math.max(0, (w.house ?? 0) - 12);
  }
  if (stratum === "freedman" || stratum === "slave_born") {
    w.family = (w.family ?? 0) + 18;
    w.patron = (w.patron ?? 0) + 22;
    w.self = (w.self ?? 0) + 12;
    w.state = Math.max(0, (w.state ?? 0) - 5);
  }
  if (stratum === "merchant_born" && roleClass !== "merchant") {
    w.wealth = (w.wealth ?? 0) + 10;
    w.craft = (w.craft ?? 0) + 8;
  }
  return w;
}

function applyPersonalityToCommitmentWeights(
  weights: Partial<Record<CommitmentKind, number>>,
  character: Character,
  roleClass: CharacterRoleClass,
  stratum?: SocialStratum
): Partial<Record<CommitmentKind, number>> {
  const p = character.personality;
  const w = { ...weights };
  if (p.piety >= 80 && p.zeal >= 70) w.faith = (w.faith ?? 0) + 40;
  if (p.greed >= 80 && p.honor <= 40) {
    w.wealth = (w.wealth ?? 0) + 30;
    w.self = (w.self ?? 0) + 20;
    // Territorial greed among landholders (domain hunger).
    if (roleClass === "province_lord" || roleClass === "ruler") {
      w.domain = (w.domain ?? 0) + 15;
    }
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
  // Pleasure-first lives: reachable hedonism axis (was a dead CommitmentKind).
  if (p.piety <= 35 && p.energy >= 65 && p.honor <= 55 && (p.sociability >= 60 || p.boldness >= 65)) {
    w.hedonism = (w.hedonism ?? 0) + 28;
  }
  if (p.honor >= 85) {
    w.house = (w.house ?? 0) + 15;
    // Personal fealty is a noble / subject-of-lord pattern; low-birth freemen less so.
    if (roleClass !== "ruler") {
      if (isNobleStratum(stratum) || roleClass === "commander" || roleClass === "central_officer") {
        w.liege = (w.liege ?? 0) + 15;
      } else {
        w.family = (w.family ?? 0) + 10;
        w.house = (w.house ?? 0) + 5;
      }
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

function buildCommitment(
  character: Character,
  roleClass: CharacterRoleClass,
  formName?: string,
  stratum?: SocialStratum
): CharacterCommitment {
  let weights = commitmentWeights(roleClass, formName, character);
  weights = applyStratumToCommitmentWeights(weights, stratum, roleClass);
  weights = applyPersonalityToCommitmentWeights(weights, character, roleClass, stratum);
  const primaryKind = pickWeighted(weights);
  const secondaryWeights = { ...weights };
  delete secondaryWeights[primaryKind];
  // High vengefulness: force rivalry as secondary candidate when not primary (spec §4.6).
  let secondaryKind: CommitmentKind | undefined;
  if (
    character.personality.vengefulness >= 85 &&
    primaryKind !== "rivalry" &&
    (secondaryWeights.rivalry ?? 0) > 0 &&
    P(0.7)
  ) {
    secondaryKind = "rivalry";
  } else {
    secondaryKind = Object.keys(secondaryWeights).length > 0 ? pickWeighted(secondaryWeights) : undefined;
  }

  const primary: CommitmentFocus = {
    kind: primaryKind,
    weight: 100,
    label: primaryKind === "state" ? `State ${character.state}` : undefined
  };
  // state → stateId; liege is a person and must not reuse stateId as a fake suzerain.
  if (primaryKind === "state") {
    primary.targetId = character.state;
  }

  let secondary: CommitmentFocus | undefined;
  if (secondaryKind && (secondaryKind === "rivalry" || P(0.75))) {
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
  "correspondence",
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

/**
 * Good names preferred by each taste id (for gift matching).
 * Jewelry stays under luxury/gold (not art) so bribes of jewels don't double-count as fine art.
 * Ceramics/Glass cover pottery and glassware as objets d'art under `art`.
 */
export const TASTE_GOOD_MATCH: Readonly<Record<string, readonly string[]>> = {
  wine: ["Wine", "Liquor", "Beer"],
  feast: ["Spices", "Wine", "Cheese", "Honey"],
  salon: ["Honey", "Spices", "Perfume", "Silk", "Cheese"],
  luxury: ["Silk", "Jewelry", "Perfume", "Garments"],
  art: ["Artworks", "Sculptures", "Tapestries", "Marble", "Ivory", "Ceramics", "Glass"],
  music: ["Instruments"],
  books: ["Books", "Paper", "Ink"],
  correspondence: ["Paper", "Ink", "Books"],
  gold: ["Coins", "Gold Ingot", "Jewelry"],
  gambling: ["Coins"],
  theology: ["Incense", "Candles", "Relics"],
  piety_practice: ["Incense", "Candles", "Relics"],
  hunting: ["Horses", "Furs", "Arms"],
  lust: ["Perfume", "Silk", "Wine"],
  ceremony: ["Incense", "Silk", "Jewelry"],
  gossip: ["Perfume", "Wine", "Silk"]
};

/**
 * Street / commoner leisure culture (tavern). Foreigners are *not* included —
 * origin abroad is not a class; use raisedIn=street instead.
 */
function isPopularVicesStratum(stratum?: SocialStratum): boolean {
  return stratum === "commoner" || stratum === "freedman" || stratum === "slave_born";
}

/**
 * Gender × rank multipliers for popular vices (historically flavoured priors).
 *
 * - Wine: both ranks drink; elite feast culture keeps wine high upstream.
 * - Lust: double standard exists, but elite male mistress culture stays substantial;
 *   women are damped, not erased.
 * - Gambling: ruinous high-stakes play is an *elite* pattern; commoners play more
 *   often at low stakes (lower intensity in the vice path).
 */
function popularViceMultipliers(
  gender: Character["gender"],
  stratum: SocialStratum | undefined
): { wine: number; lust: number; gambling: number } {
  const female = gender === "female";

  if (isPopularVicesStratum(stratum)) {
    return female ? { wine: 0.7, lust: 0.45, gambling: 0.4 } : { wine: 1.15, lust: 1.05, gambling: 0.85 };
  }
  if (stratum === "merchant_born" || stratum === "gentry") {
    return female ? { wine: 0.65, lust: 0.4, gambling: 0.45 } : { wine: 1.05, lust: 0.95, gambling: 1.0 };
  }
  if (stratum === "minor_noble") {
    return female ? { wine: 0.6, lust: 0.38, gambling: 0.5 } : { wine: 1.05, lust: 1.0, gambling: 1.05 };
  }
  if (stratum === "high_noble") {
    return female ? { wine: 0.55, lust: 0.35, gambling: 0.55 } : { wine: 1.0, lust: 0.95, gambling: 1.1 };
  }
  if (stratum === "royal") {
    return female ? { wine: 0.5, lust: 0.32, gambling: 0.45 } : { wine: 0.95, lust: 0.9, gambling: 0.95 };
  }
  // foreigner / clergy_orphan / unknown: moderate, not automatic street culture
  return female ? { wine: 0.55, lust: 0.35, gambling: 0.4 } : { wine: 0.9, lust: 0.85, gambling: 0.85 };
}

function tryViceLike(
  likes: CharacterTaste[],
  dislikes: CharacterTaste[],
  id: "wine" | "lust" | "gambling",
  baseChance: number,
  mult: number,
  intensityLo: number,
  intensityHi: number
): void {
  const chance = Math.min(0.92, Math.max(0, baseChance * mult));
  if (chance > 0 && P(chance)) {
    pushTaste(likes, dislikes, id, "like", rand(intensityLo, intensityHi));
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
 * Married households only count when the form pack expects Latin-style clerical celibacy;
 * Orthodox / Islamic / horde religious offices must not treat marriage as hypocrisy.
 */
export function isWorldlyClericProfile(
  character: Character,
  roleClass: CharacterRoleClass,
  formName?: string
): boolean {
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
  // Celibacy cultures only: large clerical household as worldliness signal
  const worldlyHousehold =
    expectsClericalCelibacy(formName) &&
    (character.family?.spouses ?? 0) >= 1 &&
    ((character.family?.children ?? 0) >= 3 || p.greed >= 65);
  return hollowPiety || greedyOffice || spitefulGreed || recklessAppetites || worldlyHousehold;
}

/**
 * Push a taste only if the id is not already liked or disliked (spec §5.1).
 * Also blocks feast↔company opposite polarities (food culture vs socializing —
 * opposite signs read as nonsense when labels share banquet connotations).
 */
function pushTaste(
  likes: CharacterTaste[],
  dislikes: CharacterTaste[],
  id: string,
  polarity: TastePolarity,
  intensity: number
): void {
  if (likes.some(t => t.id === id) || dislikes.some(t => t.id === id)) return;
  if (feastCompanyConflict(likes, dislikes, id, polarity)) return;
  const list = polarity === "like" ? likes : dislikes;
  list.push({ id, polarity, intensity: Math.max(1, Math.min(100, Math.round(intensity))) });
}

/**
 * feast = cuisine / fine dining; company = people / socializing.
 * Both as likes or both as dislikes is fine; opposite polarities are not.
 */
function feastCompanyConflict(
  likes: CharacterTaste[],
  dislikes: CharacterTaste[],
  id: string,
  polarity: TastePolarity
): boolean {
  if (id === "feast") {
    if (polarity === "like" && dislikes.some(t => t.id === "company")) return true;
    if (polarity === "dislike" && likes.some(t => t.id === "company")) return true;
  }
  if (id === "company") {
    if (polarity === "like" && dislikes.some(t => t.id === "feast")) return true;
    if (polarity === "dislike" && likes.some(t => t.id === "feast")) return true;
  }
  return false;
}

/** Safety net if older paths left opposite feast/company polarities. */
function resolveFeastCompanyConflict(likes: CharacterTaste[], dislikes: CharacterTaste[]): void {
  const drop = (list: CharacterTaste[], tasteId: string) => {
    const i = list.findIndex(t => t.id === tasteId);
    if (i >= 0) list.splice(i, 1);
  };
  const feastLike = likes.find(t => t.id === "feast");
  const feastDis = dislikes.find(t => t.id === "feast");
  const companyLike = likes.find(t => t.id === "company");
  const companyDis = dislikes.find(t => t.id === "company");
  if (feastLike && companyDis) {
    if (feastLike.intensity >= companyDis.intensity) drop(dislikes, "company");
    else drop(likes, "feast");
  }
  if (companyLike && feastDis) {
    if (companyLike.intensity >= feastDis.intensity) drop(dislikes, "feast");
    else drop(likes, "company");
  }
}

function buildTastes(
  character: Character,
  roleClass: CharacterRoleClass,
  commitment?: CharacterCommitment,
  origin?: CharacterOrigin,
  formName?: string
): CharacterTaste[] {
  const p = character.personality;
  const s = character.skills;
  const stratum = origin?.socialStratum;
  const raisedIn = origin?.raisedIn;
  const likes: CharacterTaste[] = [];
  const dislikes: CharacterTaste[] = [];
  // foreigner/unknown are not automatic tavern culture; street raisedIn still is.
  const popularVices = isPopularVicesStratum(stratum) || raisedIn === "street";
  const merchantBorn = stratum === "merchant_born";
  const female = character.gender === "female";
  const viceMul = popularViceMultipliers(character.gender, stratum);
  const gambleMul = viceMul.gambling * gamblingPersonalityMult(p, s);
  const streetBoost = raisedIn === "street" ? 1.15 : 1;
  const worldlyCleric = isWorldlyClericProfile(character, roleClass, formName);
  const sincereCleric = roleClass === "religious" && !worldlyCleric && p.piety >= 60 && p.zeal >= 55;
  const gamblingAverse = p.rationality >= 75 && p.boldness <= 35 && p.energy <= 40;
  const formPackId = getFormPack(formName).id;
  const like = (id: string, intensity: number) => pushTaste(likes, dislikes, id, "like", intensity);
  const dislike = (id: string, intensity: number) => pushTaste(likes, dislikes, id, "dislike", intensity);
  const vice = (id: "wine" | "lust" | "gambling", baseChance: number, mult: number, lo: number, hi: number) => {
    // Calculators with no appetite for variance never "like" dice (even tiny mult rolls).
    if (id === "gambling" && gamblingAverse) return;
    tryViceLike(likes, dislikes, id, baseChance, mult, lo, hi);
  };

  // Social style: men lean tavern company / banquets; women lean gossip / salon
  if (p.sociability >= 75) {
    if (female) {
      like("gossip", rand(60, 95));
      if (P(0.75)) like("salon", rand(55, 92));
      if (P(0.3)) like("company", rand(45, 80));
      if (P(0.18)) like("feast", rand(40, 75));
      if (P(0.4)) like("music", rand(45, 85));
      vice("wine", 0.28, viceMul.wine, 40, 75);
    } else {
      like("company", rand(60, 95));
      vice("wine", 0.5, viceMul.wine, 50, 90);
      if (P(0.45)) like("feast", rand(50, 90));
      if (P(0.25)) like("gossip", rand(40, 75));
    }
    dislike("solitude", rand(40, 80));
  } else if (p.sociability >= 55 && female) {
    if (P(0.55)) like("gossip", rand(50, 88));
    if (P(0.4)) like("salon", rand(45, 85));
  } else if (p.sociability <= 25) {
    like("solitude", rand(60, 95));
    if (P(0.5)) like("books", rand(50, 90));
    dislike(female && P(0.55) ? "salon" : "company", rand(50, 90));
  }

  // Gossip: women and high-intrigue characters (courtiers, spies)
  if (!likes.some(t => t.id === "gossip")) {
    const gossipChance =
      (female ? 0.22 : 0.06) +
      (p.sociability >= 60 ? 0.12 : 0) +
      (s.intrigue >= 70 ? 0.35 : s.intrigue >= 55 ? 0.15 : 0) +
      (roleClass === "central_officer" || characterHasSpymasterOffice(character) ? 0.12 : 0);
    if (P(Math.min(0.75, gossipChance))) {
      like("gossip", rand(45, 90));
    }
  }

  if (p.greed >= 75) {
    like("gold", rand(70, 100));
    if (P(0.5)) like("luxury", rand(50, 90));
    if (p.rationality >= 70 || skillsLikeSteward(s)) {
      if (P(0.45)) like("land", rand(50, 90));
    }
    // Elite high-stakes gambling intensity when risk appetite exists
    const gLo = isNobleStratum(stratum) ? 55 : 40;
    const gHi = isNobleStratum(stratum) ? 95 : 80;
    vice("gambling", worldlyCleric ? 0.55 : 0.35, gambleMul, gLo, gHi);
  }
  if (p.piety >= 75) {
    if (P(worldlyCleric ? 0.55 : formPackId === "theocracy" ? 0.95 : 0.9)) {
      like("ceremony", rand(50, 90));
    }
    if (sincereCleric || (!worldlyCleric && P(0.85))) {
      like("theology", rand(60, 95));
    } else if (worldlyCleric && P(0.4)) {
      like("theology", rand(40, 75));
    }
    if (!worldlyCleric) {
      if (P(0.5)) dislike("lust", rand(40, 80));
      if (P(0.45)) dislike("gambling", rand(40, 80));
      if (P(0.4)) dislike("corruption", rand(50, 90));
    }
  } else if (p.piety <= 25) {
    vice("wine", 0.5, viceMul.wine, 50, 90);
    if (P(0.3)) like("gold", rand(50, 85));
  }

  // Worldly / broken-precept clergy
  if (worldlyCleric) {
    if (P(0.7)) like("ceremony", rand(45, 85));
    if (P(0.35)) like("flattery", rand(45, 85));
    vice("wine", 0.7, viceMul.wine * 1.05, 55, 95);
    vice("lust", 0.55, viceMul.lust * 1.05, 50, 92);
    vice("gambling", 0.5, gambleMul * 1.1, 50, 92);
    if (p.greed >= 70 && P(0.65)) like("gold", rand(70, 100));
    if (p.greed >= 70 && P(0.45)) like("luxury", rand(55, 92));
    if (P(0.4)) dislike("piety_practice", rand(40, 75));
    if (p.vengefulness >= 70 && P(0.35)) dislike("mercy", rand(40, 70));
  }

  // Corruption / open palm
  {
    const hasCorr = likes.some(t => t.id === "corruption") || dislikes.some(t => t.id === "corruption");
    if (!hasCorr) {
      const corrChance = corruptionLikeChance(character, roleClass, commitment, worldlyCleric);
      if (corrChance > 0 && P(corrChance)) {
        like("corruption", rand(50, 95));
      } else if (p.honor >= 70 && P(0.35 + (p.honor - 70) / 120)) {
        dislike("corruption", rand(50, 90));
      }
    }
  }

  // Ceremony: parade & court pageant vs camp disdain
  {
    const parade = ceremonyParadeScore(character, roleClass, stratum, raisedIn);
    let likeScore = parade.like;
    let dislikeScore = parade.dislike;
    if (formPackId === "theocracy") likeScore += 0.2;
    if (formPackId === "horde") dislikeScore += 0.1;
    if (!likes.some(t => t.id === "ceremony") && !dislikes.some(t => t.id === "ceremony")) {
      if (likeScore >= 0.4 && likeScore >= dislikeScore && P(Math.min(0.85, likeScore))) {
        like("ceremony", rand(50, 95));
      } else if (dislikeScore >= 0.35 && P(Math.min(0.8, dislikeScore))) {
        dislike("ceremony", rand(45, 88));
      }
    }
  }

  // --- Popular vices: wine / lust / gambling (historically flavoured rank gradient) ---
  // Commoners: frequent low-stakes leisure. Elites: feast, mistress culture, high-stakes play.
  // Worldly clerics use the dedicated block above; sincere clergy skip tavern path.
  if (roleClass !== "religious" && p.piety < 80) {
    const pietyDamp = Math.max(0.55, 1 - p.piety / 200);

    if (popularVices) {
      vice("wine", 0.78 * pietyDamp * streetBoost, viceMul.wine, 50, 90);
      vice("lust", 0.55 * pietyDamp * streetBoost, viceMul.lust, 45, 88);
      // Low-stakes dice: slightly lower intensity than elite ruin
      vice("gambling", 0.5 * pietyDamp * streetBoost, gambleMul, 35, 75);
    } else if (merchantBorn) {
      vice("wine", 0.55 * pietyDamp, viceMul.wine, 50, 90);
      vice("gambling", 0.48 * pietyDamp, gambleMul, 45, 90);
      if (p.piety < 65) vice("lust", 0.35 * pietyDamp, viceMul.lust, 45, 85);
    } else if (stratum === "gentry" || stratum === "minor_noble") {
      vice("wine", 0.55 * pietyDamp, viceMul.wine, 50, 92);
      if (p.piety < 65) vice("lust", 0.42 * pietyDamp, viceMul.lust, 45, 90);
      if (p.piety < 60) vice("gambling", 0.45 * pietyDamp, gambleMul, 50, 92);
    } else if (stratum === "high_noble" || stratum === "royal") {
      // Court feast / high-stakes gaming — not ascetic by default
      vice("wine", 0.52 * pietyDamp, viceMul.wine, 50, 95);
      if (p.piety < 65) vice("lust", 0.4 * pietyDamp, viceMul.lust, 45, 92);
      if (p.piety < 60 || p.greed >= 60) vice("gambling", 0.48 * pietyDamp, gambleMul, 55, 98);
    }
  }

  // Extra lust path for secular / social / high-energy people
  if (p.piety < 70 && !likes.some(t => t.id === "lust") && !dislikes.some(t => t.id === "lust")) {
    const lustChance =
      ((p.piety <= 30 ? 0.28 : 0) +
        (p.sociability >= 65 ? 0.16 : 0) +
        (p.energy >= 65 ? 0.1 : 0) +
        (p.boldness >= 70 ? 0.08 : 0) +
        (character.appearance >= 70 ? 0.08 : 0) +
        (popularVices ? 0.12 : 0) +
        (isNobleStratum(stratum) && !female ? 0.08 : 0)) *
      viceMul.lust;
    if (P(Math.min(0.7, lustChance))) {
      like("lust", rand(45, 92));
    }
  }
  if (commitment?.primary.kind === "hedonism" || commitment?.secondary?.kind === "hedonism") {
    if (p.piety < 75) {
      vice("lust", 0.85, viceMul.lust, 55, 95);
      vice("wine", 0.65, viceMul.wine, 50, 90);
      vice("gambling", 0.55, gambleMul, 50, 90);
    }
  }

  if (s.martial >= 75 || roleClass === "commander") {
    like("sport", rand(50, 90));
    if (P(0.5)) like("hunting", rand(50, 90));
    if (P(0.4)) like("soldiers", rand(50, 90));
    if (p.piety < 65) vice("wine", 0.45, viceMul.wine, 45, 85);
    if (p.piety < 60) vice("gambling", 0.4, gambleMul, 45, 85);
    if (
      (character.prestige ?? 50) < 45 &&
      !likes.some(t => t.id === "ceremony") &&
      !dislikes.some(t => t.id === "ceremony") &&
      P(0.55)
    ) {
      dislike("ceremony", rand(50, 88));
    }
  }
  if (s.intrigue >= 75 || characterHasSpymasterOffice(character)) {
    if (P(0.55) && !likes.some(t => t.id === "gossip")) {
      like("gossip", rand(55, 92));
    }
    if (P(0.4)) like("flattery", rand(45, 85));
  }
  if (s.artistry >= 75) {
    like("art", rand(70, 100));
    if (P(0.4)) like("music", rand(50, 90));
  }
  if (s.learning >= 75) {
    like("books", rand(60, 95));
    // Literacy can seed epistolary taste; office (steward/spymaster) does not —
    // handling letters as duty is not the same as liking correspondence.
    if (P(0.4)) like("correspondence", rand(50, 90));
  } else if (s.learning >= 55 && p.sociability >= 40 && p.sociability <= 80 && P(0.22)) {
    // Literate mid-sociability: personal letter culture, not tavern company
    like("correspondence", rand(45, 85));
  }
  if (!likes.some(t => t.id === "correspondence") && female && isNobleStratum(stratum) && s.learning >= 40 && P(0.3)) {
    like("correspondence", rand(45, 88));
  }
  if (
    !likes.some(t => t.id === "correspondence") &&
    likes.some(t => t.id === "books") &&
    likes.some(t => t.id === "solitude") &&
    P(0.4)
  ) {
    like("correspondence", rand(45, 85));
  }
  if (p.compassion >= 75) {
    like("mercy", rand(60, 95));
    dislike("cruelty", rand(50, 90));
  } else if (p.compassion <= 25 && P(0.25)) {
    like("cruelty", rand(40, 80));
  }

  // RaisedIn flavour (spec §5.3)
  if (raisedIn === "frontier_burg" || raisedIn === "military_camp") {
    if (P(0.35)) like("hunting", rand(45, 85));
    if (P(0.25)) like("soldiers", rand(45, 85));
    if (P(0.2)) dislike("courtiers", rand(40, 75));
  }
  if (raisedIn === "capital_court") {
    if (P(0.3)) like("flattery", rand(45, 85));
    if (P(0.25)) like("luxury", rand(45, 85));
    if (P(0.2)) like("art", rand(40, 80));
  }

  if (roleClass === "merchant") {
    like("gold", rand(70, 100));
    if (P(0.4)) like("merchants", rand(50, 85));
    // Armed traders / high martial are less likely to despise soldiers
    if (s.martial < 55 && P(0.25)) dislike("soldiers", rand(40, 75));
    vice("wine", 0.42, viceMul.wine, 45, 85);
    vice("gambling", 0.4, gambleMul, 45, 90);
  }
  if (roleClass === "religious" && sincereCleric) {
    like("theology", rand(70, 100));
    like("ceremony", rand(50, 90));
    if (P(0.55)) dislike("lust", rand(45, 85));
    if (P(0.5)) dislike("gambling", rand(45, 85));
    if (P(0.4)) dislike("corruption", rand(45, 85));
  }
  // Pure civilian central officers (not spy / martial) may dislike war
  if (roleClass === "central_officer" && s.martial < 40 && !characterHasSpymasterOffice(character) && P(0.35)) {
    dislike("war", rand(40, 80));
  }

  // Devout high nobility: public piety may reject dice/lust — only if not already liked
  if (!worldlyCleric && (stratum === "royal" || stratum === "high_noble") && p.piety >= 70 && P(0.35)) {
    if (!likes.some(t => t.id === "lust") && P(female ? 0.5 : 0.3)) {
      dislike("lust", rand(35, 70));
    }
    if (!likes.some(t => t.id === "gambling") && P(female ? 0.45 : 0.3)) {
      dislike("gambling", rand(35, 75));
    }
  }

  if (gamblingAverse && !likes.some(t => t.id === "gambling") && P(0.7)) {
    dislike("gambling", rand(45, 85));
  }

  // --- Integrity guards (spec §8.2 G3 / G4) ---
  if (roleClass === "merchant" && !likes.some(t => t.id === "gold") && !likes.some(t => t.id === "craft")) {
    if (P(0.55)) like("gold", rand(60, 90));
    else like("machinery", rand(50, 85)); // craft-adjacent when gold not forced
  }
  // G4: extreme sociability should not permanently dislike company/salon without dampening
  if (p.sociability >= 90) {
    const socialDislike = dislikes.find(t => t.id === "company" || t.id === "salon");
    if (socialDislike && socialDislike.intensity > 40) {
      socialDislike.intensity = Math.max(25, socialDislike.intensity - 25);
    }
  }

  // Pad to 2–4 likes and 1–3 dislikes
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
  const femalePadPool = (["gossip", "salon", "music", "luxury", "art", "correspondence"] as const).filter(
    id => !likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)
  );
  // Role-conditioned pad pools reduce pure catalog noise
  const rolePadPool: string[] = [];
  if (roleClass === "commander") rolePadPool.push("sport", "hunting", "soldiers", "wine");
  if (roleClass === "merchant") rolePadPool.push("gold", "luxury", "merchants", "wine");
  if (roleClass === "religious") rolePadPool.push("theology", "ceremony", "books");
  if (roleClass === "ruler" || roleClass === "province_lord")
    rolePadPool.push("land", "titles_glory", "ceremony", "hunting");
  // No correspondence in role pads: letter duty ≠ epistolary taste (steward/spy included).
  if (roleClass === "central_officer") rolePadPool.push("books", "law", "ceremony");
  if (formPackId === "theocracy") rolePadPool.push("theology", "ceremony", "piety_practice");
  const filteredRolePad = rolePadPool.filter(id => !likes.some(t => t.id === id) && !dislikes.some(t => t.id === id));

  while (likes.length < 2) {
    let id: string | null = null;
    if (female && femalePadPool.length && P(0.55)) {
      id = femalePadPool[rand(0, femalePadPool.length - 1)]!;
    } else if (filteredRolePad.length && P(0.45)) {
      id = filteredRolePad[rand(0, filteredRolePad.length - 1)]!;
    } else if ((popularVices || worldlyCleric) && P(worldlyCleric ? 0.75 : 0.55)) {
      id = weightedPadPick();
    }
    if (!id) id = TASTE_CATALOG[rand(0, TASTE_CATALOG.length - 1)]!;
    if (id === "lust" && !canPadLustLike) continue;
    if (id === "gambling" && !canPadGamblingLike) continue;
    if (female && (id === "feast" || id === "company") && P(0.55)) continue;
    if (feastCompanyConflict(likes, dislikes, id, "like")) continue;
    if (
      (worldlyCleric || likes.some(t => t.id === "corruption")) &&
      id === "theology" &&
      likes.some(t => t.id === "gold") &&
      P(0.5)
    ) {
      id = P(0.5) ? "gold" : "luxury";
    }
    if (!likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)) {
      like(id, rand(40, 75));
    } else break;
  }
  while (dislikes.length < 1) {
    const id = TASTE_CATALOG[rand(0, TASTE_CATALOG.length - 1)]!;
    if (id === "lust" && !canPadLustDislike) continue;
    if (id === "gambling" && !canPadGamblingDislike) continue;
    if (feastCompanyConflict(likes, dislikes, id, "dislike")) continue;
    if (
      (popularVices || worldlyCleric || likes.some(t => t.id === "corruption")) &&
      (id === "wine" || id === "lust" || id === "gambling" || id === "corruption" || id === "gold") &&
      (worldlyCleric || likes.some(t => t.id === "corruption") || (!female && p.piety < 60))
    ) {
      continue;
    }
    if (!likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)) {
      dislike(id, rand(40, 75));
    } else break;
  }

  resolveFeastCompanyConflict(likes, dislikes);

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
  const stratum = pickWeighted(stratumWeights(roleClass, options.formName, character));
  const estateStatus = estateForRole(roleClass, stratum);
  const hasCapital = capital !== undefined && capital > 0;
  const packId = getFormPack(options.formName).id;

  let birthBurgId = options.birthBurgId;
  let homeBurgId = options.homeBurgId;

  if (roleClass === "ruler" && hasCapital) {
    // Dynastic capitals: high continuity; republics / hordes less "always capital birth".
    const capitalBirthP = packId === "republic" ? 0.45 : packId === "horde" ? 0.35 : 0.8;
    birthBurgId ??= P(capitalBirthP) ? capital : (location ?? capital);
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

  const raisedIn = raisedInFor(roleClass, stratum, hasCapital, options.formName);
  const birthStateId = character.birthStateId ?? character.state;

  // Rulers of non-royal strata (doges, elective heads) are office-holders, not dynastic claimants by default.
  const isDynasticClaimant =
    stratum === "royal" ||
    (roleClass === "ruler" && (stratum === "high_noble" || packId === "monarchy" || packId === "horde"));

  return {
    socialStratum: stratum,
    estateStatus,
    birthBurgId: birthBurgId && birthBurgId > 0 ? birthBurgId : undefined,
    birthStateId,
    homeBurgId: homeBurgId && homeBurgId > 0 ? homeBurgId : undefined,
    raisedIn,
    isDynasticClaimant,
    religionId: options.religionId
  };
}

/**
 * Populate `character.backstory`, align birthStateId/nationality, and bias prestige by stratum.
 * Safe to call after titles, roles, and location are assigned.
 */
export function applyCharacterBackstory(character: Character, options: ApplyBackstoryOptions = {}): void {
  if (options.onlyIfMissing && character.backstory) return;

  // Skill background bias is one-shot: re-running this would stack deltas.
  const applySkillBackground = !character.backstory;

  const roleClass =
    options.roleClass ?? (options.isReligiousRole ? "religious" : undefined) ?? inferRoleClass(character);

  const origin = buildOrigin(character, options, roleClass);
  const commitment = buildCommitment(character, roleClass, options.formName, origin.socialStratum);
  const tastes = buildTastes(character, roleClass, commitment, origin, options.formName);

  // Integrity: faith commitment with very low piety → boost piety slightly (G1 soft)
  if (commitment.primary.kind === "faith" && character.personality.piety < 20) {
    character.personality.piety = rand(20, 40);
  }

  // Stratum (家業・出自) + raisedIn (成育環境) nudge skills after occupation roll.
  // createPerson already applied roleClass / primarySkill medians.
  if (applySkillBackground) {
    applyBackgroundSkillBias(character.skills, origin.socialStratum, origin.raisedIn);
    syncCk3AbilityProfileSkills(character);
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

  // Household attire + martial kit (docs/plan/character-loadout-and-readiness.md EQ-1).
  // Runs after origin/estate so dignity floors apply; does not mint inventory units.
  seedCharacterLoadout(character, {
    catalog: resolveLoadoutGoodsCatalog(),
    roleClass,
    cultureType: resolveCultureTypeForLoadout(character.culture),
    onlyIfMissing: true
  });
}

// ---------------------------------------------------------------------------
// Solidarity (political) + Favor (romantic) seeding
// ---------------------------------------------------------------------------

/** Absolute score at or above this always warrants recording a solidarity edge. */
const STRONG_SOLIDARITY_THRESHOLD = 10;

/** Field regiment/fleet command titles — not central court martial offices (Marshal). */
const FIELD_COMMAND_TITLE_RE = /^(Commander|Admiral)$/i;

/** Court-side martial offices that still belong in the power-player clique. */
const COURT_MARTIAL_TITLE_RE = /^(Marshal|General|Minister of War)$/i;

/** Economy role kinds that mark the top commercial power of a market. */
const CAPITAL_AUDIENCE_MERCHANT_ROLE_KINDS = new Set(["marketManager", "merchantOrganizationHead"]);

/**
 * Who routinely meets whom, by portfolio.
 * - court: council / crown peers
 * - military: Marshal ↔ field commanders, frontier lords
 * - commerce: Chancellor/Steward/ruler ↔ capital top merchants
 * - faith: chaplains and clergy
 */
export type AudienceSphere = "court" | "military" | "commerce" | "faith";

function isMilitaryRole(character: Character): boolean {
  const cls = inferRoleClass(character);
  if (cls === "commander" || cls === "ruler") return true;
  return character.titles.some(t => isMartialCommandTitle(t.title) || /Marshal|War|General|Admiral/i.test(t.title));
}

/**
 * Court / provincial power holders who always share a thin institutional solidarity edge.
 * Field Commander/Admiral are intentionally excluded — they sit under the Marshal, not the crown.
 */
function isCourtPowerPlayer(character: Character): boolean {
  const cls = inferRoleClass(character);
  if (cls === "ruler" || cls === "central_officer" || cls === "province_lord") return true;
  // Marshal/General keep court standing even though inferRoleClass maps them to "commander".
  return character.titles.some(t => COURT_MARTIAL_TITLE_RE.test(t.title));
}

/** Regiment/fleet officer (Commander/Admiral), as opposed to court Marshal. */
export function isFieldCommander(character: Character): boolean {
  return character.titles.some(t => FIELD_COMMAND_TITLE_RE.test(t.title));
}

/** Court war portfolio (Marshal / General / Minister of War). */
export function isCourtMartialOfficer(character: Character): boolean {
  return character.titles.some(t => COURT_MARTIAL_TITLE_RE.test(t.title));
}

function isRulerCharacter(character: Character): boolean {
  return inferRoleClass(character) === "ruler";
}

function isMerchantCharacter(character: Character): boolean {
  return inferRoleClass(character) === "merchant";
}

function isDiplomaticOfficeTitle(title: string): boolean {
  return /Chancellor|Foreign Affairs|Diplomat|Envoy|Secretary of State/i.test(title);
}

function isStewardshipOfficeTitle(title: string): boolean {
  return /^(Steward|Prime Minister|Minister of Finance|Treasurer)$/i.test(title) || /Finance|Treasury/i.test(title);
}

function isFaithOfficeTitle(title: string): boolean {
  return /Chaplain|Priest|Priestess|Bishop|Cleric|Imam|Dean|Vicar|Patriarch|Pontiff/i.test(title);
}

/**
 * Portfolio spheres for contact filtering. Overlap is required before solidarity can seed.
 * Rulers deliberately lack "military" so field commanders report via the Marshal.
 */
export function getAudienceSpheres(character: Character): ReadonlySet<AudienceSphere> {
  const spheres = new Set<AudienceSphere>();
  const cls = inferRoleClass(character);

  if (isFieldCommander(character)) {
    spheres.add("military");
    return spheres;
  }

  if (isMerchantCharacter(character)) {
    spheres.add("commerce");
    return spheres;
  }

  if (cls === "ruler") {
    spheres.add("court");
    spheres.add("commerce"); // rare audiences with the capital market head only
    spheres.add("faith");
    return spheres;
  }

  if (cls === "province_lord") {
    spheres.add("court");
    spheres.add("military");
    return spheres;
  }

  if (cls === "religious") {
    spheres.add("faith");
    if (character.titles.some(t => t.entityType === "state")) spheres.add("court");
    return spheres;
  }

  if (isCourtPowerPlayer(character) || cls === "central_officer" || cls === "commander") {
    spheres.add("court");
    for (const holding of character.titles) {
      const title = holding.title;
      if (isCourtMartialOfficer(character) || COURT_MARTIAL_TITLE_RE.test(title)) spheres.add("military");
      if (isDiplomaticOfficeTitle(title) || isStewardshipOfficeTitle(title)) spheres.add("commerce");
      if (isFaithOfficeTitle(title)) spheres.add("faith");
    }
  }

  // Unmapped state titles still sit at court rather than becoming universal contacts.
  if (spheres.size === 0 && isCentralGovernment(character)) {
    spheres.add("court");
  }

  return spheres;
}

function spheresIntersect(a: Character, b: Character): boolean {
  const sa = getAudienceSpheres(a);
  const sb = getAudienceSpheres(b);
  for (const sphere of sa) {
    if (sb.has(sphere)) return true;
  }
  return false;
}

function hasAudienceSphere(character: Character, sphere: AudienceSphere): boolean {
  return getAudienceSpheres(character).has(sphere);
}

function resolveStateCapitalBurgId(character: Character): number | undefined {
  if (hasCharactersContext()) {
    const pack = getWorldContext().pack;
    const capital = pack.states?.[character.state]?.capital;
    if (typeof capital === "number") return capital;
  }
  if (isRulerCharacter(character)) {
    return character.location ?? character.backstory?.origin.homeBurgId ?? character.backstory?.origin.birthBurgId;
  }
  // Central officers are generated at the capital; use that as a test-friendly fallback.
  return character.location ?? character.backstory?.origin.homeBurgId;
}

function resolveCapitalMarketId(capitalBurgId: number): number | undefined {
  if (!hasCharactersContext()) return undefined;
  const burg = getWorldContext().pack.burgs?.[capitalBurgId];
  return typeof burg?.market === "number" ? burg.market : undefined;
}

function isTopMerchantRoleForCapital(
  role: CharacterRole,
  capitalBurgId: number,
  capitalMarketId: number | undefined
): boolean {
  if (!CAPITAL_AUDIENCE_MERCHANT_ROLE_KINDS.has(role.kind)) return false;
  if (role.entityType === "market") {
    return capitalMarketId === undefined || role.entityId === capitalMarketId;
  }
  if (role.entityType === "burg") {
    return role.entityId === capitalBurgId;
  }
  return false;
}

/**
 * Leading merchant of the capital's market (market manager / company head).
 * Used for audiences with the crown and with commercial-portfolio officers
 * (Chancellor, Steward, Finance) — not guilds, rivals, or provincial traders.
 */
export function isCapitalAudienceMerchant(merchant: Character, counterpart: Character): boolean {
  if (!isMerchantCharacter(merchant)) return false;
  if (merchant.state !== counterpart.state || merchant.state === 0) return false;
  if (!hasAudienceSphere(counterpart, "commerce")) return false;

  const capitalBurgId = resolveStateCapitalBurgId(counterpart);
  if (capitalBurgId === undefined) return false;

  const capitalMarketId = resolveCapitalMarketId(capitalBurgId);
  const roles = merchant.roles ?? [];
  if (!roles.some(role => isTopMerchantRoleForCapital(role, capitalBurgId, capitalMarketId))) {
    return false;
  }

  // When market ids are unknown (unit tests without pack), require capital residence/home.
  if (capitalMarketId === undefined) {
    const home = merchant.backstory?.origin.homeBurgId ?? merchant.location;
    if (home !== capitalBurgId) return false;
  }

  return true;
}

/**
 * Hard contact rules for initial solidarity seeding, by office portfolio.
 * Does not replace score computation — only whether an edge may exist at all.
 *
 * Examples:
 * - Marshal meets field commanders; Chancellor does not.
 * - Chancellor/Steward meet capital top merchants; Marshal does not.
 * - Court officers still meet each other via the shared "court" sphere.
 */
export function canHaveDirectSolidarity(a: Character, b: Character): boolean {
  if (a.i === b.i) return false;
  if (!spheresIntersect(a, b)) return false;

  // Merchants only meet commerce-portfolio officials (and the crown), and only capital top power.
  if (isMerchantCharacter(a) !== isMerchantCharacter(b)) {
    const merchant = isMerchantCharacter(a) ? a : b;
    const official = isMerchantCharacter(a) ? b : a;
    return isCapitalAudienceMerchant(merchant, official);
  }

  return true;
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

    // Marshal-like vs Spymaster-like office tension (chaplains are not spies)
    const fromTitles = from.titles.map(t => t.title);
    const toTitles = to.titles.map(t => t.title);
    const martialOffice = (titles: string[]) => titles.some(t => /Marshal|War|Commander|Admiral|General/i.test(t));
    const intrigueOffice = (titles: string[]) => titles.some(t => isSpymasterTitle(t));
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

/**
 * Whether a computed solidarity score should be persisted for the pair.
 * Field commanders are never court-power auto-edges — they need a strong score,
 * a Marshal chain-of-command link, or shared birthplace (when contact is allowed).
 */
export function shouldRecordSolidarity(score: number, a: Character, b: Character): boolean {
  if (!canHaveDirectSolidarity(a, b)) return false;

  if (Math.abs(score) >= STRONG_SOLIDARITY_THRESHOLD) return true;
  if (isCourtPowerPlayer(a) && isCourtPowerPlayer(b)) return true;
  // Marshal (etc.) ↔ field command is an institutional reporting line.
  if ((isFieldCommander(a) && isCourtMartialOfficer(b)) || (isFieldCommander(b) && isCourtMartialOfficer(a))) {
    return true;
  }
  // Capital market head audience with commerce-portfolio officials or the crown.
  if (isCapitalAudienceMerchant(a, b) || isCapitalAudienceMerchant(b, a)) {
    return true;
  }
  // Titled peers still auto-record, but field commanders are sparse (strong score only).
  if (a.titles.length > 0 && b.titles.length > 0 && !isFieldCommander(a) && !isFieldCommander(b)) {
    return true;
  }
  const ao = a.backstory?.origin;
  const bo = b.backstory?.origin;
  if (ao?.birthBurgId && ao.birthBurgId === bo?.birthBurgId) return true;
  return false;
}

/**
 * Romantic / sexual interest only. Sparse; not seeded for every peer pair.
 * Same race: uses observer-relative attractiveness (Appearance judgment).
 * Cross race: almost never; when it does, scores stay low and read as deviant curiosity.
 * Lore: docs/world/help/races-beauty-and-pairing.md
 */
export function computeRomanticFavor(from: Character, to: Character): number | null {
  if (from.i === to.i || from.dead || to.dead) return null;
  // Default: heterosexual court pairing; rare same-sex interest
  if (from.gender === to.gender && !P(0.08)) return null;

  const sameRace = isSameRace(from, to);
  const pull = attractiveness(from, to);

  // Cross-race pairing is socially deviant; rare private obsession only.
  if (!sameRace) {
    const lust = from.backstory?.tastes.find(t => t.id === "lust" && t.polarity === "like");
    const deviantChance = 0.008 + (lust ? lust.intensity / 2000 : 0);
    if (from.personality.piety >= 60 || !P(deviantChance)) return null;
    // Cap scores: never reads as conventional court romance
    let score = rand(5, 18) + Math.round(pull.score * 0.15);
    if (from.personality.piety >= 40) score -= rand(5, 15);
    return clampRelation(Math.min(35, score));
  }

  const lust = from.backstory?.tastes.find(t => t.id === "lust" && t.polarity === "like");
  const appearancePull = (pull.score - 45) / 55; // -0.8..1
  const sociability = from.personality.sociability / 100;
  const baseChance = 0.04 + Math.max(0, appearancePull) * 0.12 + (lust ? lust.intensity / 400 : 0) + sociability * 0.04;
  if (!P(Math.min(0.35, baseChance))) return null;

  let score = rand(5, 25) + Math.round(pull.score * 0.45) + (lust ? Math.round(lust.intensity * 0.2) : 0);
  score += Math.round((from.personality.sociability - 40) * 0.15);
  if (from.personality.piety >= 75) score -= rand(10, 25);
  if (from.backstory?.tastes.some(t => t.id === "lust" && t.polarity === "dislike")) score -= rand(20, 40);
  // Prestige / forbidden fruit for social climbers
  if (from.personality.greed >= 60) score += Math.round((to.prestige - 40) * 0.15);

  return clampRelation(score);
}

/**
 * `setSolidarity` treats 0 as "delete edge" (sparse map). When contact is real but the
 * roll lands on neutral, keep a ±1 stub so the relationship remains visible.
 */
function materializeRecordedSolidarity(score: number): number {
  const clamped = clampRelation(score);
  if (clamped !== 0) return clamped;
  return P(0.5) ? 1 : -1;
}

function trySeedSolidarityPair(a: Character, b: Character): void {
  if (!canHaveDirectSolidarity(a, b)) return;
  const ab = computeInitialSolidarity(a, b);
  const ba = computeInitialSolidarity(b, a);
  if (shouldRecordSolidarity(ab, a, b) || shouldRecordSolidarity(ba, b, a)) {
    setSolidarity(a, b.i, materializeRecordedSolidarity(ab));
    setSolidarity(b, a.i, materializeRecordedSolidarity(ba));
  }
}

function trySeedRomanticFavorPair(a: Character, b: Character): void {
  const fab = computeRomanticFavor(a, b);
  if (fab !== null) setFavor(a, b.i, fab);
  const fba = computeRomanticFavor(b, a);
  if (fba !== null) setFavor(b, a.i, fba);
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
        trySeedSolidarityPair(a, b);
        trySeedRomanticFavorPair(a, b);
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
    trySeedSolidarityPair(character, other);
    trySeedRomanticFavorPair(character, other);
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
  if (/artwork|sculpture|tapestry|instrument|ceramic|glass/i.test(goodName)) {
    score += (recipient.skills.artistry - 40) * 0.35;
  }
  if (/book|paper|ink/i.test(goodName)) score += (recipient.skills.learning - 40) * 0.25;
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
