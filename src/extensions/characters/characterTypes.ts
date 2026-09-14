import type { AppearanceAxes, CharacterRaceAppearance } from "../../types/models";
import type { CharacterSpecializationProfile } from "./specializationTypes";

export type Gender = "male" | "female";
export type { AppearanceAxes, AppearanceAxisId, CharacterRaceAppearance } from "../../types/models";

/**
 * Optional directorial skew applied at character creation, on top of the fully-random default.
 * "none" preserves the normal race/culture-driven gender ratio, age, and looks rolls.
 * "youngMaleHeavy" / "youngFemaleHeavy" push newly created characters towards a young age,
 * a high Appearance score, and a lopsided gender ratio favoring the named gender.
 * See createPerson() in personFactory.ts for where each axis is biased.
 */
export type CharacterGenerationBias = "none" | "youngMaleHeavy" | "youngFemaleHeavy";

/** How a person actually fought in a reconstructed campaign — not the state's win/loss. */
export type WarConductKind =
  | "rear_idle"
  | "front_assault"
  | "rearguard_rescue"
  | "defensive_hold"
  | "costly_push"
  | "cautious_avoid";

export type MilitaryEpithetId = "guardian" | "last_guard" | "wall" | "vanguard" | "idle_banner";

/** Public court nickname — distinct from war-conduct epithets on `militaryRecord`. */
export type CourtEpithetId =
  | "foolish_king"
  | "wise_king"
  | "sycophant"
  | "benevolent_king"
  | "renowned_king"
  | "tyrant_king";

export type EpithetLineage = "court" | "war_conduct" | "war_legend" | "craft" | "commerce" | "office";

/** v1 occupation nicknames. Future ids (learned_divine, virtuoso, …) stay out of this union. */
export type OccupationEpithetId =
  | "war_god"
  | "master_artisan"
  | "prodigy"
  | "magnate"
  | "unscrupulous_merchant"
  | "able_minister";

export interface CharacterEpithet {
  lineage: Exclude<EpithetLineage, "court" | "war_conduct">;
  id: OccupationEpithetId;
}

export interface CharacterWarService {
  warId?: string;
  campaignName: string;
  /** Year the campaign began. Kept so a long-running war remains identifiable. */
  year: number;
  /** First year this character could have served in the campaign. */
  serviceStartYear?: number;
  opponentStateId: number;
  side: "attacker" | "defender";
  conduct: WarConductKind;
}

export interface CharacterMilitaryRecord {
  wars: number;
  services: CharacterWarService[];
  epithetId?: MilitaryEpithetId;
}

export interface TitleHolding {
  /** Gender-resolved display title, e.g. "King", "Prime Minister", "Khan". */
  title: string;
  /** true = sovereign/territorial ruler; false = government office or field command. */
  landed: boolean;
  /** "state" for rulers/central offices; "province" for landed frontier lords; "burg" for burgomaster/council. */
  entityType: "state" | "province" | "burg";
  /** pack.states[] id when entityType is "state"; pack.provinces[] id when "province"; pack.burgs[] id when "burg". */
  entityId: number;
  startYear?: number;
  endYear?: number;
  reason?: string;
}

export interface CharacterRole {
  /** Extension or subsystem that owns this non-political role. */
  source: string;
  /** Stable role discriminator, e.g. "marketManager". */
  kind: string;
  /** Target entity namespace. Market roles point at pack.markets[]. */
  entityType: "market" | "state" | "province" | "burg";
  entityId: number;
  label: string;
  startYear?: number;
  endYear?: number;
  reason?: string;
  /** Optional subsystem-specific organization pointer, e.g. economy merchant company id. */
  organizationId?: number;
  /** Optional subsystem-specific domain tag, e.g. Economy's CraftKnowledgeDomain for a guild role. */
  domain?: string;
}

export type DemonCoverStratum = "ruler" | "military" | "influential" | "commoner";

/**
 * Secret, simulation-facing identity for a Demon passing as Human.
 *
 * `Character.race` deliberately remains Human: ordinary character views and all
 * civic/racial rules see only the cover identity. Consumers that implement
 * discovery, intrigue, or infernal plots must opt in to reading this field.
 */
