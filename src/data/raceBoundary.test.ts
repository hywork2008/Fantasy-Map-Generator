import { describe, expect, it } from "vitest";
import { raceBoundaryViolations } from "../../scripts/races/checkBoundaries";

describe("race ownership boundaries", () => {
  it.each([
    'import { raceCatalog } from "../../data/raceCatalog";',
    'export { raceCatalog } from "../../data/raceCatalog";',
    'const catalog = await import("../../data/races.generated.json");',
    'const catalog = require("../../data/races.generated.json");',
    'import { raceCatalog } from "../economy/data/raceCatalog";',
    'import { parseRacesCsv } from "../../../scripts/races/racesCsv";'
  ])("rejects imports, re-exports and dynamic entry points: %s", source => {
    expect(raceBoundaryViolations("src/extensions/characters/arcane.ts", source)).toHaveLength(1);
  });
  it("rejects core access to extension data and tooling", () => {
    expect(
      raceBoundaryViolations(
        "src/data/races.ts",
        'import data from "../extensions/characters/data/races.generated.json";'
      )
    ).toHaveLength(1);
    expect(
      raceBoundaryViolations("src/data/races.ts", 'import { parse } from "../../scripts/races/racesCsv";')
    ).toHaveLength(1);
  });
  it("allows owned data and type-only API contracts", () => {
    expect(
      raceBoundaryViolations("src/extensions/characters/arcane.ts", 'import data from "./data/races.generated.json";')
    ).toEqual([]);
    expect(
      raceBoundaryViolations(
        "src/extensions/characters/arcane.ts",
        'import type { RaceDefinition } from "../../data/raceDefinition";'
      )
    ).toEqual([]);
    expect(
      raceBoundaryViolations(
        "src/extensions/characters/arcane.ts",
        'import { type RaceDefinition } from "../../data/raceDefinition";'
      )
    ).toEqual([]);
  });
});
