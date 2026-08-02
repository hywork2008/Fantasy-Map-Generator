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

function stratumWeights(roleClass: CharacterRoleClass): Partial<Record<SocialStratum, number>> {
  switch (roleClass) {
    case "ruler":
      return { royal: 70, high_noble: 25, unknown: 5 };
    case "central_officer":
      return { high_noble: 40, minor_noble: 30, gentry: 20, commoner: 10 };
    case "commander":
      return { minor_noble: 35, gentry: 25, commoner: 30, freedman: 5, foreigner: 5 };
    case "province_lord":
      return { high_noble: 30, minor_noble: 55, gentry: 15 };
    case "religious":
      return { clergy_orphan: 25, minor_noble: 30, gentry: 25, commoner: 20 };
    case "merchant":
      return { merchant_born: 50, commoner: 30, freedman: 10, minor_noble: 5, foreigner: 5 };
    default:
      return { commoner: 50, gentry: 20, merchant_born: 15, minor_noble: 10, freedman: 5 };
  }
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

  if (formName && /Theocracy|Holy State|Bishopric|Caliphate/i.test(formName)) {
    base.faith = (base.faith ?? 0) + 30;
  }
  if (formName && /Republic|Free City|League/i.test(formName)) {
    base.domain = (base.domain ?? 0) + 15;
    base.state = (base.state ?? 0) + 10;
    base.house = Math.max(0, (base.house ?? 0) - 10);
  }
  if (formName && /Horde|Khan|Khagan|Clan/i.test(formName)) {
    base.house = (base.house ?? 0) + 20;
    base.family = (base.family ?? 0) + 15;
    base.comrades = (base.comrades ?? 0) + 10;
  }
  return base;
}

function applyPersonalityToCommitmentWeights(
  weights: Partial<Record<CommitmentKind, number>>,
  character: Character
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
    w.liege = (w.liege ?? 0) + 15;
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
  const weights = applyPersonalityToCommitmentWeights(commitmentWeights(roleClass, formName), character);
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
  luxury: ["Silk", "Jewelry", "Perfume", "Garments"],
  art: ["Artworks", "Sculptures", "Tapestries", "Marble", "Ivory"],
  music: ["Instruments"],
  books: ["Books", "Paper", "Ink"],
  gold: ["Coins", "Gold Ingot", "Jewelry"],
  theology: ["Incense", "Candles", "Relics"],
  piety_practice: ["Incense", "Candles", "Relics"],
  hunting: ["Horses", "Furs", "Arms"],
  lust: ["Perfume", "Silk", "Wine"],
  ceremony: ["Incense", "Silk", "Jewelry"]
};

function pushTaste(list: CharacterTaste[], id: string, polarity: TastePolarity, intensity: number): void {
  if (list.some(t => t.id === id)) return;
  list.push({ id, polarity, intensity: Math.max(1, Math.min(100, Math.round(intensity))) });
}

function buildTastes(character: Character, roleClass: CharacterRoleClass): CharacterTaste[] {
  const p = character.personality;
  const s = character.skills;
  const likes: CharacterTaste[] = [];
  const dislikes: CharacterTaste[] = [];

  if (p.sociability >= 75) {
    pushTaste(likes, "company", "like", rand(60, 95));
    if (P(0.5)) pushTaste(likes, "wine", "like", rand(50, 90));
    if (P(0.4)) pushTaste(likes, "feast", "like", rand(50, 90));
    pushTaste(dislikes, "solitude", "dislike", rand(40, 80));
  } else if (p.sociability <= 25) {
    pushTaste(likes, "solitude", "like", rand(60, 95));
    if (P(0.5)) pushTaste(likes, "books", "like", rand(50, 90));
    pushTaste(dislikes, "company", "dislike", rand(50, 90));
  }

  if (p.greed >= 75) {
    pushTaste(likes, "gold", "like", rand(70, 100));
    if (P(0.5)) pushTaste(likes, "luxury", "like", rand(50, 90));
  }
  if (p.piety >= 75) {
    pushTaste(likes, "theology", "like", rand(60, 95));
    pushTaste(likes, "ceremony", "like", rand(50, 90));
    pushTaste(dislikes, "lust", "dislike", rand(40, 80));
    if (P(0.4)) pushTaste(dislikes, "corruption", "dislike", rand(50, 90));
  } else if (p.piety <= 25) {
    if (P(0.5)) pushTaste(likes, "wine", "like", rand(50, 90));
    if (P(0.3)) pushTaste(likes, "gold", "like", rand(50, 85));
  }

  if (s.martial >= 75 || roleClass === "commander") {
    pushTaste(likes, "sport", "like", rand(50, 90));
    if (P(0.5)) pushTaste(likes, "hunting", "like", rand(50, 90));
    if (P(0.4)) pushTaste(likes, "soldiers", "like", rand(50, 90));
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
  }
  if (roleClass === "religious") {
    pushTaste(likes, "theology", "like", rand(70, 100));
    pushTaste(likes, "ceremony", "like", rand(50, 90));
  }
  if (roleClass === "central_officer" && s.martial < 40 && P(0.35)) {
    pushTaste(dislikes, "war", "dislike", rand(40, 80));
  }

  // Pad to 2–4 likes and 1–3 dislikes with catalog fills
  while (likes.length < 2) {
    const id = TASTE_CATALOG[rand(0, TASTE_CATALOG.length - 1)]!;
    if (!likes.some(t => t.id === id) && !dislikes.some(t => t.id === id)) {
      pushTaste(likes, id, "like", rand(40, 75));
    } else break;
  }
  while (dislikes.length < 1) {
    const id = TASTE_CATALOG[rand(0, TASTE_CATALOG.length - 1)]!;
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
  const stratum = pickWeighted(stratumWeights(roleClass));
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
  const tastes = buildTastes(character, roleClass);

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
        if (tp.guile >= 70 && tp.honor <= 45) score -= rand(10, 25);
        if (tp.honor >= 70 && tp.guile <= 40) score += rand(5, 15);
      } else if (!fromRuler && toRuler) {
        // Subject viewing ruler: loyalty / fear / resentment
        if (fp.honor >= 60) score += rand(5, 18);
        if (fp.greed >= 70 || fp.guile >= 70) score -= rand(5, 18);
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
    // Comradeship tempered by glory-seeking
    score += rand(4, 12);
    if (fp.boldness >= 70 && tp.boldness >= 70) score -= rand(8, 18);
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
    // Naive actor distrusts / fears the schemer
    score -= rand(12, 28);
  }

  // --- Honor axis ---
  if (fp.honor >= 70) {
    if (tp.honor <= 35) score -= rand(15, 32);
    else if (tp.honor >= 70) score += rand(6, 16);
  }
  if (fp.honor <= 35 && tp.honor >= 75) {
    // Low-honor actor finds the upright inconvenient
    score -= rand(8, 20);
  }

  // --- Greed competition ---
  if (fp.greed >= 70 && tp.greed >= 70) score -= rand(10, 28);
  if (fp.greed >= 75 && tp.greed <= 30 && tp.honor >= 60) score -= rand(5, 15); // pious thrift annoys the greedy

  // --- Faith / zeal friction ---
  if (fp.piety >= 75 && tp.piety <= 30) score -= rand(10, 25);
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

  // --- Compassion mismatch ---
  if (fp.compassion >= 75 && tp.compassion <= 25) score -= rand(8, 20);
  if (fp.compassion <= 25 && tp.compassion >= 75) score -= rand(5, 12);

  // --- Vengefulness makes enemies stick ---
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
