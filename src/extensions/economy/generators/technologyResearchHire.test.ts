import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getResearchHireApplications,
  getResearchNamedSeats,
  initEconomyContext,
  setConstructionHireApplications,
  setExperimentalWorkshops,
  setMineOperations
} from "../economyContext";
import { characterHasEmploymentCommitment, characterHasResearchCommitment } from "./employmentCommitment";
import { ENGINEERING_WORKSHOP_MIN } from "./technologyBiasApply";
import {
  applyCharacterToResearchJob,
  cancelResearchApplication,
  clearResearchHireState,
  purgeInvalidResearchHireState,
  RESEARCH_PLAYER_HIRE_LAG_DAYS,
  resignResearchJob,
  tickResearchHiring
} from "./technologyResearchHire";

function skills(engineering: number) {
  return {
    artistry: 1,
    diplomacy: 1,
    engineering,
    geography: 1,
    intrigue: 1,
    learning: 1,
    martial: 1,
    prowess: 1,
    stewardship: 1
  };
}

function setupBurg(): void {
  worldContext.pack = {
    burgs: [
      { i: 0, removed: 1 },
      { i: 1, cell: 0, x: 0, y: 0, removed: 0, population: 5, state: 1 }
    ],
    states: [{ i: 0 }, { i: 1, removed: false }],
    characters: [
      {
        i: 10,
        name: "Ada",
        location: 1,
        dead: false,
        roles: [],
        titles: [],
        wealth: 0,
        skills: skills(60)
      }
    ]
  } as unknown as PackedGraph;
}

function seedWorkshop(): void {
  setExperimentalWorkshops([
    {
      burgId: 1,
      sponsorStateId: 1,
      active: true,
      researchers: 2,
      annualBudget: 16,
      experimentRecord: 0,
      lastFundedYear: 1199
    }
  ]);
}

function seedMine(): void {
  setMineOperations([
    {
      i: 7,
      depositId: 1,
      burgId: 1,
      marketId: 1,
      workers: 8,
      technology: 1,
      drainage: 1,
      fuelAccess: 1,
      annualOutputTons: {},
      active: true
    }
  ]);
}

describe("technologyResearchHire", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    clearResearchHireState();
    setupBurg();
  });

  afterEach(() => {
    clearResearchHireState();
    clearEconomyContext();
  });

  it("lets a character apply and reserves a pending seat for RESEARCH_PLAYER_HIRE_LAG_DAYS", () => {
    seedWorkshop();
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    expect(result.ok).toBe(true);
    expect(result.daysRemaining).toBe(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    expect(getResearchHireApplications()).toHaveLength(1);
    expect(getResearchNamedSeats()).toHaveLength(0);
    expect(characterHasResearchCommitment(10)).toBe(true);
  });

  it("rejects apply when character is not in the burg", () => {
    seedWorkshop();
    (worldContext.pack.characters![0] as { location: number }).location = 99;
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Character must be in this burg to apply.");
  });

  it("rejects workshop apply when engineering is below 60", () => {
    seedWorkshop();
    worldContext.pack.characters![0].skills = skills(ENGINEERING_WORKSHOP_MIN - 1);
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Engineering skill of 60 or higher is required for workshop research.");
    expect(getResearchHireApplications()).toHaveLength(0);
  });

  it("rejects workshop apply when the burg has no experimental workshop", () => {
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("No experimental workshop in this burg.");
  });

  it("rejects mine labor apply when the burg has no active mine", () => {
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "mineLaborer" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("No active mine in this burg.");
  });

  it("lets mine labor apply without an engineering gate", () => {
    seedMine();
    worldContext.pack.characters![0].skills = skills(0);
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "mineLaborer" });
    expect(result.ok).toBe(true);
    expect(getResearchHireApplications()[0]?.mineOperationId).toBe(7);
  });

  it("resolves a player application into a named seat after lag", () => {
    seedWorkshop();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    expect(getResearchHireApplications()).toHaveLength(0);
    expect(getResearchNamedSeats()).toEqual([{ burgId: 1, role: "workshopResearcher", characterId: 10 }]);
    const character = worldContext.pack.characters![0];
    expect(character.roles?.some(role => role.kind === "workshopResearcher")).toBe(true);
  });

  it("promotes mine labor with the mine operation id", () => {
    seedMine();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "mineLaborer" });
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    expect(getResearchNamedSeats()).toEqual([{ burgId: 1, role: "mineLaborer", characterId: 10, mineOperationId: 7 }]);
    expect(worldContext.pack.characters![0].roles?.some(role => role.kind === "mineLaborer")).toBe(true);
  });

  it("blocks a second research apply while the first is pending", () => {
    seedWorkshop();
    expect(applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" }).ok).toBe(true);
    const second = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    expect(second.ok).toBe(false);
    expect(second.message).toContain("Already committed");
    expect(characterHasEmploymentCommitment(10)).toBe(true);
  });

  it("blocks research apply while construction is pending", () => {
    seedWorkshop();
    setConstructionHireApplications([{ i: 1, burgId: 1, role: "mason", characterId: 10, daysRemaining: 14 }]);
    const result = applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Already committed");
    expect(getResearchHireApplications()).toHaveLength(0);
  });

  it("cancel withdraws a pending application", () => {
    seedWorkshop();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    const cancel = cancelResearchApplication(10);
    expect(cancel.ok).toBe(true);
    expect(getResearchHireApplications()).toHaveLength(0);
    expect(characterHasResearchCommitment(10)).toBe(false);
  });

  it("resign removes named seat and role", () => {
    seedMine();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "mineLaborer" });
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    const resign = resignResearchJob(10);
    expect(resign.ok).toBe(true);
    expect(getResearchNamedSeats()).toHaveLength(0);
    expect(worldContext.pack.characters![0].roles ?? []).toHaveLength(0);
  });

  it("purges named seats when the character leaves the burg", () => {
    seedWorkshop();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    expect(getResearchNamedSeats()).toHaveLength(1);
    (worldContext.pack.characters![0] as { location: number }).location = 2;
    purgeInvalidResearchHireState();
    expect(getResearchNamedSeats()).toHaveLength(0);
    expect(worldContext.pack.characters![0].roles ?? []).toHaveLength(0);
  });

  it("purges named seats when the character dies", () => {
    seedWorkshop();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    (worldContext.pack.characters![0] as { dead: boolean }).dead = true;
    purgeInvalidResearchHireState();
    expect(getResearchNamedSeats()).toHaveLength(0);
  });

  it("purges a workshop seat when the workshop shuts down", () => {
    seedWorkshop();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    setExperimentalWorkshops([]);
    purgeInvalidResearchHireState();
    expect(getResearchNamedSeats()).toHaveLength(0);
    expect(worldContext.pack.characters![0].roles ?? []).toHaveLength(0);
  });

  it("does not promote an application after the character leaves during lag", () => {
    seedWorkshop();
    applyCharacterToResearchJob({ characterId: 10, burgId: 1, role: "workshopResearcher" });
    (worldContext.pack.characters![0] as { location: number }).location = 2;
    tickResearchHiring(RESEARCH_PLAYER_HIRE_LAG_DAYS);
    expect(getResearchHireApplications()).toHaveLength(0);
    expect(getResearchNamedSeats()).toHaveLength(0);
  });
});
