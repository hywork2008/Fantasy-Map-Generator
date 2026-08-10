import { describe, expect, it } from "vitest";
import type { CharacterDomainSkill } from "./individualSkillTypes";
import { getSmithingProductProgramForSkill, SMITHING_PRODUCT_CATALOG } from "./smithingProductProgram";

function skill(proficiency: number, techniques: CharacterDomainSkill["techniques"] = []): CharacterDomainSkill {
  return {
    characterId: 7,
    domain: "blacksmithing",
    proficiency,
    aptitude: "ordinary",
    techniques
  };
}

describe("smithing product program", () => {
  it("catalogues every initial smithing product family with an explicit demand sink", () => {
    expect(SMITHING_PRODUCT_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goodNames: ["Tools"],
          demandSinks: ["agriculture", "extractiveIndustry", "construction"]
        }),
        expect.objectContaining({ goodNames: ["Harnesses"], demandSinks: ["transport"] }),
        expect.objectContaining({ goodNames: ["Arms"], demandSinks: ["military"] }),
        expect.objectContaining({ goodNames: ["Arrows", "Bullets"], demandSinks: ["military"] })
      ])
    );
  });

  it("does not grant an individual efficiency bonus before a master reaches practical competence", () => {
    expect(getSmithingProductProgramForSkill("Tools", skill(40)).outputMultiplier).toBe(1);
  });

  it("applies proficiency and heat treatment to every initial forged product", () => {
    const program = getSmithingProductProgramForSkill("Harnesses", skill(100, ["heatTreatment"]));

    expect(program.masterCharacterId).toBe(7);
    expect(program.outputMultiplier).toBeCloseTo(1.09);
  });

  it("reserves pattern welding's additional benefit for arms", () => {
    const masterSkill = skill(100, ["heatTreatment", "patternWelding"]);

    expect(getSmithingProductProgramForSkill("Arms", masterSkill).outputMultiplier).toBeCloseTo(1.15);
    expect(getSmithingProductProgramForSkill("Tools", masterSkill).outputMultiplier).toBeCloseTo(1.09);
  });
});
