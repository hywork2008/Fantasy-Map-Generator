import { describe, expect, it } from "vitest";
import fixture from "../data/fixtures/rarerland518-20261004.json";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { shareFromDescriptor } from "../services/io/incomingCity";
import type { BurgSiteDescriptor } from "../types/contracts/burgSiteDescriptor";
import { externalGateRoads } from "./approachBeyond";
import { buildBlockFabric } from "./blockInfill";
import { HOUSING_FIT_TOLERANCE } from "./fitImportedHousing";
import { generateCityOnDocument } from "./generation/generateCity";
import { polygonArea } from "./geom";
import { vertexHasCrossing } from "./passages";

describe("Rarerland burg 518", () => {
  it("generates a river-side village with roads on both sides of every gate", () => {
    const share = shareFromDescriptor(structuredClone(fixture) as unknown as BurgSiteDescriptor);
    const attempts: number[] = [];
    const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, sample => {
      attempts.push(sample.attempt);
    });
    expect(city).not.toBeNull();
    if (!city) return;
    expect(Math.max(...attempts)).toBe(1);
    expect(city.gates.length).toBeGreaterThan(0);
    for (const gate of city.gates) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road")).toBe(true);
    const buildings = buildBlockFabric(city).buildings;
    const houses = buildings.filter(
      b => !b.landmark && (!b.role || b.role === "main") && (!b.uses || b.uses.includes("residential"))
    );
    // The fast default fit accepts ±10% of the dwellings.
    expect(Math.abs(houses.length - fixture.burg.dwellings)).toBeLessThanOrEqual(
      fixture.burg.dwellings * HOUSING_FIT_TOLERANCE
    );
    expect(Math.max(...houses.map(b => Math.abs(polygonArea(b.polygon))))).toBeLessThan(200);
    const half = city.frame.extentMeters / 2;
    for (const exit of externalGateRoads(city)) {
      expect(Math.max(...exit.outward.map(Math.abs))).toBeCloseTo(half, 1);
    }
  });
});
