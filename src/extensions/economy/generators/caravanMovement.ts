import {
  DEFAULT_HORSE_GRADE_SENSITIVITY,
  DEFAULT_OX_GRADE_SENSITIVITY,
  type GradeSensitivity,
  type MerchantRoutePreference
} from "../../../services/routeGrade";
import { simulationSettings } from "../../../simulation/ports";
import { getCurrentDirection, minmax } from "../../hostUtils";

export interface CaravanMovementSettings {
  /** Wagon/cart base pace on land, km/day. */
  landKmPerDay: number;
  /** Ship base pace at sea, km/day. */
  seaKmPerDay: number;
  /** Shallow-draft vessel pace on a downstream river leg, km/day. */
  riverKmPerDay: number;
  /**
   * 0..1 magnitude of the seasonal wind/current speed swing applied to sea legs (see
   * getSeaConditionMultiplier below). 0 = no correction.
   */
  seaCurrentStrength: number;
  /**
   * 0..1 weight of the per-cell monthly mean wind on sea legs (tailwind faster, headwind slower;
   * see getSeaWindMultiplier and docs/plan/wind-aspect-climate-variability.md §5.8).
   * 0 = no correction. Absent in stored settings from before W3, which then use the default.
   */
  seaWindStrength: number;
  /**
   * 0 = ignore grade for land travel time (legacy planar-only).
   * 1 = full grade effect. Intermediate values blend.
   * Persisted as `fmg-grade-effect-strength` as well for the plan key.
   */
  gradeEffectStrength: number;
  /**
   * Pathfinding preference for land routes.
   * `preferSpeed` minimizes travel days; `avoidHardPass` penalizes hard/extreme grades.
   */
  merchantRoutePreference: MerchantRoutePreference;
  /** Stored-settings schema version; see SETTINGS_VERSION. */
  settingsVersion?: number;
}

/**
 * 2: the sea current became on by default (seaCurrentStrength 0 → 0.3). Blobs saved before that
 * stored the old default 0 whenever any other movement setting was touched; those are lifted to
 * the new default once, after which a deliberate 0 is kept.
 */
const SETTINGS_VERSION = 2;

const DEFAULT_MOVEMENT_SETTINGS: CaravanMovementSettings = {
  landKmPerDay: 32,
  seaKmPerDay: 60,
  riverKmPerDay: 72,
  seaCurrentStrength: 0.3,
  settingsVersion: SETTINGS_VERSION,
  seaWindStrength: 0.5,
  gradeEffectStrength: 1,
  merchantRoutePreference: "preferSpeed"
};

const STORAGE_KEY = "caravan-movement";
const GRADE_STRENGTH_KEY = "fmg-grade-effect-strength";
const ROUTE_PREF_KEY = "fmg-merchant-route-preference";

export interface DraftAnimalType {
  id: string;
  name: string;
  /** Multiplier applied to landKmPerDay for a caravan pulled by this animal. */
  speedMultiplier: number;
  /** Maximum cargo slots that one animal can pull when attached to a cart or wagon. */
  towCapacitySlots: number;
  /** Direct cargo capacity for a pack animal. Omit for animals represented only as draft teams. */
  cargoCapacitySlots?: number;
  /** How harshly grade slows this animal (Phase 1). */
  gradeSensitivity: GradeSensitivity;
}

/**
 * Registry of land draft-animal types. "horse" is the standard pace (speedMultiplier 1, i.e.
 * landKmPerDay unmodified) and today's default for every caravan, including rural/novice
 * merchants. "ox" is half as fast. Add more entries (fantasy dragons, etc.) here as later
 * merchant tiers are introduced — nothing else in the movement calculation needs to change,
 * only whatever future logic assigns a caravan's draftAnimalId.
 */
