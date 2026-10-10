import { describe, expect, it } from "vitest";
import { planGuildFacilities, wantsTannery } from "./guildFacilities";
import type { BurgSiteEconomy, SiteGuild } from "./site/burgSiteEconomy";
import { sanitizeBurgSiteEconomy } from "./site/burgSiteEconomy";

function economy(guilds: SiteGuild[]): BurgSiteEconomy {
  return {
    version: 1,
    year: 1348,
    commerce: { rank: 0, marketCenter: false, merchantHouse: null, mint: false, caravanArrivalRank: 0 },
    guilds,
    storage: [],
    facilities: [],
    tradePartners: []
  };
}

const emptyChapter = (domain: SiteGuild["domain"], prestige = 0.2): SiteGuild => ({
  domain,
  status: "chapter",
  practitioners: 0,
  prestige,
  foundedYear: 1204
});

describe("planGuildFacilities", () => {
  it("builds a hall and yards for a chapter with no craftsmen", () => {
    const plan = planGuildFacilities(
      economy([emptyChapter("textiles", 0.9), emptyChapter("masonry"), emptyChapter("leather")]),
      "highMedieval"
    );
    const textiles = plan.find(facility => facility.domain === "textiles");
    expect(textiles).toMatchObject({
      hall: true,
      belfry: true,
      workshopWeight: 0,
      practitioners: 0,
      ancillary: ["bleachingField"]
    });
    expect(plan.find(facility => facility.domain === "masonry")?.ancillary).toEqual(["stoneYard", "limeKiln"]);
    expect(plan.find(facility => facility.domain === "leather")?.hall).toBe(true);
    expect(wantsTannery(economy([emptyChapter("leather")]), plan)).toBe(true);
  });

  it("keeps the legacy tannery only when no economy profile is attached", () => {
    expect(wantsTannery(undefined, [])).toBe(true);
    const plan = planGuildFacilities(economy([emptyChapter("textiles")]), "highMedieval");
    expect(wantsTannery(economy([emptyChapter("textiles")]), plan)).toBe(false);
  });

  it("gives an informal guild yards and a craftsman weight, but no hall", () => {
    const plan = planGuildFacilities(
      economy([{ domain: "woodworking", status: "informal", practitioners: 4, prestige: 0.4, foundedYear: null }]),
      "lateMedieval"
    );
    expect(plan[0]).toMatchObject({ hall: false, belfry: false, workshopWeight: 4, ancillary: ["timberYard"] });
  });

  it("holds the cloth hall until the high medieval, and printing until the age of exploration", () => {
    const early = planGuildFacilities(economy([emptyChapter("textiles", 1)]), "earlyMedieval");
    expect(early[0].hall).toBe(false);
    expect(early[0].ancillary).toEqual(["bleachingField"]);
    const printing = planGuildFacilities(economy([emptyChapter("printing")]), "lateMedieval");
    expect(printing[0].hall).toBe(false);
    expect(planGuildFacilities(economy([emptyChapter("printing")]), "ageOfExploration")[0].hall).toBe(true);
  });
});

describe("sanitizeBurgSiteEconomy", () => {
  it("keeps a zero-craftsman chapter and drops a guild with an unknown domain", () => {
    const cleaned = sanitizeBurgSiteEconomy({
      version: 1,
      year: 1348,
      guilds: [
        emptyChapter("masonry"),
        { domain: "alchemy", status: "chapter", practitioners: 3, prestige: 1, foundedYear: 1300 }
      ]
    });
    expect(cleaned?.guilds).toEqual([emptyChapter("masonry")]);
    expect(cleaned?.commerce.merchantHouse).toBeNull();
  });

  it("rejects a profile that is not version 1", () => {
    expect(sanitizeBurgSiteEconomy({ version: 2, guilds: [] })).toBeNull();
  });
});
