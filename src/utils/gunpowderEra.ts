import type { MilitaryUnit } from "../types/models";
import type { WorldOptions } from "../types/WorldState";

/** Maps created before this setting existed retain the former, gunpowder-enabled behavior. */
export function isGunpowderEraEnabled(options: Pick<WorldOptions, "gunpowderEraEnabled">): boolean {
  return options.gunpowderEraEnabled !== false;
}

export function isGunpowderEraMilitaryUnit(unit: Pick<MilitaryUnit, "name" | "type">): boolean {
  const unitName = unit.name.toLowerCase();
  return unitName === "artillery" || (unit.type === "machinery" && unitName.includes("artillery"));
}
