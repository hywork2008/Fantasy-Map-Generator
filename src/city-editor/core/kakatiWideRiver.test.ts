import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/kakati-20261009.json";
import { pointInPolygon } from "./gen/geom";
import { siteToGeography } from "./gen/site/siteInput";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

// Kakati: FMG could not resolve the river site (`folded-banks`), so the
// descriptor has no physical banks, only a V-shaped centreline through the
// burg point for a 358 m river around a 146 m town.
describe("Kakati (wide river with an unresolved site)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const site = value.descriptor!;

  it("lays the river as a straight band clear of the core", () => {
    const geo = siteToGeography(site);
    expect(geo.rivers.some(r => r.corridor.length)).toBe(false);
    expect(geo.channels?.length).toBe(1);
    const channel = geo.channels![0];
    expect(pointInPolygon([0, 0], channel.polygon)).toBe(false);
    const radius = site.frame.cityRadiusMeters;
    expect(channel.shoreline.length).toBe(2);
    const [a, b] = [channel.shoreline[0], channel.shoreline.at(-1)!];
    const distance = Math.abs((b[0] - a[0]) * a[1] - (b[1] - a[1]) * a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(distance).toBeGreaterThanOrEqual(radius);
  });

  it("generates the town with its castle", () => {
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed);
    expect(city).not.toBeNull();
  }, 120000);
});
