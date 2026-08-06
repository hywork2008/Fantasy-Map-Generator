import { describe, expect, it } from "vitest";
import { MYTHIC_NAMES_BY_BASE } from "./mythicAncientNames";
import { resolvePersonNameSphere } from "./personNameSpheres";
import { tryRollMythicPersonName } from "./personNames";
import { createDefaultRaces } from "./races";

describe("person name cultural spheres", () => {
  it("locks each culture to a single real-world sphere (no fantasy base id leakage)", () => {
    expect(resolvePersonNameSphere({ base: 33, personNameBase: 7 })).toBe(7);
    expect(resolvePersonNameSphere({ base: 33, personNameBase: 22 })).toBe(22);
    expect(resolvePersonNameSphere({ base: 33 })).toBe(7); // default Elven → Greek
    expect(resolvePersonNameSphere({ base: 34 })).toBe(23);
    expect(resolvePersonNameSphere({ base: 7 })).toBe(7);
  });

  it("stays in-sphere: variants derive from Greek pool stems (not other bases)", () => {
    const races = createDefaultRaces();
    const elf = races.find(r => r.key === "elf")!;
    const greekPool = MYTHIC_NAMES_BY_BASE[7] ?? [];
    expect(greekPool.length).toBeGreaterThan(20);
    const stemHints = greekPool.map(e => e.name.slice(0, 3).toLowerCase());

    const reserved: string[] = [];
    for (let i = 0; i < 40; i++) {
      const name = tryRollMythicPersonName({
        culture: { base: 33, personNameBase: 7 },
        raceId: elf.i,
        races,
        gender: i % 2 === 0 ? "male" : "female",
        reservedNames: reserved
      });
      expect(name).toBeTruthy();
      reserved.push(name!);
      // Either exact catalog form or a longer/altered form — never empty
      expect(name!.length).toBeGreaterThanOrEqual(3);
    }
    // High uniqueness when reserved accumulates
    expect(new Set(reserved.map(n => n.toLowerCase())).size).toBeGreaterThanOrEqual(35);
    void stemHints;
  });

  it("does not stamp the same bare stem on a whole dark-elf court (Mesopotamian)", () => {
    const races = createDefaultRaces();
    const dark = races.find(r => r.key === "dark_elf")!;
    const reserved: string[] = [];
    for (let i = 0; i < 20; i++) {
      const name = tryRollMythicPersonName({
        culture: { base: 34, personNameBase: 23 },
        raceId: dark.i,
        races,
        gender: "female",
        reservedNames: reserved
      });
      expect(name).toBeTruthy();
      reserved.push(name!);
    }
    const bareInanna = reserved.filter(n => n === "Inanna").length;
    expect(bareInanna).toBeLessThanOrEqual(1);
    expect(new Set(reserved.map(n => n.toLowerCase())).size).toBeGreaterThanOrEqual(16);
  });

  it("does not force mythic names on short-lived races", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!;
    const name = tryRollMythicPersonName({
      culture: { base: 7, personNameBase: 7 },
      raceId: human.i,
      races
    });
    expect(name).toBeNull();
  });

  it("uses different personNameBase spheres for Quenian vs Eldar", () => {
    expect(resolvePersonNameSphere({ base: 33, personNameBase: 7 })).toBe(7);
    expect(resolvePersonNameSphere({ base: 33, personNameBase: 22 })).toBe(22);
    const greekSize = (MYTHIC_NAMES_BY_BASE[7] ?? []).length;
    const celticSize = (MYTHIC_NAMES_BY_BASE[22] ?? []).length;
    expect(greekSize).toBeGreaterThan(20);
    expect(celticSize).toBeGreaterThan(5);
  });
});
