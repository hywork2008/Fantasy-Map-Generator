import type { AppearanceAxes } from "../../types/models";

export type Gender = "male" | "female";
export type { AppearanceAxes, AppearanceAxisId } from "../../types/models";

export interface TitleHolding {
  /** Gender-resolved display title, e.g. "King", "Prime Minister", "Khan". */
  title: string;
  /** true = sovereign/territorial ruler; false = government office or field command. */
  landed: boolean;
  /** "state" for rulers/central offices; "province" for landed frontier lords. Extend with "burg" once that level is generated. */
  entityType: "state" | "province";
  /** pack.states[] id when entityType is "state"; pack.provinces[] id when "province". */
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

export interface CharacterPersonality {
  boldness: number;
  compassion: number;
  greed: number;
  honor: number;
  rationality: number;
  sociability: number;
  vengefulness: number;
  zeal: number;
  energy: number;
  piety: number;
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
  id: string;
  polarity: TastePolarity;
  intensity: number;
  note?: string;
}

export interface CharacterOrigin {
  socialStratum: SocialStratum;
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

export interface CharacterBackstory {
  origin: CharacterOrigin;
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

export interface Character {
  i: number;
  name: string;
  age: number;
  gender: Gender;
  /** pack.cultures id — drives name generation / cultural identity. */
  culture: number;
  /**
   * pack.races id — species / folk traits (gender policy, future lifespan, …).
   * Usually mirrors the culture's race at creation; may diverge later (adoption, etc.).
   */
  race?: number;
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
  personality: CharacterPersonality;
  /**
   * Pluggable ability-score profile, always populated at creation. For the default "ck3e"
   * preset this is just `skills`+`personality` merged into one flat map (no extra RNG draw);
   * for any other registered preset (e.g. "dnd5e") it holds that preset's own rolled values.
   * `skills`/`personality` remain the source of truth for existing political logic — this
   * field exists so future NPC extensions can read/display an arbitrary preset without the
   * Character schema growing a new fixed field per game system.
   */
  abilityProfile?: AbilityProfile;
  family: CharacterFamily;
  /**
   * Objective phenotype axes (1–100). Beauty is observer-relative — see
   * `attractiveness()` / docs/world/help/races-beauty-and-pairing.md.
   */
  looks?: AppearanceAxes;
  /**
   * Cached same-race attractiveness (own race ideal of own looks): how striking
   * this person is *among their people*. Not a universal beauty rank.
   * Cross-race romantic judgment must not use this alone.
   */
  appearance: number;
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
}

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
