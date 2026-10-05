import { describe, expect, it } from "vitest";
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
  it("stores population-limited area without changing the drawing or forests", () => {
    const { doc, site } = fixture(1000, 103);
    doc.symbols = [{ id: "tree", type: "tree_deciduous", x: 140, y: 100, scale: 1, rotationDeg: 0 }];
    const before = renderRegionSvg(doc);
    generateFarmland(doc, site, p => p);
    expect(doc.settlements[0].farmlandAreaHectares).toBeCloseTo(51.5);
    expect(renderRegionSvg(doc)).toBe(before);
    expect(doc.symbols).toHaveLength(1);
    const loaded = validateRegionDocument(JSON.parse(JSON.stringify(doc)));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.document.settlements[0].farmlandAreaHectares).toBeCloseTo(51.5);
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
  it("shares finite river water between cities and excludes river banks", () => {
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
    expect(area(doc)).toBeCloseTo((0.01 * 365 * 86400 * 0.1 * 0.5) / 6000);
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