export const DRAFT_ANIMAL_TYPES: Record<string, DraftAnimalType> = {
  horse: {
    id: "horse",
    name: "Horse",
    speedMultiplier: 1,
    towCapacitySlots: 80,
    cargoCapacitySlots: 18,
    gradeSensitivity: DEFAULT_HORSE_GRADE_SENSITIVITY
  },
  ox: {
    id: "ox",
    name: "Ox",
    speedMultiplier: 0.5,
    towCapacitySlots: 120,
    gradeSensitivity: DEFAULT_OX_GRADE_SENSITIVITY
  }
};

export const DEFAULT_DRAFT_ANIMAL_ID = "horse";

export function getDraftAnimalType(id: string | undefined): DraftAnimalType {
  return (id && DRAFT_ANIMAL_TYPES[id]) || DRAFT_ANIMAL_TYPES[DEFAULT_DRAFT_ANIMAL_ID];
}

function parseStoredPreference(raw: unknown): MerchantRoutePreference {
  return raw === "avoidHardPass" ? "avoidHardPass" : "preferSpeed";
}

function parseStoredStrength(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return minmax(n, 0, 1);
}

function loadSettings(): CaravanMovementSettings {
  let options: CaravanMovementSettings = { ...DEFAULT_MOVEMENT_SETTINGS };
  try {
    const stored = simulationSettings.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<CaravanMovementSettings>;
      options = {
        ...DEFAULT_MOVEMENT_SETTINGS,
        ...parsed,
        merchantRoutePreference: parseStoredPreference(
          parsed.merchantRoutePreference ?? simulationSettings.getItem(ROUTE_PREF_KEY)
        ),
        gradeEffectStrength:
          parseStoredStrength(parsed.gradeEffectStrength) ??
          parseStoredStrength(simulationSettings.getItem(GRADE_STRENGTH_KEY)) ??
          DEFAULT_MOVEMENT_SETTINGS.gradeEffectStrength,
        settingsVersion: SETTINGS_VERSION
      };
      if ((parsed.settingsVersion ?? 1) < 2 && !(Number(parsed.seaCurrentStrength) > 0)) {
        options.seaCurrentStrength = DEFAULT_MOVEMENT_SETTINGS.seaCurrentStrength;
      }
    } else {
      // Plan keys may exist even when the bundled caravan-movement blob does not.
      const strength = parseStoredStrength(simulationSettings.getItem(GRADE_STRENGTH_KEY));
      const pref = simulationSettings.getItem(ROUTE_PREF_KEY);
      if (strength !== undefined) options.gradeEffectStrength = strength;
      if (pref) options.merchantRoutePreference = parseStoredPreference(pref);
    }
  } catch (e) {
    console.warn("Failed to load caravan-movement options from simulation settings", e);
  }
  return options;
}

export class CaravanMovementModule {
  private options: CaravanMovementSettings = loadSettings();

  getOptions(): Readonly<CaravanMovementSettings> {
    return this.options;
  }

  getDefaultOptions(): Readonly<CaravanMovementSettings> {
    return DEFAULT_MOVEMENT_SETTINGS;
  }

  configure(opts: Partial<CaravanMovementSettings>): void {
    const next: CaravanMovementSettings = { ...this.options, ...opts };
    if (opts.seaWindStrength !== undefined) {
      next.seaWindStrength = minmax(opts.seaWindStrength, 0, 1);
    }
    if (opts.gradeEffectStrength !== undefined) {
      next.gradeEffectStrength = minmax(opts.gradeEffectStrength, 0, 1);
    }
    if (opts.merchantRoutePreference !== undefined) {
      next.merchantRoutePreference = parseStoredPreference(opts.merchantRoutePreference);
    }
    this.options = next;
    try {
      simulationSettings.setItem(STORAGE_KEY, JSON.stringify(this.options));
      simulationSettings.setItem(GRADE_STRENGTH_KEY, String(this.options.gradeEffectStrength));
      simulationSettings.setItem(ROUTE_PREF_KEY, this.options.merchantRoutePreference);
    } catch (e) {
      console.warn("Failed to persist caravan-movement options to simulation settings", e);
    }
  }
}

export const CaravanMovement = new CaravanMovementModule();

