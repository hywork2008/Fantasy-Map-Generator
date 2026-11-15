/**
 * Kind cards for named threats.
 * Spec: docs/plan/dnd/monster-nature.md
 *
 * Rarity and power are authored. Traits do not sum into either, and they do
 * not change the danger peak. The paint reads `medium` only.
 */

export const RARITY_DANGER_PEAK = [0, 48, 72, 140, 200, 255] as const;

export type MonsterMedium = "land" | "air" | "water";
export type MonsterMotive = "people" | "stock" | "property" | "slaughter";
export type MonsterAppetite = "none" | "rare" | "seasonal" | "persistent" | "catastrophic";
export type MonsterBlight = "none" | "venom" | "poisonGround" | "disease" | "curse";
export type MonsterSize = "small" | "medium" | "large" | "huge" | "vast";
export type MonsterSpeed = "slow" | "ordinary" | "fast" | "immediate";
export type MonsterResilience = "frail" | "ordinary" | "tough" | "extraordinary" | "unassailable";
export type MundaneStrike = "effective" | "impaired" | "futile";
export type InnateElement = "fire" | "lightning" | "cold" | "acid";
export type InnateScale = "none" | "personal" | "local" | "regional";
export type MonsterTrack = "ecology" | "occult";

export interface MonsterNature {
  readonly rarity: 1 | 2 | 3 | 4 | 5;
  readonly medium: MonsterMedium;
  readonly motives: readonly MonsterMotive[];
  readonly appetite: MonsterAppetite;
  readonly blight: MonsterBlight;
  readonly size: MonsterSize;
  readonly speed: MonsterSpeed;
  readonly resilience: MonsterResilience;
  readonly mundaneStrike: MundaneStrike;
  readonly innate: readonly InnateElement[];
  readonly innateScale: InnateScale;
  readonly track: MonsterTrack;
}

const APPETITE_RANK: Record<MonsterAppetite, number> = {
  none: 0,
  rare: 1,
  seasonal: 2,
  persistent: 3,
  catastrophic: 4
};
const SIZE_RANK: Record<MonsterSize, number> = { small: 0, medium: 1, large: 2, huge: 3, vast: 4 };
const RESILIENCE_RANK: Record<MonsterResilience, number> = {
  frail: 0,
  ordinary: 1,
  tough: 2,
  extraordinary: 3,
  unassailable: 4
};
const STRIKE_RANK: Record<MundaneStrike, number> = { effective: 0, impaired: 1, futile: 2 };
const SCALE_RANK: Record<InnateScale, number> = { none: 0, personal: 1, local: 2, regional: 3 };

/** Index by rarity 1..5. Rarity 0 is unused. */
const APPETITE_MAX = [
  0,
  APPETITE_RANK.seasonal,
  APPETITE_RANK.persistent,
  APPETITE_RANK.persistent,
  APPETITE_RANK.catastrophic,
  APPETITE_RANK.catastrophic
];
const SIZE_MAX = [0, SIZE_RANK.large, SIZE_RANK.huge, SIZE_RANK.huge, SIZE_RANK.vast, SIZE_RANK.vast];
const RESILIENCE_MAX = [
  0,
  RESILIENCE_RANK.tough,
  RESILIENCE_RANK.tough,
  RESILIENCE_RANK.tough,
  RESILIENCE_RANK.extraordinary,
  RESILIENCE_RANK.unassailable
];
const STRIKE_MAX = [
  0,
  STRIKE_RANK.effective,
  STRIKE_RANK.effective,
  STRIKE_RANK.impaired,
  STRIKE_RANK.impaired,
  STRIKE_RANK.futile
];
const SCALE_MAX = [0, SCALE_RANK.none, SCALE_RANK.personal, SCALE_RANK.personal, SCALE_RANK.local, SCALE_RANK.regional];

const BLIGHT_BY_RARITY: readonly (readonly MonsterBlight[])[] = [
  [],
  ["none", "venom"],
  ["none", "venom"],
  ["none", "venom", "poisonGround", "disease"],
  ["none", "venom", "poisonGround", "disease"],
  ["none", "venom", "poisonGround", "disease", "curse"]
];

