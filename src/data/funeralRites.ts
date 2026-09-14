/**
 * Funeral / corpse-disposal customs.
 *
 * Culture-level trait (not religion): each living culture is assigned one dominant
 * rite at generation. Deaths consume the rite's materials and, for rites that leave
 * a body or bones, accumulate raisable remains. A Lich presence in those cells
 * raises the stock as skeleton / zombie soldiers.
 *
 * Methods are historically attested disposal practices, simplified to six mechanically
 * distinct rites. Labels are English identifiers; UI translates them.
 */
import type { CultureType } from "../types/models";

export const FUNERAL_RITES = [
  "inhumation",
  "cremation",
  "skyBurial",
  "waterBurial",
  "mummification",
  "exposure"
] as const;

export type FuneralRite = (typeof FUNERAL_RITES)[number];

export const DEFAULT_FUNERAL_RITE: FuneralRite = "inhumation";

export function isFuneralRite(value: unknown): value is FuneralRite {
  return typeof value === "string" && (FUNERAL_RITES as readonly string[]).includes(value);
}

/** Goods consumed per dead person (headcount). Missing keys are 0. */
export interface FuneralMaterialNeed {
  wood: number;
  stone: number;
  linen: number;
}

export interface FuneralRiteDefinition {
  id: FuneralRite;
  /**
   * Share of each death that remains as raisable corpse-equivalents (0 = destroyed).
   * Inhumation / mummification leave most of the body; cremation leaves none.
   */
  remainFraction: number;
  /**
   * Of those raised, the share that become zombies (flesh) rather than skeletons.
   * Preserved bodies skew zombie; exposed bones skew skeleton.
   */
  zombieShare: number;
}

/** Mechanical identity of each rite. Material recipes live beside this table. */
export const FUNERAL_RITE_DEFINITIONS: Record<FuneralRite, FuneralRiteDefinition> = {
  inhumation: { id: "inhumation", remainFraction: 0.8, zombieShare: 0.4 },
  cremation: { id: "cremation", remainFraction: 0, zombieShare: 0 },
  skyBurial: { id: "skyBurial", remainFraction: 0.12, zombieShare: 0 },
  waterBurial: { id: "waterBurial", remainFraction: 0.05, zombieShare: 0.2 },
  mummification: { id: "mummification", remainFraction: 0.95, zombieShare: 0.8 },
  exposure: { id: "exposure", remainFraction: 0.45, zombieShare: 0.1 }
};

/**
 * Per-CultureType sampling weights for the generation roll. Rows need not sum to 1;
 * `rollCultureFuneralRite` normalizes. Priors follow climate, fuel, and historical
 * practice (Tibetan/Zoroastrian sky burial in highlands, Egyptian-style mummification
 * in deserts, urban cremation in industrial settings, ship/river cultures water-bury).
 */
export const FUNERAL_RITE_WEIGHTS_BY_TYPE: Record<CultureType, Partial<Record<FuneralRite, number>>> = {
  Generic: { inhumation: 55, cremation: 30, exposure: 10, waterBurial: 5 },
  Highland: { skyBurial: 40, cremation: 25, inhumation: 20, exposure: 15 },
  Nomadic: { skyBurial: 35, exposure: 35, inhumation: 25, cremation: 5 },
  Desert: { mummification: 45, exposure: 25, inhumation: 20, cremation: 10 },
  Naval: { waterBurial: 45, cremation: 25, inhumation: 25, skyBurial: 5 },
  River: { inhumation: 45, waterBurial: 30, cremation: 20, exposure: 5 },
  Lake: { inhumation: 50, waterBurial: 25, cremation: 20, exposure: 5 },
  Hunting: { exposure: 50, inhumation: 25, skyBurial: 15, cremation: 10 },
  Marsh: { exposure: 40, waterBurial: 30, inhumation: 25, cremation: 5 },
  Industrial: { cremation: 55, inhumation: 40, waterBurial: 5 },
  Colonial: { inhumation: 50, cremation: 35, waterBurial: 15 }
};

