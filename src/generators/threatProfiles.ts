/**
 * Culture-set threat spawn profiles for Danger / monsters.
 *
 * highFantasy: frontier oikoumene — rarity 1–2 moderate scatter, rare 3, no 4–5.
 * darkFantasy: lethal Dark Fantasy ladder including regional/calamity threats.
 *
 * Spec: docs/plan/wild-oikoumene-frontier.md
 */

export type ThreatCultureMode = "none" | "highFantasy" | "darkFantasy";

export interface ThreatRarityBand {
  rarity: number;
  min: number;
  max: number;
  power: number;
  type: string;
}

export interface ThreatSpawnProfile {
  mode: ThreatCultureMode;
  /** Preferred danger aggregation for this mood. */
  threatCalculation: "additive" | "max" | "nonlinear";
  bands: readonly ThreatRarityBand[];
}

/** High Fantasy frontier: local beasts, occasional greater threat; no calamities. */
export const HIGH_FANTASY_THREAT_PROFILE: ThreatSpawnProfile = {
  mode: "highFantasy",
  threatCalculation: "max",
  bands: [
    { rarity: 3, min: 0, max: 2, power: 14, type: "Greater Monster" },
    { rarity: 2, min: 12, max: 24, power: 8, type: "Dire Beast" },
    { rarity: 1, min: 25, max: 45, power: 5, type: "Beast" }
  ]
};

/**
 * Dark Fantasy defaults (aligned with historical optionsState dangerRarity*).
 * Rarity 4–5 remain for apocalyptic pressure; not used by highFantasy.
 */
export const DARK_FANTASY_THREAT_PROFILE: ThreatSpawnProfile = {
  mode: "darkFantasy",
  threatCalculation: "additive",
  bands: [
    { rarity: 5, min: 1, max: 2, power: 50, type: "Calamity" },
    { rarity: 4, min: 2, max: 4, power: 30, type: "Arch-Beast" },
    { rarity: 3, min: 5, max: 10, power: 20, type: "Greater Monster" },
    { rarity: 2, min: 8, max: 16, power: 10, type: "Dire Beast" },
    { rarity: 1, min: 20, max: 40, power: 5, type: "Beast" }
  ]
};

export function resolveThreatCultureMode(culturesSet: string | undefined | null): ThreatCultureMode {
  if (culturesSet === "highFantasy") return "highFantasy";
  if (culturesSet === "darkFantasy") return "darkFantasy";
  return "none";
}

export function getThreatSpawnProfile(culturesSet: string | undefined | null): ThreatSpawnProfile | null {
  const mode = resolveThreatCultureMode(culturesSet);
  if (mode === "highFantasy") return HIGH_FANTASY_THREAT_PROFILE;
  if (mode === "darkFantasy") return DARK_FANTASY_THREAT_PROFILE;
  return null;
}

/** Fantasy culture sets that should default to frontier settlement (limited oikoumene). */
export function culturesSetUsesFrontierSettlement(culturesSet: string | undefined | null): boolean {
  return culturesSet === "highFantasy" || culturesSet === "darkFantasy";
}
