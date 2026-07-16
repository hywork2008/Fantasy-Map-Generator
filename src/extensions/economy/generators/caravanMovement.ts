import { getCurrentDirection, minmax } from "../../hostUtils";

export interface CaravanMovementSettings {
  /** Wagon/cart base pace on land, km/day. */
  landKmPerDay: number;
  /** Ship base pace at sea, km/day. */
  seaKmPerDay: number;
  /**
   * 0..1 magnitude of the seasonal wind/current speed swing applied to sea legs (see
   * getSeaConditionMultiplier below). 0 = no correction.
   */
  seaCurrentStrength: number;
}

const DEFAULT_MOVEMENT_SETTINGS: CaravanMovementSettings = {
  landKmPerDay: 32,
  seaKmPerDay: 60,
  seaCurrentStrength: 0
};

const STORAGE_KEY = "caravan-movement";

export interface DraftAnimalType {
  id: string;
  name: string;
  /** Multiplier applied to landKmPerDay for a caravan pulled by this animal. */
  speedMultiplier: number;
}

/**
 * Registry of land draft-animal types. "horse" is the standard pace (speedMultiplier 1, i.e.
 * landKmPerDay unmodified) and today's default for every caravan, including rural/novice
 * merchants. "ox" is half as fast. Add more entries (fantasy dragons, etc.) here as later
 * merchant tiers are introduced — nothing else in the movement calculation needs to change,
 * only whatever future logic assigns a caravan's draftAnimalId.
 */
export const DRAFT_ANIMAL_TYPES: Record<string, DraftAnimalType> = {
  horse: { id: "horse", name: "Horse", speedMultiplier: 1 },
  ox: { id: "ox", name: "Ox", speedMultiplier: 0.5 }
};

export const DEFAULT_DRAFT_ANIMAL_ID = "horse";

export function getDraftAnimalType(id: string | undefined): DraftAnimalType {
  return (id && DRAFT_ANIMAL_TYPES[id]) || DRAFT_ANIMAL_TYPES[DEFAULT_DRAFT_ANIMAL_ID];
}

export class CaravanMovementModule {
  private options: CaravanMovementSettings = { ...DEFAULT_MOVEMENT_SETTINGS };

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) this.options = { ...DEFAULT_MOVEMENT_SETTINGS, ...JSON.parse(stored) };
    } catch (e) {
      console.warn("Failed to load caravan-movement options from localStorage", e);
    }
  }

  getOptions(): Readonly<CaravanMovementSettings> {
    return this.options;
  }

  getDefaultOptions(): Readonly<CaravanMovementSettings> {
    return DEFAULT_MOVEMENT_SETTINGS;
  }

  configure(opts: Partial<CaravanMovementSettings>): void {
    this.options = { ...this.options, ...opts };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.options));
    } catch (e) {
      console.warn("Failed to persist caravan-movement options to localStorage", e);
    }
  }
}

export const CaravanMovement = new CaravanMovementModule();

/**
 * Seasonal wind/current speed multiplier for a sea leg from `fromPoint` to `toPoint`, reusing
 * the single global east/west seasonal reversal src/generators/regimentMovement.ts applies to
 * naval fleets (docs/simulation/seasons.md) rather than inventing a separate per-route model.
 * Unlike the fleet version's fixed 0.7/1.4 swing, magnitude is the user-configurable
 * `strength` (CaravanMovementSettings.seaCurrentStrength) and defaults to 0 (no effect) — trade
 * routes opt in per docs/plan discussion, they don't get an always-on penalty.
 */
export function getSeaConditionMultiplier(
  fromPoint: readonly [number, number],
  toPoint: readonly [number, number],
  month: number,
  strength: number
): number {
  if (strength === 0) return 1;
  const dx = toPoint[0] - fromPoint[0];
  if (dx === 0) return 1;

  const travelingEast = dx > 0;
  const currentFavorsEast = getCurrentDirection(month) === 1;
  const withCurrent = travelingEast === currentFavorsEast;
  const multiplier = withCurrent ? 1 + strength : 1 - strength;
  return minmax(multiplier, 0.1, 2);
}
