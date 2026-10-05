import { describe, expect, it } from "vitest";
import { planSettlementLandUse } from "../../../generators/settlementClearance";
import { renderRegionSvg } from "../../render/svg";
import { createEmptyRegionDocument, validateRegionDocument } from "../document";
import type { Point, RegionSiteDescriptor } from "../types";
import { generateFarmland } from "./farmland";
import { buildLandscapeFromCells, resolveCellLandscape } from "./landscapeBiomes";
import { clipConvex, polygonArea, polygonsOverlap, rectangle } from "./landUseGeometry";

function fixture() {
  const doc = createEmptyRegionDocument({ widthMeters: 10000, heightMeters: 10000, metersPerUnit: 100 });
  const polygon = rectangle(0, 0, 100, 100);
  const snapshot = planSettlementLandUse(
    [
      {
        id: 7,
        anchor: [50, 50],
        physicalLandAreaHa: 10000,
        forestCover: 0.7,
        ruralPeople: 20,
        urbanPeople: 100,
        cultivableAreaHa: 5000,
        yieldKgPerSownHa: 450
      }
    ],
    { seed: "world", year: 100 }
  );
  const site = {
    version: 2,
    sourceSeed: "world",
    metersPerMapUnit: 100,
    landUse: { modelVersion: 1, revision: 1, year: 100, seed: "world", provenance: "authoritative" },
    cells: [
      {
        sourceCellId: 7,
        point: [50, 50],
        polygon,
        elevationMeters: 20,
        biomeId: 1,
        biomeName: "Forest",
        landUse: snapshot.cells[7]
      }
    ]
  } as RegionSiteDescriptor;
  doc.settlements = [{ id: "city", name: "City", type: "city", population: 100, position: [50, 50] }];
  doc.biomes = [{ id: "forest", kind: "deciduous_forest", polygon }];
  return { doc, site };
}
describe("land-use detail contract", () => {
  it("reads FMG world polygons, clips water and keeps the same masks at every zoom", () => {
    const { doc, site } = fixture();
    const snapshot = planSettlementLandUse(
      [
        {
          id: 7,
          anchor: [50, 50],
          polygon: site.cells[0].polygon!,
          physicalLandAreaHa: 10000,
          forestCover: 1,
          ruralPeople: 200,
          urbanPeople: 100,
          cultivableAreaHa: 5000,
          yieldKgPerSownHa: 450
        }
      ],
      { seed: "world", year: 100 }
    );
    site.cells[0].landUse = snapshot.cells[7];
    const crop = snapshot.cells[7].patches.find(p => p.kind === "cultivation")!.polygons![0];
    const center: Point = crop.reduce((s, p) => [s[0] + p[0] / crop.length, s[1] + p[1] / crop.length] as Point, [
      0, 0
    ] as Point);
    const lake = rectangle(center[0] - 0.05, center[1] - 0.05, 0.1, 0.1);
    doc.terrain.lakePolygons = [lake];
    generateFarmland(doc, site, p => p);
    expect(doc.landUse!.unplacedAreaHa).toBeGreaterThan(0);
    for (const patch of doc.landUse!.patches) expect(polygonArea(clipConvex(patch.polygon, lake))).toBeLessThan(1e-8);
    const before = JSON.stringify(doc.landUse);
    for (const zoom of [0.3, 1, 3]) {
      const svg = renderRegionSvg(doc, undefined, { zoom });
      for (const patch of doc.landUse!.patches.filter(p => p.kind === "built" || p.kind === "cultivation")) {
        const path = `${patch.polygon.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ")} Z`;
        expect(svg.split(`d="${path}"`).length).toBeGreaterThanOrEqual(3);
      }
    }
    expect(JSON.stringify(doc.landUse)).toBe(before);
    expect(snapshot.cells[7].patches.find(p => p.kind === "cultivation")!.polygons).toContainEqual(crop);
  });
  it("uses supplied budgets without recalculating food, yield or rainfall", () => {
    const { doc, site } = fixture();
    site.cells[0].annualPrecipitationMm = 0;
    generateFarmland(doc, site, p => p);
    const crops = doc.landUse!.patches.filter(p => p.kind === "cultivation");
    expect(crops.reduce((s, p) => s + p.areaHa, 0)).toBeCloseTo(site.cells[0].landUse!.allocatedAreaHa, 6);
    for (const p of crops) expect((polygonArea(p.polygon) * 100 ** 2) / 10000).toBeCloseTo(p.areaHa, 6);
    expect(doc.landUse!.unplacedAreaHa).toBeCloseTo(0, 6);
  });
  it("does not intersect thin crossing rivers, tiny internal lakes or built land", () => {
    const { doc, site } = fixture();
    const lake = rectangle(45, 40, 0.2, 0.2);
    doc.terrain.lakePolygons = [lake];
    doc.rivers = [
      {
        id: "r",
        name: "River",
        points: [
          [60, 0],
          [60, 100]
        ],
        widths: [10],
        dischargeM3s: 1
      }
    ];
    const original = JSON.stringify(doc.rivers);
    generateFarmland(doc, site, p => p);
    const crops = doc.landUse!.patches.filter(p => p.kind === "cultivation");
    const built = doc.landUse!.patches.filter(p => p.kind === "built");
    for (const p of crops) {
      expect(polygonsOverlap(p.polygon, lake)).toBe(false);
      expect(polygonsOverlap(p.polygon, rectangle(59.95, 0, 0.1, 100))).toBe(false);
      for (const b of built) expect(polygonsOverlap(p.polygon, b.polygon)).toBe(false);
    }
    expect(JSON.stringify(doc.rivers)).toBe(original);
  });
  it("clips partial coastal cells, retains unplaced budgets and never exceeds available land", () => {
    const { doc, site } = fixture();
    site.cells[0].polygon = [
      [0, 0],
      [20, 0],
      [0, 20]
    ];
    site.cells[0].landUse!.patches.find(p => p.kind === "cultivation")!.areaHa = 1000;
    generateFarmland(doc, site, p => p);
    expect(doc.landUse!.unplacedAreaHa).toBeGreaterThan(0);
    for (const patch of doc.landUse!.patches)
      expect(polygonArea(clipConvex(patch.polygon, site.cells[0].polygon))).toBeCloseTo(polygonArea(patch.polygon), 6);
  });
  it("preserves physical geometry across translation, scale, repeated opening and saves", () => {
    const { doc, site } = fixture();
    generateFarmland(doc, site, p => p);
    const first = JSON.stringify(doc.landUse);
    generateFarmland(doc, site, p => p);
    expect(JSON.stringify(doc.landUse)).toBe(first);
    const other = createEmptyRegionDocument({ widthMeters: 10000, heightMeters: 10000, metersPerUnit: 50 });
    generateFarmland(other, site, p => [p[0] * 2 + 20, p[1] * 2 + 30]);
    expect(other.landUse!.patches.map(p => p.id)).toEqual(doc.landUse!.patches.map(p => p.id));
    other.landUse!.patches.forEach((p, i) => {
      expect(p.areaHa).toBeCloseTo(doc.landUse!.patches[i].areaHa, 6);
    });
    const loaded = validateRegionDocument(JSON.parse(JSON.stringify(doc)));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.document.landUse).toEqual(doc.landUse);
  });
  it("retains edited patches and uses the same polygons in ground and canopy masks", () => {
    const { doc, site } = fixture();
    generateFarmland(doc, site, p => p);
    const patch = doc.landUse!.patches.find(p => p.kind === "cultivation")!;
    patch.userEdited = true;
    const edited = JSON.stringify(patch);
    generateFarmland(doc, site, p => p);
    expect(JSON.stringify(doc.landUse!.patches.find(p => p.id === patch.id))).toBe(edited);
    const svg = renderRegionSvg(doc);
    const path = `${patch.polygon.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ")} Z`;
    expect(svg.split(`d="${path}"`).length).toBeGreaterThanOrEqual(3);
    expect(renderRegionSvg(doc, undefined, { zoom: 0.4 })).toContain('data-detail-level="0"');
    expect(renderRegionSvg(doc, undefined, { zoom: 2 })).toContain('data-detail-level="2"');
  });
  it("allows grassland farms and preserves mountainous forest and tropical dry forest", () => {
    const { doc, site } = fixture();
    site.cells[0].biomeName = "Grassland";
    doc.biomes[0].kind = "grassland";
    generateFarmland(doc, site, p => p);
    expect(doc.landUse!.patches.some(p => p.kind === "cultivation")).toBe(true);
    expect(resolveCellLandscape("Temperate deciduous forest", 1500, false).kind).toBe("deciduous_forest");
    expect(resolveCellLandscape("Tropical dry forest", 100, false).kind).toBe("tropical_forest");
  });
  it("keeps natural canopy inside its cells and IDs stable under cell reordering", () => {
    const cells = [
      {
        sourceCellId: 1,
        point: [10, 10] as Point,
        polygon: rectangle(0, 0, 20, 20),
        elevationMeters: 1300,
        biomeId: 1,
        biomeName: "Forest",
        forestCover: 0.7
      },
      {
        sourceCellId: 2,
        point: [30, 10] as Point,
        polygon: rectangle(20, 0, 20, 20),
        elevationMeters: 30,
        biomeId: 1,
        biomeName: "Forest",
        forestCover: 0.8
      }
    ];
    const a = buildLandscapeFromCells(cells, p => p, "world", 1000),
      b = buildLandscapeFromCells([...cells].reverse(), p => p, "world", 1000);
    expect(a.biomes.find(p => p.id === "bio-cell-1")).toEqual(b.biomes.find(p => p.id === "bio-cell-1"));
    expect(a.biomes[0].forestPolygons!.reduce((s, p) => s + polygonArea(p), 0)).toBeLessThanOrEqual(400 + 0.000001);
    expect(a.biomes[0].terrainKind).toBe("mountains");
    expect(a.symbols.some(s => s.type.startsWith("mountain"))).toBe(true);
  });
});

