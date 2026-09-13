import type { MilitaryUnit } from "../types/models";

export function ensureCoreMilitaryUnits(military: MilitaryUnit[] | undefined): MilitaryUnit[] {
  const list = military ?? [];
  const names = new Set(list.map(unit => unit.name));
  if (!names.has("spearmen")) {
    const defaultSpearmen: MilitaryUnit = {
      icon: "🔱",
      name: "spearmen",
      rural: 0.07,
      urban: 0.06,
      crew: 1,
      power: 1,
      type: "melee",
      separate: 0
    };
    const infantryIndex = list.findIndex(u => u.name === "infantry");
    if (infantryIndex >= 0) {
      // Split the existing melee pool, including customized recruitment rates.
      const infantry = list[infantryIndex];
      defaultSpearmen.rural = infantry.rural * (7 / 15);
      defaultSpearmen.urban = infantry.urban / 2;
      defaultSpearmen.enabled = infantry.enabled;
      infantry.rural -= defaultSpearmen.rural;
      infantry.urban -= defaultSpearmen.urban;
      list.splice(infantryIndex + 1, 0, defaultSpearmen);
    } else {
      list.push(defaultSpearmen);
    }
  }
  return list;
}
