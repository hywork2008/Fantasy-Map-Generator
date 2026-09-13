import { describe, expect, it } from "vitest";
import type { MilitaryUnit } from "../types/models";
import { ensureCoreMilitaryUnits } from "./coreMilitaryUnits";

describe("core military unit migration", () => {
  it.each([
    [0.15, 0.12],
    [0.3, 0.4],
    [0, 0]
  ])("preserves recruitment totals %s/%s and is idempotent", (rural, urban) => {
    const units: MilitaryUnit[] = [
      { name: "infantry", icon: "⚔️", rural, urban, crew: 1, power: 1, type: "melee", separate: 0 }
    ];
    ensureCoreMilitaryUnits(units);
    expect(units.map(u => u.name)).toEqual(["infantry", "spearmen"]);
    expect(units.reduce((n, u) => n + u.rural, 0)).toBeCloseTo(rural);
    expect(units.reduce((n, u) => n + u.urban, 0)).toBeCloseTo(urban);
    const snapshot = structuredClone(units);
    ensureCoreMilitaryUnits(units);
    expect(units).toEqual(snapshot);
  });
  it("keeps disabled infantry recruitment disabled after splitting", () => {
    const units: MilitaryUnit[] = [
      {
        name: "infantry",
        icon: "",
        rural: 0.15,
        urban: 0.12,
        crew: 1,
        power: 1,
        type: "melee",
        separate: 0,
        enabled: false
      }
    ];
    expect(ensureCoreMilitaryUnits(units)[1].enabled).toBe(false);
  });
});
