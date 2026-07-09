export type Gender = "male" | "female";

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

export interface Character {
  i: number;
  name: string;
  age: number;
  gender: Gender;
  /** pack.cultures id — drives name generation. */
  culture: number;
  /**
   * Array (not a single field) so a future personal union — one character
   * holding titles over multiple states — needs no schema change. Phase 1
   * always populates exactly one entry per character.
   */
  titles: TitleHolding[];
  /** State ID to affinity score (-100 to 100) */
  affinities: Record<number, number>;
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
  appearance: number;
  prestige: number;
  dead?: boolean;
  deathYear?: number;
  location?: number;
  pastTitles: TitleHolding[];
}
