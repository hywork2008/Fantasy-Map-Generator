import { describe, expect, it } from "vitest";
import { craftDomainsFor, economyWardMix, marketSlotCount, merchantSlotCount } from "./economicWards";
import type { BurgSiteEconomy, SiteGuild } from "./site/burgSiteEconomy";
import type { Cell, Point } from "./types";
import { assignWards } from "./wards";

function guild(domain: SiteGuild["domain"], practitioners: number): SiteGuild {
  return { domain, status: "chapter", practitioners, prestige: 0.2, foundedYear: 1200 };
}

function economy(guilds: SiteGuild[], commerce: Partial<BurgSiteEconomy["commerce"]> = {}): BurgSiteEconomy {
  return {
    version: 1,
    year: 1350,
    commerce: {
      rank: 0,
      marketCenter: false,
      merchantHouse: null,
      mint: false,
      caravanArrivalRank: 0,
      ...commerce
    },
    guilds,
    storage: [],
    facilities: [],
    tradePartners: []
  };
}

describe("economy ward mix", () => {
  it("keeps craftsman streets undifferentiated when every guild has no practitioners", () => {
    const slots = craftDomainsFor([guild("textiles", 0), guild("masonry", 0)]);
    expect(slots).toHaveLength(21);
    expect(slots.every(domain => domain === null)).toBe(true);
  });

  it("splits the 21 craftsman slots by practitioner share", () => {
    const slots = craftDomainsFor([guild("textiles", 3), guild("masonry", 1), guild("leather", 0)]);
    expect(slots.filter(domain => domain === "textiles")).toHaveLength(16);
    expect(slots.filter(domain => domain === "masonry")).toHaveLength(5);
    expect(slots.some(domain => domain === "leather")).toBe(false);
  });

  it("maps commerce rank onto 1–4 merchant slots and adds a market at a market center", () => {
    expect(merchantSlotCount(0)).toBe(1);
    expect(merchantSlotCount(0.25)).toBe(1);
    expect(merchantSlotCount(0.5)).toBe(2);
    expect(merchantSlotCount(0.75)).toBe(3);
    expect(merchantSlotCount(1)).toBe(4);
    expect(marketSlotCount(false)).toBe(2);
    expect(marketSlotCount(true)).toBe(3);
    const mix = economyWardMix(
      economy([guild("woodworking", 4)], { rank: 1, marketCenter: true, caravanArrivalRank: 1 })
    );
    expect(mix.filter(slot => slot.kind === "craftsmen" && slot.craftDomain === "woodworking")).toHaveLength(21);
    expect(mix.filter(slot => slot.kind === "merchant")).toHaveLength(4);
    expect(mix.filter(slot => slot.kind === "market")).toHaveLength(3);
  });

  it("writes the trade onto craftsman cells and leaves a town without a profile unmarked", () => {
    const cells: Cell[] = Array.from({ length: 16 }, (_, id) => {
      const centroid: Point = [id * 24, 0];
      const neighbors = [id - 1, id + 1].filter(next => next >= 0 && next < 16);
      const [cx, cy] = centroid;
      return {
        id,
        site: centroid,
        centroid,
        polygon: [
          [cx - 10, cy - 10],
          [cx + 10, cy - 10],
          [cx + 10, cy + 10],
          [cx - 10, cy + 10]
        ],
        neighbors,
        onBorder: false
      };
    });
    const input = {
      cells,
      urban: new Set(cells.map(cell => cell.id)),
      outskirts: new Set<number>(),
      sea: new Set<number>(),
      borders: [],
      gates: [],
      precincts: [],
      geo: { bounds: [0, 0, 400, 40] as [number, number, number, number], riverCentres: [], roadPaths: [] },
      params: { seed: "ward-mix", cityRadiusMeters: 80, cellSizeMeters: 24, extentMeters: 400, lloydPasses: 0 },
      program: {
        walls: false,
        citadel: false,
        plaza: false,
        temple: false,
        port: false,
        shanty: false,
        capital: false
      },
      shoreline: null,
      waterPolygon: null,
      historicalPeriod: "highMedieval" as const
    };
    const marked = assignWards({ ...input, economy: economy([guild("textiles", 4)]) });
    const crafts = marked.wards.filter(ward => ward.kind === "craftsmen");
    expect(crafts.some(ward => ward.craftDomain === "textiles")).toBe(true);
    expect(crafts.every(ward => ward.craftDomain === "textiles" || ward.craftDomain === undefined)).toBe(true);
    expect(marked.wards.filter(ward => ward.kind !== "craftsmen").every(ward => ward.craftDomain === undefined)).toBe(
      true
    );
    const plain = assignWards(input);
    expect(plain.wards.every(ward => ward.craftDomain === undefined)).toBe(true);
  });
});