/** Race catalog keys that nudge the type prior. Unknown keys are ignored. */
export const FUNERAL_RITE_RACE_WEIGHT_MULTIPLIERS: Record<string, Partial<Record<FuneralRite, number>>> = {
  dwarf: { inhumation: 1.8, cremation: 0.6, skyBurial: 0.4 },
  elf: { cremation: 1.4, exposure: 1.5, inhumation: 0.6 },
  dark_elf: { cremation: 1.2, exposure: 1.3, inhumation: 0.8 },
  orc: { exposure: 1.8, inhumation: 0.7, cremation: 0.8 },
  goblin: { exposure: 1.6, inhumation: 0.7 },
  draconic: { cremation: 1.8, inhumation: 0.5 },
  demon: { cremation: 1.3, exposure: 1.4, inhumation: 0.5 },
  beastfolk: { exposure: 1.5, skyBurial: 1.2, inhumation: 0.8 },
  amazones: { inhumation: 1.1, cremation: 1.1 },
  giant: { inhumation: 1.2, exposure: 1.2 },
  lich: { inhumation: 1.4, mummification: 1.2, cremation: 0.2 },
  vampire: { inhumation: 1.6, mummification: 1.3, cremation: 0.1 }
};

const EMPTY_MATERIALS: FuneralMaterialNeed = { wood: 0, stone: 0, linen: 0 };

/**
 * Materials consumed per dead person. Coffin timber vs stone sarcophagus vs linen
 * wrapping follows the culture's settlement type; cremation is always a wood pyre.
 *
 * Units are Economy good units (Wood "pile", Stone, Linen). A wooden coffin is a
 * small fraction of a house; a pyre burns several times that in fuel.
 */
export function funeralMaterialsFor(rite: FuneralRite, cultureType: CultureType | undefined): FuneralMaterialNeed {
  const type = cultureType ?? "Generic";
  switch (rite) {
    case "cremation":
      return { ...EMPTY_MATERIALS, wood: 0.12 };
    case "skyBurial":
      return { ...EMPTY_MATERIALS, linen: 0.006 };
    case "waterBurial":
      return { ...EMPTY_MATERIALS, stone: 0.008 };
    case "mummification":
      return { ...EMPTY_MATERIALS, linen: 0.04 };
    case "exposure":
      return { ...EMPTY_MATERIALS, wood: 0.01 };
    case "inhumation":
      if (type === "Highland") return { ...EMPTY_MATERIALS, stone: 0.03 };
      if (type === "Nomadic" || type === "Desert") return { ...EMPTY_MATERIALS, linen: 0.01 };
      return { ...EMPTY_MATERIALS, wood: 0.02 };
    default:
      return { ...EMPTY_MATERIALS };
  }
}

/** Standing-forest coverage harvested per Wood unit consumed (cell forestStock is 0..capacity). */
export const FUNERAL_FOREST_COVERAGE_PER_WOOD = 0.0005;

export function scaleFuneralMaterials(need: FuneralMaterialNeed, people: number): FuneralMaterialNeed {
  if (!(people > 0) || !Number.isFinite(people)) return { ...EMPTY_MATERIALS };
  return {
    wood: need.wood * people,
    stone: need.stone * people,
    linen: need.linen * people
  };
}

export function addFuneralMaterials(a: FuneralMaterialNeed, b: FuneralMaterialNeed): FuneralMaterialNeed {
  return { wood: a.wood + b.wood, stone: a.stone + b.stone, linen: a.linen + b.linen };
}

export function emptyFuneralMaterials(): FuneralMaterialNeed {
  return { ...EMPTY_MATERIALS };
}

export function hasFuneralMaterials(need: FuneralMaterialNeed): boolean {
  return need.wood > 0 || need.stone > 0 || need.linen > 0;
}
