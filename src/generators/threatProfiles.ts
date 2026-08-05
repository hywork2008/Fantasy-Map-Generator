/**
 * Culture-set threat spawn profiles for Danger / monsters.
 *
 * highFantasy: frontier oikoumene — rarity 1–2 moderate scatter, rare 3, no 4–5.
 * darkFantasy: lethal Dark Fantasy ladder including regional/calamity threats.
 *
 * Spawn counts / power / threatCalculation are driven by Options (Danger tab) at
 * generate time. Profiles supply the recommended defaults applied when the user
 * selects a fantasy culture set (see applyThreatProfileDefaults).
 *
 * Spec: docs/plan/wild-oikoumene-frontier.md
 */

import type { ThreatCalculationMode } from "./dangerField";

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
  /** Recommended danger aggregation for this mood (seeded into Options on culture-set change). */
  threatCalculation: ThreatCalculationMode;
  bands: readonly ThreatRarityBand[];
}

/** Slice of Options used to build spawn bands and aggregation mode. */
export interface ThreatDangerOptions {
  threatCalculation: ThreatCalculationMode;
  dangerRarity5Min: number;
  dangerRarity5Max: number;
  dangerRarity5Power: number;
  dangerRarity5Type: string;
  dangerRarity4Min: number;
  dangerRarity4Max: number;
  dangerRarity4Power: number;
  dangerRarity4Type: string;
  dangerRarity3Min: number;
  dangerRarity3Max: number;
  dangerRarity3Power: number;
  dangerRarity3Type: string;
  dangerRarity1Min: number;
  dangerRarity1Max: number;
  dangerRarity1Power: number;
  dangerRarity1Type: string;
}

/** Option keys written when applying a fantasy threat profile. */
export type ThreatDangerOptionPatch = Partial<ThreatDangerOptions>;

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

/**
 * Aggregation mode for danger paint. Always prefers the user-facing Options
 * value so Threat calculation changes actually affect the field.
 */
export function resolveThreatCalculation(
  options?: Pick<ThreatDangerOptions, "threatCalculation"> | null
): ThreatCalculationMode {
  const mode = options?.threatCalculation;
  if (mode === "additive" || mode === "max" || mode === "nonlinear") return mode;
  return "additive";
}

/**
 * Build spawn bands from the Danger Options tab (source of truth at generate time).
 *
 * The UI exposes a combined "Rarity 1–2" control (`dangerRarity1*`). Fantasy
 * profiles may still define a separate rarity-2 Dire Beast band; that band is
 * kept from the profile so High Fantasy retains its frontier texture without a
 * second slider.
 *
 * High Fantasy never spawns rarity 4–5 even if leftover Dark Fantasy option
 * values remain in local state (sticky defaults). Switch to Dark Fantasy for
 * calamities / arch-beasts.
 */
export function buildThreatBandsFromOptions(
  options: ThreatDangerOptions,
  culturesSet: string | undefined | null
): ThreatRarityBand[] | null {
  const profile = getThreatSpawnProfile(culturesSet);
  if (!profile) return null;

  const r3: ThreatRarityBand = {
    rarity: 3,
    min: options.dangerRarity3Min,
    max: options.dangerRarity3Max,
    power: options.dangerRarity3Power,
    type: options.dangerRarity3Type
  };
  const r1: ThreatRarityBand = {
    rarity: 1,
    min: options.dangerRarity1Min,
    max: options.dangerRarity1Max,
    power: options.dangerRarity1Power,
    type: options.dangerRarity1Type
  };

  const bands: ThreatRarityBand[] = [];

  if (profile.mode === "darkFantasy") {
    bands.push(
      {
        rarity: 5,
        min: options.dangerRarity5Min,
        max: options.dangerRarity5Max,
        power: options.dangerRarity5Power,
        type: options.dangerRarity5Type
      },
      {
        rarity: 4,
        min: options.dangerRarity4Min,
        max: options.dangerRarity4Max,
        power: options.dangerRarity4Power,
        type: options.dangerRarity4Type
      }
    );
  }

  bands.push(r3, r1);

  // Preserve profile-defined Dire Beast (r2) texture for fantasy presets.
  const r2 = profile.bands.find(band => band.rarity === 2);
  if (r2) bands.push({ ...r2 });

  return bands;
}

/**
 * Recommended Options values for a fantasy culture set. Applied when the user
 * switches culturesSet so the Danger tab matches the active mood.
 */
export function getThreatOptionDefaults(culturesSet: string | undefined | null): ThreatDangerOptionPatch | null {
  const profile = getThreatSpawnProfile(culturesSet);
  if (!profile) return null;

  const byRarity = (rarity: number): ThreatRarityBand | undefined => profile.bands.find(b => b.rarity === rarity);
  const r5 = byRarity(5);
  const r4 = byRarity(4);
  const r3 = byRarity(3);
  const r1 = byRarity(1);

  return {
    threatCalculation: profile.threatCalculation,
    dangerRarity5Min: r5?.min ?? 0,
    dangerRarity5Max: r5?.max ?? 0,
    dangerRarity5Power: r5?.power ?? 50,
    dangerRarity5Type: r5?.type ?? "Calamity",
    dangerRarity4Min: r4?.min ?? 0,
    dangerRarity4Max: r4?.max ?? 0,
    dangerRarity4Power: r4?.power ?? 30,
    dangerRarity4Type: r4?.type ?? "Arch-Beast",
    dangerRarity3Min: r3?.min ?? 0,
    dangerRarity3Max: r3?.max ?? 0,
    dangerRarity3Power: r3?.power ?? 20,
    dangerRarity3Type: r3?.type ?? "Greater Monster",
    dangerRarity1Min: r1?.min ?? 0,
    dangerRarity1Max: r1?.max ?? 0,
    dangerRarity1Power: r1?.power ?? 5,
    dangerRarity1Type: r1?.type ?? "Beast"
  };
}

/**
 * Fantasy culture sets that should default to marches settlement
 * (moderate oikoumene islands separated by wilderness/danger).
 */
export function culturesSetUsesFrontierSettlement(culturesSet: string | undefined | null): boolean {
  return culturesSet === "highFantasy" || culturesSet === "darkFantasy";
}
