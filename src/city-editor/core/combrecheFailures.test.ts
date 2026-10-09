import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import berbafudovar from "./fixtures/berbafudovar-20261009.json";
import biarom from "./fixtures/biarom-20261009.json";
import courvilliers from "./fixtures/courvilliers-20261009.json";
import dossiepoy from "./fixtures/dossiepoy-20261009.json";
import gondre from "./fixtures/gondre-20261009.json";
import { pointInPolygon } from "./gen/geom";
import { siteToGeography } from "./gen/site/siteInput";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

const generate = (input: unknown) => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  return generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed);
};

// The last five rejections of the Combreche 2026-10-08 map audit (901 burgs).
describe("Combreche audit rejections", () => {
  // A 605 m port river whose FMG course is unresolved (invalid-curve) bends
  // through the burg point; its offset band folded over the origin and left
  // 0 m² of urban land.
  it("Berbafudovar: lays an unresolved port river along its chord, clear of the town", () => {
    const geo = siteToGeography(parseIncomingPayload(JSON.stringify(berbafudovar))!.descriptor!);
    expect(geo.channels?.length).toBeGreaterThan(0);
    for (const channel of geo.channels!) expect(pointInPolygon([0, 0], channel.polygon)).toBe(false);
    expect(generate(berbafudovar)).not.toBeNull();
  }, 120000);

  // A central castle in a small core cut the town off from an FMG road.
  it("Dossiepoy: retries castle siting on street edges after an FMG road is lost", () => {
    const city = generate(dossiepoy);
    expect(city).not.toBeNull();
    expect(city!.castles).toHaveLength(1);
  }, 120000);

  it("Courvilliers: retries castle siting on street edges after an FMG road is lost", () => {
    const city = generate(courvilliers);
    expect(city).not.toBeNull();
    expect(city!.castles).toHaveLength(1);
  }, 120000);

  // The gateless bridge road's head vertex sat on the bank, so the road
  // width of every edge leaving it reached the water.
  it("Gondre: leaves a surveyed bridge head on the bank", () => {
    expect(generate(gondre)).not.toBeNull();
  }, 120000);

  // Vertex merging shrank a clipped frame sliver to 0.97 m² (Face f46 has no area).
  it("Biarom: drops a frame sliver that vertex merging shrinks below 1 m²", () => {
    expect(generate(biarom)).not.toBeNull();
  }, 120000);
});
