import { describe, expect, it } from "vitest";
import source from "../../docs/plan/data/races-relations.csv?raw";
import { exportRaceRelationsCsv, parseRaceRelationsCsv } from "../../scripts/races/racesRelationsCsv";
import { CROSS_RACE_AESTHETIC_READABILITY } from "../extensions/characters/appearance";
import generated from "../extensions/characters/data/raceRelations.generated.json";
import { RACE_DEFINITIONS } from "./races";

describe("race relationship CSV", () => {
  it("round-trips the compiled relationships and supplies asymmetric game values", () => {
    expect(parseRaceRelationsCsv(source, RACE_DEFINITIONS)).toEqual(generated);
    expect(parseRaceRelationsCsv(exportRaceRelationsCsv(generated, RACE_DEFINITIONS), RACE_DEFINITIONS)).toEqual(
      generated
    );
    for (const r of generated)
      expect(CROSS_RACE_AESTHETIC_READABILITY[r.observerKey]?.[r.targetKey]).toBe(r.readability);
    expect(CROSS_RACE_AESTHETIC_READABILITY.human?.elf).not.toBe(CROSS_RACE_AESTHETIC_READABILITY.elf?.human);
  });
  it.each([
    "human,missing,0.5",
    "human,human,0.5",
    "human,elf,NaN",
    "human,elf,1.1",
    "human,elf,-0.1",
    "human,elf,",
    "human,elf,0.5\nhuman,elf,0.7"
  ])("rejects invalid references, values and duplicate pairs: %s", row => {
    expect(() => parseRaceRelationsCsv(`observer_key,target_key,readability\n${row}\n`, RACE_DEFINITIONS)).toThrow(
      /record/
    );
  });
  it("accepts new species keys, reordered headers, BOM and CRLF", () => {
    expect(
      parseRaceRelationsCsv('\uFEFFreadability,target_key,observer_key\r\n0.3,"new_folk",human\r\n', [
        ...RACE_DEFINITIONS,
        { key: "new_folk" }
      ])
    ).toEqual([{ observerKey: "human", targetKey: "new_folk", readability: 0.3 }]);
  });
});
