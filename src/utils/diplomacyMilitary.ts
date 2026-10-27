import type { State } from "../types/models";
import type { WorldOptions } from "../types/WorldState";
import { isGunpowderEraEnabled, isGunpowderEraMilitaryUnit } from "./gunpowderEra";

export function getDiplomacyMilitaryPersonnel(state: Pick<State, "military">, options: WorldOptions): number {
  return (options.military || []).reduce((total, unit) => {
    if (!isGunpowderEraEnabled(options) && isGunpowderEraMilitaryUnit(unit)) return total;
    const count = state.military?.reduce((sum, regiment) => sum + (regiment.u[unit.name] || 0), 0) || 0;
    return total + count * unit.crew;
  }, 0);
}

export function getMilitaryShare(personnel: number, otherPersonnel: number): number {
  const total = personnel + otherPersonnel;
  return total > 0 ? personnel / total : 0.5;
}
