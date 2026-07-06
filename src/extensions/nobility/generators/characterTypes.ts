export type Gender = "male" | "female";

export interface TitleHolding {
  /** Gender-resolved display title, e.g. "King", "Prime Minister", "Khan". */
  title: string;
  /** true = sovereign/territorial ruler; false = government office. */
  landed: boolean;
  /** Literal union today; extend with "province" | "burg" once those levels are generated. */
  entityType: "state";
  /** pack.states[] id. */
  entityId: number;
  startYear?: number;
  endYear?: number;
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
  state: number;
  skills: CharacterSkills;
  personality: CharacterPersonality;
  family: CharacterFamily;
  appearance: number;
  prestige: number;
  dead?: boolean;
  location?: number;
  pastTitles: TitleHolding[];
}