it("rejects steep approximated terrain without expanding fields beyond its budget", () => {
  const { doc, site } = fixture();
  doc.terrain.heightfield = {
    cols: 2,
    rows: 2,
    minElevationMeters: 0,
    maxElevationMeters: 10000,
    elevationsMeters: [0, 10000, 0, 10000]
  };
  generateFarmland(doc, site, p => p);
  expect(doc.landUse!.patches.filter(p => p.kind === "cultivation")).toHaveLength(0);
  expect(doc.landUse!.unplacedAreaHa).toBeGreaterThanOrEqual(site.cells[0].landUse!.allocatedAreaHa - 0.000001);
});

it("returns canopy over abandoned parcels gradually rather than immediately", () => {
  const { doc, site } = fixture();
  generateFarmland(doc, site, p => p);
  const patch = doc.landUse!.patches.find(p => p.kind === "cultivation")!;
  patch.kind = "abandoned";
  patch.abandonedYear = 100;
  const polygon = JSON.stringify(patch.polygon);
  doc.landUse!.year = 110;
  expect(renderRegionSvg(doc)).toContain('fill="#000000" opacity="0.5"');
  doc.landUse!.year = 120;
  expect(renderRegionSvg(doc)).toContain('fill="#000000" opacity="0"');
  expect(JSON.stringify(patch.polygon)).toBe(polygon);
});
