import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/yayaropuz-20261009.json";
import { frameRoadLegs } from "./frameRoads";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

// Yayaropuz: the town mesh covers the whole 1.5 km frame. FMG trail 456 to
// Yebla runs into the 609 m river with no surveyed crossing, while the Esen
// road already crosses that river on surveyed bridge 29 to the same south
// bank. The trail shares that bridge instead of a second long one.
describe("Yayaropuz (Yebla trail shares the Esen bridge)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;

  it("joins the stranded trail to the surveyed crossing", () => {
    const trail = value.descriptor!.roads.find(r => r.routeId === 456)!;
    expect(trail.sharedCrossingId).toBe(29);
    expect(trail.sharedBranches?.[0].nextBurg?.name).toBe("Yebla");
  });

  it("draws no bridge of its own", () => {
    const legs = frameRoadLegs(value.descriptor!, "beyond-mesh");
    expect(legs.flatMap(l => l.pieces).filter(p => p.kind === "bridge")).toHaveLength(0);
    expect(legs.find(l => l.routeId === 456)).toBeDefined();
  });

  it("still bridges a stranded road when no surveyed crossing spans that river", () => {
    const site = structuredClone(input) as unknown as BurgSiteDescriptor;
    site.fixedCrossings!.crossings = site.fixedCrossings!.crossings.filter(c => c.id !== 29);
    for (const road of site.roads) if (road.sharedCrossingId === 29) delete road.sharedCrossingId;
    const leg = frameRoadLegs(site, "beyond-mesh").find(l => l.routeId === 456)!;
    expect(leg.pieces.map(p => p.kind)).toEqual(["road", "bridge"]);
  });

  it("generates the town", () => {
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;
    expect(city.frameRoads!.some(l => l.routeId === 456)).toBe(true);
  }, 120000);
});
