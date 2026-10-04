import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, shareFromDescriptor } from "../../../io/incomingCity";
import fixture from "../../fixtures/vilealand-shared-bridges-20261004.json";
import type { BurgSiteDescriptor } from "./burgSiteDescriptor";
import { importedRoadsForSite } from "./importedRoads";
import { siteToGeography } from "./siteInput";

describe("shared FMG bridge entrances", () => {
  for (const raw of fixture)
    it(`keeps one city-side entrance and all far-bank branches for burg ${raw.burg.id}`, () => {
      const site = raw as unknown as BurgSiteDescriptor;
      const entry = site.roads.find(r => r.sharedCrossingId !== undefined)!;
      expect(entry.sharedBranches).toHaveLength(2);
      expect(entry.sharedBranches!.every(b => entry.sharedRouteIds!.includes(b.routeId))).toBe(true);
      const imported = importedRoadsForSite(site);
      const sourceIndex = site.roads.indexOf(entry);
      expect(imported.filter(r => r.sourceIndex === sourceIndex)).toHaveLength(1);
      expect(imported.find(r => r.sourceIndex === sourceIndex)?.riverLanding).toBe(true);
      expect(siteToGeography(site, true).importedRoads?.find(r => r.sourceIndex === sourceIndex)?.riverLanding).toBe(
        true
      );
      const shared = decodeShare(encodeShare(shareFromDescriptor(site)!))!;
      expect(shared.descriptor?.roads.find(r => r.sharedCrossingId !== undefined)).toEqual(entry);
      const crossing = site.fixedCrossings!.crossings.find(c => c.id === entry.sharedCrossingId)!;
      const deck = [crossing.deckB[0] - crossing.deckA[0], crossing.deckB[1] - crossing.deckA[1]];
      expect(Math.abs(deck[0] * crossing.tangent[0] + deck[1] * crossing.tangent[1])).toBeLessThan(1e-6);
      expect(entry.sharedBranches!.every(b => b.path.length >= 5)).toBe(true);
      for (const branch of entry.sharedBranches!) {
        const a = branch.path[2],
          b = branch.path[3];
        expect(Math.abs((b[0] - a[0]) * crossing.tangent[0] + (b[1] - a[1]) * crossing.tangent[1])).toBeLessThan(1e-6);
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(Math.hypot(...deck), 6);
      }
    });
});