/**
 * A single-cell sample of the real per-cell ocean current field (docs/simulation/ocean-currents.md)
 * at a sea leg's starting grid cell: direction in degrees plus a 0-255 speed.
 */
export interface OceanCurrentSample {
  angleDeg: number;
  speed: number;
}

/**
 * Speed multiplier for a sea leg from `fromPoint` to `toPoint`. `strength` is the
 * user-configurable `CaravanMovementSettings.seaCurrentStrength` (default 0.3; 0 turns it off).
 * Both the trade ETA and the caravan's baked legs apply it through getWaterSegmentSpeedKmPerDay.
 *
 * When `current` is given (a real per-cell sample resolved by the caller via
 * `pack.cells.g`/`grid.cells.currentAngle`/`currentSpeed`), the multiplier comes from projecting
 * that current onto the leg's actual travel direction — a smooth 360° read instead of a single
 * east/west sign. Falls back to the coarse global seasonal bias
 * (`getCurrentDirection`, docs/simulation/seasons.md, the same one
 * src/generators/regimentMovement.ts applies to naval fleets) whenever no per-cell sample is
 * available, e.g. a route leg with no cell id or a map generated before this field existed.
 */
export function getSeaConditionMultiplier(
  fromPoint: readonly [number, number],
  toPoint: readonly [number, number],
  month: number,
  strength: number,
  current?: OceanCurrentSample | null
): number {
  if (strength === 0) return 1;

  const dx = toPoint[0] - fromPoint[0];
  const dy = toPoint[1] - fromPoint[1];

  if (current && current.speed > 0) {
    const edgeLength = Math.hypot(dx, dy);
    if (edgeLength > 0) {
      const angleRad = (current.angleDeg * Math.PI) / 180;
      const currentVx = Math.cos(angleRad) * current.speed;
      const currentVy = Math.sin(angleRad) * current.speed;
      // Signed projection of the current onto the travel direction, normalized by the 0-255
      // current-speed scale: +1 = fully with the current, -1 = fully against it.
      const alignment = minmax((currentVx * dx + currentVy * dy) / edgeLength / 255, -1, 1);
      return minmax(1 + alignment * strength, 0.1, 2);
    }
  }

  if (dx === 0) return 1;
  const travelingEast = dx > 0;
  const currentFavorsEast = getCurrentDirection(month) === 1;
  const withCurrent = travelingEast === currentFavorsEast;
  const multiplier = withCurrent ? 1 + strength : 1 - strength;
  return minmax(multiplier, 0.1, 2);
}

/** Monthly mean surface wind at a sea leg's starting grid cell, m/s (east / north positive). */
export interface SeaWindSample {
  u: number;
  v: number;
}

/** Along-track wind (m/s) that gives the full ±SEA_WIND_MAX_EFFECT at strength 1. */
export const SEA_WIND_REFERENCE_SPEED = 8;
/** Largest fractional speed change from wind at strength 1. Uncalibrated initial candidate. */
export const SEA_WIND_MAX_EFFECT = 0.5;

/**
 * Speed multiplier from the wind component along a sea leg (map points: x east, y south).
 * A tailwind speeds the ship up, a headwind (tacking) slows it, a crosswind (beam reach) leaves
 * it unchanged. Returns 1 without a sample or at strength 0.
 */
export function getSeaWindMultiplier(
  fromPoint: readonly [number, number],
  toPoint: readonly [number, number],
  strength: number,
  wind?: SeaWindSample | null
): number {
  if (!wind || !(strength > 0)) return 1;
  const dx = toPoint[0] - fromPoint[0];
  const dyNorth = -(toPoint[1] - fromPoint[1]);
  const length = Math.hypot(dx, dyNorth);
  if (!(length > 0)) return 1;
  const along = (wind.u * dx + wind.v * dyNorth) / length;
  const effect = minmax(along / SEA_WIND_REFERENCE_SPEED, -1, 1) * SEA_WIND_MAX_EFFECT;
  return minmax(1 + effect * minmax(strength, 0, 1), 0.1, 2);
}