export interface DemonInfiltration {
  coverStratum: DemonCoverStratum;
  objective: "maximizeHumanDeaths";
  /** Chronological Demon age; `Character.age` is the age of the Human guise. */
  actualAge?: number;
  /**
   * Complete character sheet of the Demon. The outer Character remains the
   * active Human cover so ordinary civic systems continue to see the disguise;
   * consumers of infernal information opt in to this record instead.
   */
  demonIdentity?: DemonIdentity;
  /**
   * Complete sheet of the current Human whose identity is being worn. It keeps
   * the Human Arcane value too, even though the visible Arcane readout is
   * intentionally overridden by `demonIdentity.arcane`.
   */
  coverIdentity?: DemonIdentity;
  /** Long-term human knowledge accumulated across successive covers. */
  humanSocietyExperience?: DemonSocietyExperience;
  /** The Demon's immutable body, kept separately from its current Human cover. */
  trueForm?: {
    appearance: number;
    looks?: AppearanceAxes;
    raceAppearance: Extract<CharacterRaceAppearance, { kind: "demon" }>;
  };
  /** Covers discarded after their Human age became implausible. */
  identityReplacements?: Array<{
    year: number;
    victimId: number;
    victimName: string;
    previousCoverName: string;
  }>;
  /** Usually empty; only the small minority taking part in a current compact has peers. */
  collaboratorIds: number[];
}

export interface CharacterSkills {
  artistry: number;
  diplomacy: number;
  engineering: number;
  geography: number;
  intrigue: number;
  learning: number;
  martial: number;
  prowess: number;
  stewardship: number;
}

/** Persistent knowledge an infiltrator has acquired while living among Humans. */
export interface DemonSocietyExperience {
  /** Whole years spent in Human covers. */
  years: number;
  /** Number of public identities already worn, including the current one. */
  coverCount: number;
  /** Best Human skill witnessed or personally practiced across all covers. */
  learnedSkillPeaks: Partial<CharacterSkills>;
  /** Number of 50-year human-society milestones already used for infernal growth. */
  arcaneGrowthMilestones: number;
}

/**
 * Abyssal dominion and infernal supremacy accumulated by an overt Demon who walks undisguised.
 * Rather than mimicking human society, overt demons cultivate terror, martial dread, and ancient abyssal mastery.
 */
export interface DemonDominionExperience {
  /** Whole years lived openly as a Demon. */
  years: number;
  /** Dread / terror dominion rating (0–100) reflecting awe, fear, and infernal presence. */
  dreadDominion: number;
  /** Number of 50-year abyssal awakening milestones achieved. */
  abyssalMilestones: number;
}

export interface CharacterPersonality {
  /** Willingness to accept risk, not a desire for war. */
  boldness: number;
  compassion: number;
  greed: number;
  honor: number;
  rationality: number;
  sociability: number;
  vengefulness: number;
  /** General dedication; commitment supplies its direction. */
  zeal: number;
  energy: number;
  piety: number;
  /** Preference for concealment and indirect methods; execution uses skills.intrigue. */
  guile: number;
  confidence: number;
}

export interface CharacterFamily {
  spouses: number;
  children: number;
  grandchildren: number;
  greatGrandchildren: number;
  spouseIds?: number[];
  childIds?: number[];
  fatherId?: number;
  motherId?: number;
}

