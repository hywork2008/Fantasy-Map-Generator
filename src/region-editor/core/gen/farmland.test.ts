import { describe, expect, it } from "vitest";
import { requiredFieldAreaHectares } from "../../../generators/settlementClearance";
import { renderRegionSvg } from "../../render/svg";
import { createEmptyRegionDocument, validateRegionDocument } from "../document";
import type { Point, RegionSiteDescriptor } from "../types";
import { generateFarmland } from "./farmland";

function fixture(rain: number, population = 100) {
  const doc = createEmptyRegionDocument({ widthMeters: 20000, heightMeters: 20000, metersPerUnit: 100 });
  const polygon: Point[] = [
    [0, 0],
    [200, 0],
    [200, 200],
    [0, 200]
  ];
  doc.biomes = [{ id: "forest", kind: "deciduous_forest", polygon }];
  doc.settlements = [{ id: "city", name: "City", type: "city", position: [100, 100], population }];
  const site = {
    cells: [
      { point: [100, 100], elevationMeters: 10, biomeId: 1, biomeName: "Forest", polygon, annualPrecipitationMm: rain }
    ]
  } as RegionSiteDescriptor;
  return { doc, site };
}
const area = (doc: ReturnType<typeof createEmptyRegionDocument>) =>
  doc.settlements.reduce((sum, city) => sum + (city.farmlandAreaHectares ?? 0), 0);

describe("regional farmland", () => {
  it("stores and renders the same physical field geometry and migrates it through saves", () => {
    const { doc, site } = fixture(1000, 103);
    doc.symbols = [{ id: "tree", type: "tree_deciduous", x: 140, y: 100, scale: 1, rotationDeg: 0 }];
    const before = renderRegionSvg(doc);
    generateFarmland(doc, site, p => p);
    expect(doc.settlements[0].farmlandAreaHectares).toBeCloseTo(requiredFieldAreaHectares(103, 450) * 1.1);
    expect(renderRegionSvg(doc)).not.toBe(before);
    expect(doc.landUse?.patches.some(p => p.kind === "cultivation")).toBe(true);
    expect(doc.symbols).toHaveLength(1);
    const loaded = validateRegionDocument(JSON.parse(JSON.stringify(doc)));
    expect(loaded.ok).toBe(true);
    if (loaded.ok)
      expect(loaded.document.settlements[0].farmlandAreaHectares).toBeCloseTo(
        requiredFieldAreaHectares(103, 450) * 1.1
      );
  });
  it("keeps fields off the coastal habitat band so they never cover it", () => {
    const { doc, site } = fixture(1000, 400);
    // 海岸の辺（x = 0 の縁）にハビタットの帯。帯は陸側へ 7 単位被る
    doc.terrain.coastalHabitats = [
      {
        points: [
          [0, 0],
          [0, 200]
        ],
        landPolygon: site.cells[0].polygon as Point[],
        coastalHabitat: 1
      }
    ];
    generateFarmland(doc, site, p => p);
    const fields = (doc.landUse?.patches ?? []).filter(p => p.kind === "cultivation");
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) for (const [x] of field.polygon) expect(x).toBeGreaterThanOrEqual(7 - 1e-6);
  });
  it("draws no fields for cells outside the map frame", () => {
    const { doc, site } = fixture(1000, 103);
    site.cells[0].polygon = [
      [-500, -500],
      [-400, -500],
      [-400, -400],
      [-500, -400]
    ];
    generateFarmland(doc, site, p => p);
    expect(doc.landUse?.patches.some(p => p.kind === "cultivation") ?? false).toBe(false);
  });
  it("does not clear dry forests without accessible water or zero population", () => {
    const { doc, site } = fixture(0);
    generateFarmland(doc, site, p => p);
    expect(area(doc)).toBe(0);
    expect(doc.settlements[0].farmlandAreaHectares).toBe(0);
    site.cells[0].annualPrecipitationMm = 1000;
    doc.settlements[0].population = 0;
    generateFarmland(doc, site, p => p);
    expect(area(doc)).toBe(0);
    expect(doc.settlements[0].farmlandAreaHectares).toBe(0);
  });
  it("does not invent irrigation from a nearby river when the legacy descriptor has no supply allocation", () => {
    const { doc, site } = fixture(0, 100000);
    doc.settlements.push({ ...doc.settlements[0], id: "city-2", position: [140, 100] });
    doc.rivers = [
      {
        id: "river",
        name: "River",
        points: [
          [100, 0],
          [100, 200]
        ],
        widths: [20],
        dischargeM3s: 0.01
      }
    ];
    generateFarmland(doc, site, p => p);
    expect(area(doc)).toBe(0);
    expect(doc.landUse?.diagnostics.some(d => d.includes("staple-production-unavailable"))).toBe(true);
    expect(doc.settlements.every(city => city.farmlandAreaHectares !== undefined)).toBe(true);
  });
  it("is deterministic and excludes water cells", () => {
    const { doc, site } = fixture(1000);
    generateFarmland(doc, site, p => p);
    const first = JSON.stringify(doc.settlements);
    generateFarmland(doc, site, p => p);
    expect(JSON.stringify(doc.settlements)).toBe(first);
    site.cells[0].isWater = true;
    generateFarmland(doc, site, p => p);
    expect(area(doc)).toBe(0);
    expect(doc.settlements[0].farmlandAreaHectares).toBe(0);
  });
  it("migrates legacy parcel areas and initializes missing city areas", () => {
    const { doc } = fixture(1000);
    doc.settlements.push({ ...doc.settlements[0], id: "other" });
    const result = validateRegionDocument({ ...doc, farmland: [{ settlementId: "city", areaHectares: 12.5 }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.settlements.map(city => city.farmlandAreaHectares)).toEqual([12.5, 0]);
      expect(result.document).not.toHaveProperty("farmland");
    }
  });
});
