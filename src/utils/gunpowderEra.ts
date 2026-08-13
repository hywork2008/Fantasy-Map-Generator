import type { MilitaryUnit } from "../types/models";
import type { WorldOptions } from "../types/WorldState";

/** Maps created before this setting existed retain the former, gunpowder-enabled behavior. */
export function isGunpowderEraEnabled(options: Pick<WorldOptions, "gunpowderEraEnabled">): boolean {
  return options.gunpowderEraEnabled !== false;
}

/**
 * Shared name pattern for personal-firearm military units (e.g. the default "musketeers" unit —
 * see military-generator.ts's getDefaultOptions()). Single source of truth for economy modules
 * that derive Muskets/Bullets/Gunpowder demand from firearm headcount (militaryResources.ts,
 * metallurgWork.ts) so the match stays in sync with the era-gating check below.
 */
const FIREARM_UNIT_NAME_PATTERN = /arquebus|musketeer|musket|firearm|handgun|gunner/;

export function isFirearmMilitaryUnitName(unitName: string): boolean {
  return FIREARM_UNIT_NAME_PATTERN.test(unitName.toLowerCase());
}

export function isGunpowderEraMilitaryUnit(unit: Pick<MilitaryUnit, "name" | "type">): boolean {
  const unitName = unit.name.toLowerCase();
  return (
    unitName === "artillery" ||
    (unit.type === "machinery" && unitName.includes("artillery")) ||
    isFirearmMilitaryUnitName(unitName)
  );
}
