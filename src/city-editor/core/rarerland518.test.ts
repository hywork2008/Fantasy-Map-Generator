import { describe, expect, it } from "vitest";
import { shareFromDescriptor } from "../io/incomingCity";
import fixture from "./fixtures/rarerland518-20261004.json";
import { externalGateRoads } from "./gen/approachBeyond";
import { buildBlockFabric } from "./gen/blockInfill";
import { polygonArea } from "./gen/geom";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
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
    expect(houses.length).toBeGreaterThanOrEqual(fixture.burg.dwellings);
    expect(houses.length).toBeLessThanOrEqual(Math.ceil(fixture.burg.dwellings * 1.05));
    expect(Math.max(...houses.map(b => Math.abs(polygonArea(b.polygon))))).toBeLessThan(200);
    const half = city.frame.extentMeters / 2;
    for (const exit of externalGateRoads(city)) {
      expect(Math.max(...exit.outward.map(Math.abs))).toBeCloseTo(half, 1);
    }
  });
});
