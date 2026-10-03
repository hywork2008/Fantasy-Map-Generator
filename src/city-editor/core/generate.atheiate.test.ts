import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, shareFromDescriptor } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import atheiate from "./fixtures/atheiate-20261003.json";
import { buildBlockFabric, FabricCache } from "./gen/blockInfill";
import { nearestOnPolyline, pointInPolygon } from "./gen/geom";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { siteToGeography } from "./gen/site/siteInput";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { facePoints, validate } from "./mesh";

const descriptor = atheiate as BurgSiteDescriptor;

describe("Atheiate FMG harbour", () => {
  it("brings a distant port shore within reach without moving nearby or inland shores", () => {
    const original = structuredClone(descriptor);
    const shore = siteToGeography(original).coast!;
    expect(nearestOnPolyline([0, 0], shore.corridor).dist).toBeCloseTo(120);
    expect(shore.waterAzimuthDeg).toBe(112.2);
    expect(original).toEqual(descriptor);

    original.burg.port = false;
    expect(siteToGeography(original).coast!.corridor).toEqual(descriptor.waterbody!.shoreline[0]);
    original.burg.port = true;
    original.waterbody!.shoreline = [shore.corridor];
    expect(siteToGeography(original).coast!.corridor).toEqual(shore.corridor);
    original.waterbody!.shoreline = [];
    expect(nearestOnPolyline([0, 0], siteToGeography(original).coast!.corridor).dist).toBeCloseTo(120);
  });

  it.each(["world", "share"])("retains the core and renders housing, piers and ships from the %s input", origin => {
    let share = shareFromDescriptor(descriptor);
    if (origin === "share") {
      // The user's already-issued link: standalone switches contradict the FMG
      // features, and the original coarse grid/window must remain reproducible.
      share.patchParams = { nPatches: 15, relaxCount: 4, relaxPasses: 3 };
      share.settings = {
        ...share.settings,
        buildingPattern: "legacy",
        layout: "organic",
        walledAreaShare: 1,
        historicalPeriod: "ageOfExploration"
      };
      share = decodeShare(encodeShare(share))!;
    }
    const input = cityEditorDocument(share);
    const city = generateCityOnDocument(input, cityEditorSettings(share), share.seed)!;
    expect(city).not.toBeNull();
    expect(city.generationSeed).toBe(descriptor.burg.seed);
    expect(validate(city)).toEqual([]);
    expect(city.frame).toEqual(input.frame);
    const core = Object.values(city.mesh.faces).filter(face => face.properties.settlement === "core");
    expect(core.length).toBeGreaterThan(10);
    expect(core.some(face => pointInPolygon([0, 0], facePoints(city.mesh, face)))).toBe(true);
    expect(city.defenseCircuits?.some(circuit => circuit.scope === "castle")).toBe(true);
    expect(city.elements.filter(element => element.kind === "harbor")).toHaveLength(1);
    expect(city.elements.some(element => element.kind === "ship")).toBe(true);
    expect(city.elements.some(element => element.kind === "temple" || element.kind === "plaza")).toBe(false);
    const houses = buildBlockFabric(city, new FabricCache()).buildings.filter(
      lot => !lot.landmark && (!lot.role || lot.role === "main") && (!lot.uses || lot.uses.includes("residential"))
    );
    expect(houses.length).toBeGreaterThanOrEqual(descriptor.burg.dwellings);
    expect(houses.length).toBeLessThanOrEqual(Math.ceil(descriptor.burg.dwellings * 1.05));
    const inhabited = new Set(houses.map(lot => lot.faceId));
    expect(
      city
        .fabric!.districts.filter(district => district.faceIds.some(id => inhabited.has(id)))
        .every(district => district.parameters.occupancy === 1)
    ).toBe(true);
    const svg = renderStandaloneCitySvg(city);
    expect(svg.querySelectorAll(".ce-pier").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(".ce-ship")).toHaveLength(
      city.elements.filter(element => element.kind === "ship").length
    );
    if (origin === "share" && process.env.CE_ATHEIATE_EXPORT) {
      writeFileSync(process.env.CE_ATHEIATE_EXPORT, svg.outerHTML);
    }
  });
});
