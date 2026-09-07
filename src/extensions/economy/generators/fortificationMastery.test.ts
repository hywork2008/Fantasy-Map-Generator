import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getIndividualSkills,
  initEconomyContext,
  setGuildKnowledgeStocks,
  setIndividualSkills
} from "../economyContext";
import {
  applyFortificationQualityOnWorks,
  computeFortificationQuality,
  DEFAULT_FORTIFICATION_QUALITY,
  FortificationMastery,
  isMilitaryFortificationCandidate,
  MILITARY_ENGINEERING_THRESHOLD
} from "./fortificationMastery";
import { getIndividualSkill } from "./individualSkillMastery";

function officer(overrides: {
  i: number;
  engineering: number;
  title?: string;
  dead?: boolean;
  location?: number;
  state?: number;
}) {
  return {
    i: overrides.i,
    dead: overrides.dead ?? false,
    location: overrides.location,
    state: overrides.state ?? 1,
    skills: { martial: 60, prowess: 50, engineering: overrides.engineering, geography: 55 },
    titles: overrides.title
      ? [{ title: overrides.title, entityType: "state", entityId: 1 }]
      : [{ title: "Commander", entityType: "state", entityId: 1 }]
  };
}

describe("FortificationMastery", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    setIndividualSkills([]);
    setGuildKnowledgeStocks([]);
    worldContext.pack = {
      characters: [
        officer({ i: 7, engineering: 80 }),
        officer({ i: 8, engineering: 40 }),
        officer({ i: 9, engineering: 90, title: "Steward" })
      ],
      burgs: [0, { i: 1, state: 1, walls: 1, citadel: 1 }, { i: 2, state: 1, walls: 0, citadel: 0 }],
      states: [{ i: 0 }, { i: 1 }],
      frontierForts: [{ i: 1, state: 1, cell: 9 }]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("treats only military officers with high engineering as candidates", () => {
    expect(isMilitaryFortificationCandidate(officer({ i: 1, engineering: 80 }) as never)).toBe(true);
    expect(
      isMilitaryFortificationCandidate(officer({ i: 1, engineering: MILITARY_ENGINEERING_THRESHOLD - 1 }) as never)
    ).toBe(false);
    expect(isMilitaryFortificationCandidate(officer({ i: 1, engineering: 90, title: "Steward" }) as never)).toBe(false);
  });

  it("seeds fortification craft only for high-engineering military officers", () => {
    FortificationMastery.generate();

    expect(getIndividualSkill(7, "fortification")?.proficiency).toBeGreaterThan(50);
    expect(getIndividualSkill(8, "fortification")).toBeUndefined();
    expect(getIndividualSkill(9, "fortification")).toBeUndefined();
  });

  it("writes fortification quality onto walled burgs and frontier forts from the best engineer", () => {
    FortificationMastery.generate();

    const burg = worldContext.pack.burgs[1] as { fortificationQuality?: number };
    const unfortified = worldContext.pack.burgs[2] as { fortificationQuality?: number };
    const fort = worldContext.pack.frontierForts[0] as { fortificationQuality?: number };
    expect(burg.fortificationQuality).toBeGreaterThan(DEFAULT_FORTIFICATION_QUALITY);
    expect(unfortified.fortificationQuality).toBeUndefined();
    expect(fort.fortificationQuality).toBeGreaterThan(DEFAULT_FORTIFICATION_QUALITY);
  });

  it("does not lower an existing masterpiece when reseeding", () => {
    worldContext.pack.burgs[1].fortificationQuality = 92;
    FortificationMastery.generate();
    expect(worldContext.pack.burgs[1].fortificationQuality).toBe(92);
  });

  it("raises stored quality when new walls are completed", () => {
    FortificationMastery.generate();
    const burg = worldContext.pack.burgs[1] as {
      walls?: number;
      citadel?: number;
      state?: number;
      i?: number;
      fortificationQuality?: number;
    };
    burg.fortificationQuality = 10;
    applyFortificationQualityOnWorks(burg);
    expect(burg.fortificationQuality).toBeGreaterThan(10);
  });

  it("grows the craft once per year for living officers", () => {
    FortificationMastery.settleAnnual();
    const first = getIndividualSkill(7, "fortification")?.proficiency;
    FortificationMastery.settleAnnual();
    expect(getIndividualSkill(7, "fortification")?.proficiency).toBe(first);

    worldContext.options = { year: 501 };
    FortificationMastery.settleAnnual();
    expect(getIndividualSkill(7, "fortification")?.proficiency).toBeGreaterThan(first ?? 0);
  });

  it("discards the craft when the officer dies", () => {
    FortificationMastery.generate();
    worldContext.pack.characters[0].dead = true;
    FortificationMastery.generate();
    expect(getIndividualSkills().filter(skill => skill.characterId === 7)).toEqual([]);
  });

  it("computes quality from craft proficiency and masonry stock without falling below typical walls", () => {
    expect(computeFortificationQuality(undefined, 0)).toBe(DEFAULT_FORTIFICATION_QUALITY);
    expect(computeFortificationQuality(40, 0)).toBe(DEFAULT_FORTIFICATION_QUALITY);
    expect(computeFortificationQuality(80, 0)).toBe(64);
    expect(computeFortificationQuality(80, 1)).toBe(84);
    expect(computeFortificationQuality(100, 1)).toBe(100);
  });
});
