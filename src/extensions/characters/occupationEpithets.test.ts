import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "./characterTypes";
import { isWarGodEligible, seedOccupationEpithets } from "./occupationEpithets";
import { readEconomyCraftSkill } from "./specializationRuntime";

vi.mock("./specializationRuntime", async () => {
  const actual = await vi.importActual<typeof import("./specializationRuntime")>("./specializationRuntime");
  return { ...actual, readEconomyCraftSkill: vi.fn(() => undefined) };
});

function character(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 55,
    gender: "male",
    culture: 1,
    titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 30,
      diplomacy: 40,
      engineering: 30,
      geography: 40,
      intrigue: 40,
      learning: 40,
      martial: 85,
      prowess: 80,
      stewardship: 40
    },
    personality: {
      boldness: 70,
      compassion: 40,
      greed: 40,
      honor: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 40,
      zeal: 50,
      energy: 70,
      piety: 30,
      guile: 40,
      confidence: 70
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 60,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

const service = {
  campaignName: "Northern War",
  year: 1010,
  opponentStateId: 2,
  side: "defender" as const,
  conduct: "front_assault" as const
};

describe("isWarGodEligible", () => {
  it("fires for seasoned marshals, commanders, warlords, and shoguns without using standing", () => {
    expect(
      isWarGodEligible(
        character({
          militaryRecord: { wars: 3, services: [service, service, service] }
        })
      )
    ).toBe(true);
    expect(
      isWarGodEligible(
        character({
          titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }],
          skills: { ...character().skills, martial: 82, prowess: 78 },
          militaryRecord: { wars: 2, services: [service, service] }
        })
      )
    ).toBe(true);
    expect(
      isWarGodEligible(
        character({
          titles: [{ title: "Warlord", landed: true, entityType: "state", entityId: 1 }],
          skills: { ...character().skills, martial: 88, prowess: 82 },
          militaryRecord: { wars: 2, services: [service, service] }
        })
      )
    ).toBe(true);
    expect(
      isWarGodEligible(
        character({
          titles: [{ title: "Shogun", landed: true, entityType: "state", entityId: 1 }],
          skills: { ...character().skills, martial: 88, prowess: 82 },
          militaryRecord: { wars: 2, services: [service, service] }
        })
      )
    ).toBe(true);
  });

  it("rejects idle banners and martial-only specialists", () => {
    expect(
      isWarGodEligible(
        character({
          skills: { ...character().skills, martial: 70, prowess: 90 },
          militaryRecord: { wars: 3, services: [service, service, service] }
        })
      )
    ).toBe(false);
    expect(
      isWarGodEligible(
        character({
          militaryRecord: { wars: 2, services: [service, service], epithetId: "idle_banner" }
        })
      )
    ).toBe(false);
  });
});

describe("seedOccupationEpithets", () => {
  beforeEach(() => {
    vi.mocked(readEconomyCraftSkill).mockReturnValue(undefined);
  });

  it("assigns war_god fill-if-empty", () => {
    const marshal = character({
      militaryRecord: { wars: 3, services: [service, service, service] }
    });
    seedOccupationEpithets([marshal]);
    expect(marshal.epithets?.some(e => e.id === "war_god")).toBe(true);
    seedOccupationEpithets([marshal]);
    expect(marshal.epithets?.filter(e => e.lineage === "war_legend")).toHaveLength(1);
  });

  it("assigns master_artisan from the Economy seam and skips when Economy is off", () => {
    const mocked = vi.mocked(readEconomyCraftSkill);
    const master = character({
      i: 9,
      titles: [],
      skills: { ...character().skills, engineering: 88 },
      roles: [
        {
          source: "economy",
          kind: "guildMaster",
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Master"
        }
      ]
    });
    mocked.mockReturnValue(undefined);
    seedOccupationEpithets([master]);
    expect(master.epithets?.some(e => e.id === "master_artisan")).toBeFalsy();
    mocked.mockReturnValue({ proficiency: 88, aptitude: "gifted" });
    seedOccupationEpithets([master]);
    expect(master.epithets?.some(e => e.id === "master_artisan")).toBe(true);
  });

  it("assigns magnate and able_minister on rare bands", () => {
    const head = character({
      i: 4,
      titles: [],
      prestige: 70,
      wealth: 200,
      skills: { ...character().skills, stewardship: 80 },
      roles: [
        {
          source: "economy",
          kind: "merchantOrganizationHead",
          entityType: "state",
          entityId: 1,
          label: "Merchant Company Head"
        }
      ]
    });
    const clerk = character({
      i: 5,
      titles: [],
      prestige: 20,
      wealth: 10,
      roles: [
        {
          source: "economy",
          kind: "merchantOrganizationSecretary",
          entityType: "state",
          entityId: 1,
          label: "Merchant Company Secretary"
        }
      ]
    });
    const chancellor = character({
      i: 6,
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }],
      prestige: 60,
      skills: { ...character().skills, diplomacy: 85 }
    });
    seedOccupationEpithets([head, clerk, chancellor]);
    expect(head.epithets?.some(e => e.id === "magnate")).toBe(true);
    expect(clerk.epithets?.some(e => e.id === "magnate")).toBeFalsy();
    expect(chancellor.epithets?.some(e => e.id === "able_minister")).toBe(true);
  });

  it("assigns unscrupulous_merchant from greed and thin honor, taking commerce over magnate", () => {
    const profiteer = character({
      i: 7,
      titles: [],
      prestige: 70,
      wealth: 200,
      skills: { ...character().skills, stewardship: 80 },
      personality: { ...character().personality, greed: 88, honor: 20 },
      roles: [
        {
          source: "economy",
          kind: "merchantOrganizationHead",
          entityType: "state",
          entityId: 1,
          label: "Merchant Company Head"
        }
      ]
    });
    const rival = character({
      i: 8,
      titles: [],
      prestige: 40,
      wealth: 20,
      personality: { ...character().personality, greed: 80, honor: 25 },
      roles: [
        {
          source: "economy",
          kind: "marketRivalMerchant",
          entityType: "market",
          entityId: 1,
          label: "Market Rival Merchant"
        }
      ]
    });
    const honest = character({
      i: 9,
      titles: [],
      prestige: 70,
      wealth: 200,
      skills: { ...character().skills, stewardship: 80 },
      personality: { ...character().personality, greed: 30, honor: 80 },
      roles: [
        {
          source: "economy",
          kind: "merchantOrganizationHead",
          entityType: "state",
          entityId: 1,
          label: "Merchant Company Head"
        }
      ]
    });
    seedOccupationEpithets([profiteer, rival, honest]);
    expect(profiteer.epithets?.some(e => e.id === "unscrupulous_merchant")).toBe(true);
    expect(profiteer.epithets?.some(e => e.id === "magnate")).toBeFalsy();
    expect(rival.epithets?.some(e => e.id === "unscrupulous_merchant")).toBe(true);
    expect(honest.epithets?.some(e => e.id === "magnate")).toBe(true);
    expect(honest.epithets?.some(e => e.id === "unscrupulous_merchant")).toBeFalsy();
  });

  it("assigns prodigy to a high-engineering metallurgy apprentice", () => {
    const apprentice = character({
      age: 16,
      titles: [],
      skills: { ...character().skills, engineering: 92 },
      roles: [
        {
          source: "economy",
          kind: "guildApprentice",
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Apprentice"
        }
      ]
    });
    seedOccupationEpithets([apprentice]);
    expect(apprentice.epithets?.some(e => e.id === "prodigy")).toBe(true);
  });
});