/** One entry in an ability-score preset's stat block, e.g. D&D 5e's "STR" or the built-in CK3-style "diplomacy". */
export interface AbilityStatDef {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

/**
 * A pluggable ability-score system (D&D 5e, CK3-style, or any future game's stat block).
 * Registered via charactersContext's registerAbilityPreset() — see docs/plan/char-economy.md
 * (質問3/回答3) for the design rationale. `generate()` uses the module-level rand()/P()
 * helpers (backed by the currently-seeded Math.random), matching the world-gen-time RNG
 * convention used elsewhere in this extension — not the injected AppServices.rng used by
 * live-tick subsystems.
 */
export interface AbilityPreset {
  id: string;
  label: string;
  stats: AbilityStatDef[];
  generate(): Record<string, number>;
}

/** A character's rolled values under one AbilityPreset, keyed by AbilityStatDef.key. */
export interface AbilityProfile {
  presetId: string;
  values: Record<string, number>;
}

/** True when this character participates in CK3-specific skill, personality, and court systems. */
export function isCk3Character(character: Pick<Character, "abilityProfile">): boolean {
  return (character.abilityProfile?.presetId ?? "ck3e") === "ck3e";
}

/** Birth social stratum — see docs/plan/characters/backstory-profile.md §3. */
export type SocialStratum =
  | "royal"
  | "high_noble"
  | "minor_noble"
  | "gentry"
  | "commoner"
  | "merchant_born"
  | "clergy_orphan"
  | "freedman"
  | "slave_born"
  | "foreigner"
  | "unknown";

/** Current estate / legal standing (may differ from birth stratum after rise/fall). */
export type EstateStatus =
  | "reigning_dynasty"
  | "court_noble"
  | "landed_noble"
  | "officer"
  | "official"
  | "cleric"
  | "freeman"
  | "burgher"
  | "serf"
  | "slave"
  | "outlaw"
  | "exile";

/** Where the character was primarily raised. */
export type RaisedIn =
  | "capital_court"
  | "capital_city"
  | "provincial_seat"
  | "frontier_burg"
  | "rural_manor"
  | "monastery"
  | "military_camp"
  | "merchant_quarter"
  | "foreign_court"
  | "street";

/** What the character primarily serves / values — zeal's *direction*. */
export type CommitmentKind =
  | "self"
  | "family"
  | "house"
  | "liege"
  | "patron"
  | "office"
  | "domain"
  | "state"
  | "nation_culture"
  | "faith"
  | "ideology"
  | "craft"
  | "wealth"
  | "comrades"
  | "people"
  | "rivalry"
  | "hedonism";

export interface CommitmentFocus {
  kind: CommitmentKind;
  targetId?: number;
  label?: string;
  weight?: number;
}

export type ConflictPolicy = "primary_wins" | "negotiate" | "whichever_hurts_less" | "burn_both";

export interface CharacterCommitment {
  primary: CommitmentFocus;
  secondary?: CommitmentFocus;
  /** Devotion heat; defaults to personality.zeal when omitted at generation. */
  intensity: number;
  conflictPolicy: ConflictPolicy;
}

export type TastePolarity = "like" | "dislike";

export interface CharacterTaste {
  /** Personal enjoyment, an ethical judgement, or fear; omission is a legacy preference. */
  aspect?: "preference" | "value" | "fear";
  id: string;
  polarity: TastePolarity;
  intensity: number;
  note?: string;
}

export interface CharacterOrigin {
  socialStratum: SocialStratum;
  /** Independent of class: a noble may be an immigrant or raised in a monastery. */
  migration?: "native" | "immigrant" | "exile";
  familyOccupation?: "agriculture" | "trade" | "craft" | "military" | "administration" | "religion";
  estateStatus: EstateStatus;
  birthBurgId?: number;
  birthProvinceId?: number;
  birthStateId: number;
  homeBurgId?: number;
  raisedIn: RaisedIn;
  lineageId?: number;
  lineageName?: string;
  isDynasticClaimant?: boolean;
  religionId?: number;
}

export type CharacterBondKind =
  | "mentor"
  | "benefactor"
  | "rival"
  | "nemesis"
  | "lover"
  | "friend"
  | "ward"
  | "patron"
  | "client"
  | "favorite"
  | "blood_feud"
  | "comrade"
  | "hometown_kin";

export interface CharacterBond {
  kind: CharacterBondKind;
  targetType: "character" | "house" | "state" | "religion" | "organization";
  targetId: number;
  strength: number;
  sinceYear?: number;
  note?: string;
}

/**
 * Structured flavor line — resolve with i18n at display time.
 * Legacy plain strings may still appear on old saves.
 */
export interface CharacterFlavorHook {
  /** Key under `characters.flavorLines.<id>`. */
  id: string;
  /** Interpolation params (often other i18n keys resolved by formatFlavorHook). */
  params?: Record<string, string>;
}

/** Passing Human whose Arcane can exceed the species cap of 10. Not shown as a race. */
export type InfernalAtavismFlavor = "blueBlood" | "pactHouse";
export interface ArcaneLineage {
  kind: "infernal_atavism";
  flavor: InfernalAtavismFlavor;
}

export type CharacterGoalKind =
  | "complete_service"
  | "gain_office"
  | "gain_wealth"
  | "protect_people"
  | "restore_homeland"
  | "return_home"
  | "reunite_family"
  | "master_craft"
  | "serve_faith";

export interface CharacterGoal {
  kind: CharacterGoalKind;
  intensity: number;
  status: "active" | "completed" | "abandoned";
  target?: { type: "character" | "state" | "burg"; id: number };
}

export type CharacterPrinciple = "keep_oaths" | "protect_civilians" | "spare_prisoners" | "reject_aggression";
export type CompassionScope = "everyone" | "community" | "faith" | "family" | "species" | "self";

/** Recorded events, never invented from present-day personality scores. */
export interface CharacterLifeEvent {
  kind: "office_exit";
  year: number;
  title: string;
  reason: string;
  entityType: "state" | "province" | "burg";
  entityId: number;
}

export interface CharacterBackstory {
  origin: CharacterOrigin;
  /** Optional for old saves. Goals describe ambitions, not skill or moral worth. */
  goals?: CharacterGoal[];
  principles?: CharacterPrinciple[];
  compassionScope?: CompassionScope;
  /** Personal assent, independent of piety, culture, and faction membership. */
  religiousWar?: "unspecified" | "defensive" | "holy_war" | "sacrificial";
  lifeEvents?: CharacterLifeEvent[];
  commitment: CharacterCommitment;
  tastes: CharacterTaste[];
  bonds?: CharacterBond[];
  /**
   * Flavor hooks (structured for i18n). Plain strings are legacy English only.
   */
  hooks?: Array<CharacterFlavorHook | string>;
}

/**
 * Lightweight house / lineage record (Phase E).
 * Characters reference this via `backstory.origin.lineageId`.
 */
export interface Dynasty {
  i: number;
  /** Display name, e.g. "House Aldric". */
  name: string;
  culture: number;
  /** Home state when founded (optional). */
  stateId?: number;
  founderBurgId?: number;
  founderCharacterId?: number;
  /** Optional motto / house saying. */
  motto?: string;
}

/** Gift / bribe intent — primarily moves solidarity; romance intent may also move favor. */
export type GiftIntent = "courtesy" | "bribe" | "tribute" | "romance" | "piety_offering";

/**
 * Political / collegial standing band for `solidarity` (-100..100).
 * Court peers are often collegial-on-paper but rivalrous underneath.
 */
export type SolidarityBand =
  | "bonded" // +80..+100 deep trust
  | "solid" // +50..+79 reliable ally
  | "collegial" // +20..+49 workable colleague
  | "neutral" // -19..+19
  | "strained" // -49..-20 friction
  | "rivalrous" // -79..-50 power rivalry / distrust
  | "hostile"; // -100..-80 open antagonism

/** Romantic / sexual interest band for `favor` (-100..100). Not general liking. */
export type FavorBand = "devoted" | "fond" | "friendly" | "neutral" | "wary" | "hostile" | "hatred";

/**
 * Role class used when rolling origin/commitment biases.
 * Inferred from titles/roles when not supplied at generation.
 */
export type CharacterRoleClass =
  | "ruler"
  | "central_officer"
  | "commander"
  | "province_lord"
  | "merchant"
  | "religious"
  | "ordinary";

/**
 * Coarse illness severity band — mirrors the coarse-band convention used elsewhere
 * (SolidarityBand, FavorBand). See docs/plan/characters/character-health-and-disease.md.
 */
export type AfflictionSeverity = "mild" | "moderate" | "severe" | "critical";

/** Disease archetype id — catalog defined in characterHealth.ts's AFFLICTION_CATALOG. */
export type AfflictionKind = "fever" | "flux" | "pox" | "plague" | "wasting" | "cholera";

/** A character's current sickness. Absence on `Character.affliction` means healthy. */
export interface CharacterAffliction {
  kind: AfflictionKind;
  severity: AfflictionSeverity;
  /** Year the affliction was first contracted (flavor text / duration checks). */
  sinceYear: number;
}

export interface Character {
  i: number;
  name: string;
  age: number;
  /**
   * Sub-year remainder carried between aging passes, in years (just under 1 at most, and slightly
   * negative for one tick after a leap-day boundary is absorbed — see AGE_YEAR_EPSILON).
   *
   * advanceCharacterAging() is called once per simulated calendar day with deltaYears ~ 1/365, so
   * rounding `age + deltaYears` to an integer on every call would leave `age` frozen forever (it
   * did, until docs/plan/advance-time-history-mode.md Phase H0). The remainder accumulates here
   * instead and `age` advances only when it crosses a whole year, which makes a year of daily
   * steps and a single one-year step produce the same age.
   *
   * Optional so pre-H0 saves load unchanged (absent === 0).
   */
  ageFraction?: number;
  gender: Gender;
  /** pack.cultures id — drives name generation / cultural identity. */
  culture: number;
  /**
   * pack.races id — species / folk traits (gender policy, future lifespan, …).
   * Usually mirrors the culture's race at creation; may diverge later (adoption, etc.).
   */
  race?: number;
  /** pack.races id of the mortal race before death (for undead servitors like Zombie / Skeleton). */
  originalRace?: number;
  /** Present only on a Demon covertly passing as Human. */
  demonInfiltration?: DemonInfiltration;
  /** Present on an overt Demon living undisguised, tracking abyssal supremacy and dread. */
  demonDominion?: DemonDominionExperience;
  /**
   * Array (not a single field) so a future personal union — one character
   * holding titles over multiple states — needs no schema change. Phase 1
   * always populates exactly one entry per character.
   */
  titles: TitleHolding[];
  /** State ID to affinity score (-100 to 100) — inter-*state* opinion, not person-to-person. */
  affinities: Record<number, number>;
  /**
   * Character-to-character solidarity / political standing (-100..100), keyed by other `i`.
   * Default interpersonal axis: same regime + power rivalry + personality fit.
   * Sparse; missing key ≈ neutral/uncontacted. Asymmetric.
   * See docs/plan/characters/backstory-profile.md §6.
   */
  solidarity?: Record<number, number>;
  /**
   * Romantic / sexual interest only (-100..100), keyed by other `i`.
   * Not used for general collegial liking — use `solidarity` for that.
   */
  favor?: Record<number, number>;
  /** State IDs of marriage ties */
  marriages: number[];
  /**
   * Legacy/UI grouping state. This is not a universal allegiance model; use
   * birthStateId, nationalityStateId, location, and roles for explicit relations.
   */
  state: number;
  birthStateId?: number;
  nationalityStateId?: number;
  roles?: CharacterRole[];
  skills: CharacterSkills;
  /**
   * Cosmic Arcane 0–100. Omitted on non-fantasy maps. Not a CharacterSkills axis —
   * human cap is 10, Demon cap is 100. See docs/plan/characters/arcane.md.
   */
  arcane?: number;
  /** Fractional calendar year when the next working may be spent. Missing = ready. */
  arcaneReadyYear?: number;
  /** Calamity (95+) workings spent this lifetime. Lower bands have no lifetime cap. */
  arcaneWorkingsSpent?: number;
  /** Calendar year of the last 90+ working. One 90+ working per state per year. */
  arcaneLastHighYear?: number;
  /**
   * Hidden infernal atavism on a passing Human (no Demon looks). Flavor only in backstory hooks.
   * See docs/plan/characters/arcane.md.
   */
  arcaneLineage?: ArcaneLineage;
  /** Optional detailed knowledge, practice, experience and language profile. */
  specializations?: CharacterSpecializationProfile;
  personality: CharacterPersonality;
  /**
   * Ability-score profile from the Characters extension's current global ability
   * system at the time this character was created. For "ck3e" this is just
   * `skills`+`personality` merged into one flat map; other systems store their
   * own rolled values. Fixed skills/personality remain the source of truth for
   * existing political logic.
   */
  abilityProfile?: AbilityProfile;
  family: CharacterFamily;
  /**
   * Objective phenotype axes (1–100). Beauty is observer-relative — see
   * `attractiveness()` / docs/world/help/races-beauty-and-pairing.md.
   */
  looks?: AppearanceAxes;
  /** Race-specific physical traits rolled at creation, such as Demon horns or Beastfolk ancestry. */
  raceAppearance?: CharacterRaceAppearance;
  /**
   * Cached same-race attractiveness (own race ideal of own looks): how striking
   * this person is *among their people*. Not a universal beauty rank.
   * Cross-race romantic judgment must not use this alone.
   */
  appearance: number;
  /**
   * Home-public honor (1–100), not lineage, court influence, army esteem, or foreign fame.
   * Observer-relative hero/infamy is derived — see docs/plan/characters/prestige.md.
   */
  prestige: number;
  /**
   * Personal wealth, distinct from state.treasury — a ruler's household stipend
   * (docs/plan/state-treasury-department-budget.md §5) accrues here rather than being folded
   * back into state funds, and character-as-player mechanics (spending, gifting,
   * inheritance) read/write this field directly.
   */
  wealth: number;
  /**
   * Personal good holdings (good id → amount), distinct from market/burg stocks.
   * Used for gifts and private property; optional until a gift is received or granted.
   */
  inventory?: Record<number, number>;
  /**
   * Worn / wielded kit (distinct from bulk `inventory`).
   * Seeded from estate/role at creation; equip/unequip is a later PR.
   * See docs/plan/character-loadout-and-readiness.md.
   */
  loadout?: CharacterLoadout;
  /**
   * Origin, commitment (zeal's direction), tastes, and optional bonds/hooks.
   * Populated by applyCharacterBackstory() after titles/roles/location are known.
   */
  backstory?: CharacterBackstory;
  dead?: boolean;
  deathYear?: number;
  location?: number;
  pastTitles: TitleHolding[];
  /**
   * 0–100 physical condition. 100 = full health. Declines from poor local sanitation
   * exposure, age, and active afflictions; drifts back toward a sanitation-capped
   * baseline when unafflicted. Distinct from `looks.vitality` (cosmetic decline) — this
   * is the functional, mortality-relevant stat consumed by advanceCharacterAging()'s
   * death roll. Optional so existing fixtures/saves need no migration; missing means
   * "never simulated yet" — read via characterHealth.getCharacterHealth() (defaults to 100).
   * See docs/plan/characters/character-health-and-disease.md.
   */
  health?: number;
  /** Active sickness, if any. Absence = healthy (not necessarily health === 100). */
  affliction?: CharacterAffliction;
  /** Illnesses survived — optional flavor/prestige signal ("weathered the pox twice"). */
  timesIllness?: number;
  /**
   * Reconstructed personal war service from Relations-history campaigns.
   * Campaign `end` is not a victory. Conduct is how they fought, not whether the state "won".
   */
  militaryRecord?: CharacterMilitaryRecord;
  /**
   * Public court nickname (愚王 / 賢王 / 佞臣). Distinct from `militaryRecord.epithetId`.
   * Assigned at society finalize from governing competence and the foolish-ruler / sycophant pair.
   */
  courtEpithetId?: CourtEpithetId;
  /**
   * Occupation nicknames other than court and war-conduct (軍神 / 名工 / 豪商 / 悪徳商人 / …).
   * At most one id per lineage. Missing means unused — load does not backfill.
   */
  epithets?: CharacterEpithet[];
}

/** A full character sheet stored inside a Demon infiltration record, without nested disguises. */
export type DemonIdentity = Omit<Character, "demonInfiltration">;

/** Quality band shared by attire and weapons (1 = rags / farm tool … 5 = royal / masterwork). */
export type EquipmentQuality = 1 | 2 | 3 | 4 | 5;

export type LoadoutSlotId = "body" | "weapon" | "accessory" | "mount";

/**
 * How an item entered a loadout slot.
 * - seeded: world-gen / role seed (does not debit inventory)
 * - equipped: taken from inventory units
 * - editor: free GM override
 * - gift / spoils: transfer sources (future)
 */
export type EquippedItemSource = "seeded" | "equipped" | "editor" | "gift" | "spoils";

export interface EquippedItem {
  /** Catalog good id (Garments, Arms, Silk, Jewelry, Horses, …). */
  goodId: number;
  quality: EquipmentQuality;
  source: EquippedItemSource;
  /** Optional short flavor key for UI (e.g. "court_attire", "soldier_arms"). English catalog. */
  styleKey?: string;
}

/**
 * What the character is wearing / wielding right now.
 * Missing slots mean undressed / unarmed until seed or equip.
 */
export interface CharacterLoadout {
  /** Clothing / attire (Garments, Cloth, Silk, Furs, …). */
  body?: EquippedItem;
  /** Primary personal weapon set (Arms). */
  weapon?: EquippedItem;
  /** Prestige accessory (Jewelry) — optional v1 seed for high estate. */
  accessory?: EquippedItem;
  /** Mount (Horses) — seed deferred to v1.1. */
  mount?: EquippedItem;
}
