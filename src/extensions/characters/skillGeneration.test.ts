import { describe, expect, it } from "vitest";
import type { CharacterSkills } from "./characterTypes";
import {
  applyBackgroundSkillBias,
  PRIMARY_SKILL_MIN,
  ROLE_SKILL_BIAS,
  rollCharacterSkills,
  SKILL_BASE_MEAN,
  skillMeanFor
} from "./skillGeneration";

describe("skillMeanFor", () => {
  it("centers untrained skills on the baseline median", () => {
    expect(skillMeanFor("martial").mean).toBe(SKILL_BASE_MEAN);
    expect(skillMeanFor("martial").min).toBe(1);
  });

  it("pulls primary skills into a competent professional band with a soft floor", () => {
    const stewardship = skillMeanFor("stewardship", { primarySkill: "stewardship" });
    expect(stewardship.mean).toBeGreaterThanOrEqual(60);
    expect(stewardship.min).toBe(PRIMARY_SKILL_MIN);

    // Martial primary is colder than other offices — competent, not legendary.
    const martial = skillMeanFor("martial", { primarySkill: "martial" });
    expect(martial.mean).toBeGreaterThanOrEqual(55);
    expect(martial.mean).toBeLessThan(70);
    expect(martial.min).toBe(PRIMARY_SKILL_MIN);
  });

  it("depresses martial for merchants and elevates it for commanders", () => {
    const merchant = skillMeanFor("martial", { roleClass: "merchant" }).mean;
    const commander = skillMeanFor("martial", { roleClass: "commander" }).mean;
    expect(merchant).toBeLessThan(SKILL_BASE_MEAN - 10);
    expect(commander).toBeGreaterThan(SKILL_BASE_MEAN + 5);
    expect(commander).toBeGreaterThan(merchant + 15);
  });

  it("elevates stewardship for merchants and prowess modestly for commanders", () => {
    expect(skillMeanFor("stewardship", { roleClass: "merchant" }).mean).toBeGreaterThan(60);
    // Commander prowess sits a little above baseline, not mid-60s+.
    expect(skillMeanFor("prowess", { roleClass: "commander" }).mean).toBeGreaterThan(SKILL_BASE_MEAN);
    expect(skillMeanFor("prowess", { roleClass: "commander" }).mean).toBeLessThan(SKILL_BASE_MEAN + 10);
  });

  it("keeps commander martial primary below the old 80+ ceiling band", () => {
    // Previously primary+commander stacked to ~81; target is mid-60s so 100s stay rare.
    const { mean } = skillMeanFor("martial", { primarySkill: "martial", roleClass: "commander" });
    expect(mean).toBeGreaterThanOrEqual(60);
    expect(mean).toBeLessThanOrEqual(70);
  });
});

describe("rollCharacterSkills", () => {
  it("keeps primary skills at or above the professional floor", () => {
    for (let i = 0; i < 40; i++) {
      const skills = rollCharacterSkills({ primarySkill: "martial", roleClass: "commander" });
      expect(skills.martial).toBeGreaterThanOrEqual(PRIMARY_SKILL_MIN);
      expect(skills.martial).toBeLessThanOrEqual(100);
    }
  });

  it("makes merchant martial averages far below commander martial averages", () => {
    const n = 200;
    let merchantSum = 0;
    let commanderSum = 0;
    for (let i = 0; i < n; i++) {
      merchantSum += rollCharacterSkills({ roleClass: "merchant", primarySkill: "stewardship" }).martial;
      commanderSum += rollCharacterSkills({ roleClass: "commander", primarySkill: "martial" }).martial;
    }
    const merchantAvg = merchantSum / n;
    const commanderAvg = commanderSum / n;
    expect(merchantAvg).toBeLessThan(45);
    // Good officers cluster mid-60s, not high-80s/100.
    expect(commanderAvg).toBeGreaterThan(55);
    expect(commanderAvg).toBeLessThan(75);
    expect(commanderAvg - merchantAvg).toBeGreaterThan(20);
  });

  it("rarely produces martial geniuses among merchants", () => {
    const n = 300;
    let geniuses = 0;
    for (let i = 0; i < n; i++) {
      if (rollCharacterSkills({ roleClass: "merchant", primarySkill: "stewardship" }).martial >= 80) {
        geniuses++;
      }
    }
    // Uniform 1–100 would put ~21% at ≥80; we expect well under 3%.
    expect(geniuses / n).toBeLessThan(0.03);
  });

  it("rarely caps commanders at martial 100", () => {
    const n = 400;
    let atCap = 0;
    for (let i = 0; i < n; i++) {
      if (rollCharacterSkills({ roleClass: "commander", primarySkill: "martial" }).martial >= 100) {
        atCap++;
      }
    }
    // With mean ~64 and σ=16, P(≥100) is a few percent — not ~30% as before.
    expect(atCap / n).toBeLessThan(0.08);
  });
});

describe("applyBackgroundSkillBias", () => {
  it("raises prowess for military-camp upbringing and lowers martial for merchant-born", () => {
    const skills: CharacterSkills = {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    };
    applyBackgroundSkillBias(skills, "merchant_born", "merchant_quarter");
    expect(skills.martial).toBeLessThan(50);
    expect(skills.stewardship).toBeGreaterThan(50);

    const camp: CharacterSkills = { ...skills, martial: 50, prowess: 50, stewardship: 50 };
    applyBackgroundSkillBias(camp, "commoner", "military_camp");
    expect(camp.prowess).toBeGreaterThan(50);
    expect(camp.martial).toBeGreaterThan(50);
  });

  it("caps combined martial/prowess background deltas at ±10", () => {
    const skills: CharacterSkills = {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    };
    applyBackgroundSkillBias(skills, "slave_born", "military_camp");
    expect(skills.prowess).toBeLessThanOrEqual(50 + 10);
    expect(skills.martial).toBeLessThanOrEqual(50 + 10);
  });
});

describe("ROLE_SKILL_BIAS coverage", () => {
  it("defines a bias table for every role class", () => {
    const roles = Object.keys(ROLE_SKILL_BIAS);
    expect(roles).toEqual(
      expect.arrayContaining([
        "ruler",
        "central_officer",
        "commander",
        "province_lord",
        "merchant",
        "religious",
        "ordinary"
      ])
    );
  });
});