export const BEAST_NATURE: MonsterNature = {
  rarity: 1,
  medium: "land",
  motives: ["stock", "people"],
  appetite: "seasonal",
  blight: "none",
  size: "medium",
  speed: "ordinary",
  resilience: "ordinary",
  mundaneStrike: "effective",
  innate: [],
  innateScale: "none",
  track: "ecology"
};

export const DIRE_BEAST_NATURE: MonsterNature = {
  rarity: 2,
  medium: "land",
  motives: ["stock", "people"],
  appetite: "persistent",
  blight: "none",
  size: "large",
  speed: "ordinary",
  resilience: "tough",
  mundaneStrike: "effective",
  innate: [],
  innateScale: "none",
  track: "ecology"
};

export const GREATER_MONSTER_NATURE: MonsterNature = {
  rarity: 3,
  medium: "land",
  motives: ["people", "slaughter"],
  appetite: "persistent",
  blight: "none",
  size: "huge",
  speed: "ordinary",
  resilience: "tough",
  mundaneStrike: "effective",
  innate: [],
  innateScale: "none",
  track: "ecology"
};

export const ARCH_BEAST_NATURE: MonsterNature = {
  rarity: 4,
  medium: "land",
  motives: ["people", "slaughter"],
  appetite: "catastrophic",
  blight: "none",
  size: "vast",
  speed: "fast",
  resilience: "extraordinary",
  mundaneStrike: "impaired",
  innate: [],
  innateScale: "none",
  track: "ecology"
};

export const CALAMITY_NATURE: MonsterNature = {
  rarity: 5,
  medium: "land",
  motives: ["slaughter"],
  appetite: "catastrophic",
  blight: "curse",
  size: "vast",
  speed: "ordinary",
  resilience: "unassailable",
  mundaneStrike: "futile",
  innate: [],
  innateScale: "none",
  track: "occult"
};

const NATURE_BY_TYPE: Readonly<Record<string, MonsterNature>> = {
  Beast: BEAST_NATURE,
  "Dire Beast": DIRE_BEAST_NATURE,
  "Greater Monster": GREATER_MONSTER_NATURE,
  "Arch-Beast": ARCH_BEAST_NATURE,
  Calamity: CALAMITY_NATURE
};

const NATURE_BY_RARITY: readonly MonsterNature[] = [
  BEAST_NATURE,
  DIRE_BEAST_NATURE,
  GREATER_MONSTER_NATURE,
  ARCH_BEAST_NATURE,
  CALAMITY_NATURE
];

export function rarityDangerPeak(rarity: number): number {
  if (rarity >= 5) return 255;
  if (rarity <= 0) return 0;
  return RARITY_DANGER_PEAK[rarity] ?? 0;
}

/** Quadratic falloff from the rarity peak. Zero at and beyond `power`. */
export function monsterContribution(rarity: number, power: number, dist: number): number {
  if (power <= 0 || dist >= power || rarity <= 0) return 0;
  const fraction = (power - dist) / power;
  // Square with multiplication. The `**` operator is banned in the simulation core.
  return Math.round(rarityDangerPeak(rarity) * fraction * fraction);
}

export function natureForMonster(monster: { readonly type?: string; readonly rarity: number }): MonsterNature {
  const named = monster.type ? NATURE_BY_TYPE[monster.type] : undefined;
  if (named) return named;
  const rarity = Math.max(1, Math.min(5, Math.round(monster.rarity) || 1));
  return NATURE_BY_RARITY[rarity - 1] ?? BEAST_NATURE;
}

export function natureIsLegal(nature: MonsterNature): boolean {
  const rarity = nature.rarity;
  if (rarity < 1 || rarity > 5) return false;
  if (APPETITE_RANK[nature.appetite] > APPETITE_MAX[rarity]) return false;
  if (!BLIGHT_BY_RARITY[rarity]?.includes(nature.blight)) return false;
  if (SIZE_RANK[nature.size] > SIZE_MAX[rarity]) return false;
  if (RESILIENCE_RANK[nature.resilience] > RESILIENCE_MAX[rarity]) return false;
  if (STRIKE_RANK[nature.mundaneStrike] > STRIKE_MAX[rarity]) return false;
  if (SCALE_RANK[nature.innateScale] > SCALE_MAX[rarity]) return false;
  return true;
}
