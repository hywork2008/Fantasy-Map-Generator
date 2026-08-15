import { describe, expect, it } from "vitest";
import {
  applyRacePersonNameSpheres,
  DEFAULT_RACE_PERSON_NAME_SPHERES,
  parseRacePersonNameMapping,
  resolveRacePersonNameMapping
} from "./racePersonNameConfig";

describe("racePersonNameConfig", () => {
  it("defaults match High Fantasy dual-sphere races", () => {
    expect(DEFAULT_RACE_PERSON_NAME_SPHERES.elf).toEqual({ primary: 7, alternate: 22 });
    expect(DEFAULT_RACE_PERSON_NAME_SPHERES.dark_elf).toEqual({ primary: 23, alternate: 42 });
    expect(DEFAULT_RACE_PERSON_NAME_SPHERES.dwarf).toEqual({ primary: 6, alternate: 0 });
    expect(DEFAULT_RACE_PERSON_NAME_SPHERES.demon).toEqual({ primary: 23 });
    expect(DEFAULT_RACE_PERSON_NAME_SPHERES.beastfolk).toEqual({ primary: null });
  });

  it("applyRacePersonNameSpheres stamps primary then alternate by race order", () => {
    const cultures = [
      { name: "Quenian", base: 33, raceKey: "elf" as const },
      { name: "Eldar", base: 33, raceKey: "elf" as const },
      { name: "Trow", base: 34, raceKey: "dark_elf" as const },
      { name: "Lothian", base: 34, raceKey: "dark_elf" as const },
      { name: "Kobold", base: 36, raceKey: "goblin" as const }
    ];
    const out = applyRacePersonNameSpheres(cultures);
    expect(out[0].personNameBase).toBe(7);
    expect(out[1].personNameBase).toBe(22);
    expect(out[2].personNameBase).toBe(23);
    expect(out[3].personNameBase).toBe(42);
    expect(out[4].personNameBase).toBeUndefined();
  });

  it("user overrides replace defaults for a race", () => {
    const cultures = [
      { name: "Trow", base: 34, raceKey: "dark_elf" as const, personNameBase: 23 },
      { name: "Lothian", base: 34, raceKey: "dark_elf" as const, personNameBase: 42 }
    ];
    const out = applyRacePersonNameSpheres(cultures, {
      dark_elf: { primary: 6, alternate: 22 } // Nordic / Celtic
    });
    expect(out[0].personNameBase).toBe(6);
    expect(out[1].personNameBase).toBe(22);
  });

  it("null primary clears personNameBase (Markov)", () => {
    const cultures = [{ name: "Trow", base: 34, raceKey: "dark_elf" as const, personNameBase: 23 }];
    const out = applyRacePersonNameSpheres(cultures, { dark_elf: { primary: null } });
    expect(out[0].personNameBase).toBeUndefined();
  });

  it("parseRacePersonNameMapping accepts JSON-like objects", () => {
    const parsed = parseRacePersonNameMapping({
      elf: { primary: 7, alternate: 22 },
      dark_elf: { primary: "23" },
      junk: { primary: "nope" }
    });
    expect(parsed.elf).toEqual({ primary: 7, alternate: 22 });
    expect(parsed.dark_elf).toEqual({ primary: 23 });
    expect(parsed.junk).toBeUndefined();
  });

  it("resolveRacePersonNameMapping merges user onto defaults", () => {
    const resolved = resolveRacePersonNameMapping({ dark_elf: { primary: 12 } });
    expect(resolved.dark_elf.primary).toBe(12);
    expect(resolved.elf.primary).toBe(7);
  });
});
