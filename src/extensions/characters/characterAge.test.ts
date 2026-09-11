import { describe, expect, it } from "vitest";
import { formatCharacterAge, migrateDemonAges } from "./characterAge";
import type { Character } from "./characterTypes";

describe("formatCharacterAge", () => {
  it("shows the Human guise age followed by the Demon's actual age", () => {
    expect(
      formatCharacterAge({
        age: 28,
        demonInfiltration: {
          coverStratum: "commoner",
          objective: "maximizeHumanDeaths",
          actualAge: 164,
          collaboratorIds: []
        }
      })
    ).toBe("28 (164)");
  });

  it("shows one age for an ordinary character", () => {
    expect(formatCharacterAge({ age: 42 })).toBe("42");
  });

  it("moves a legacy infiltrator's displayed long age into actualAge", () => {
    const character = {
      i: 3,
      age: 164,
      demonInfiltration: {
        coverStratum: "commoner" as const,
        objective: "maximizeHumanDeaths" as const,
        collaboratorIds: []
      }
    } as Character;
    migrateDemonAges([character]);
    expect(character.age).toBe(49);
    expect(character.demonInfiltration.actualAge).toBe(164);
    expect(formatCharacterAge(character)).toBe("49 (164)");
  });
});
