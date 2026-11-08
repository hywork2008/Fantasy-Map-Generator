import { describe, expect, it } from "vitest";
import { residentialStoreys } from "../../../../utils/urbanMorphology";
import { renderVectorDocument } from "../../../renderers/vector/documentSvg";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import { cellHouseCount, cellHouseRing, unpackLine } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { syntheticVectorInput } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { perimeterHouseDwellings } from "./urbanCapacity";

const skeleton = () =>
  generateVectorSkeleton(syntheticVectorInput("m5", 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
    .document;
describe("meshless urban generation", () => {
  it("builds only lots drawn below the lot occupancy", () => {
    const run = (lotOccupancy: number) =>
      generateVectorUrban(skeleton(), {
        ...DEFAULT_VECTOR_URBAN,
        mode: "medieval",
        population: 400,
        maxLanes: 4,
        lotOccupancy
      });
    const half = run(0.5),
      draws = (doc: typeof half) => Object.values(doc.fabric!.cells).flatMap(c => c.houses.draws);
    expect(half.urban!.settings.lotOccupancy).toBe(0.5);
    expect(draws(half).every(d => d < 0.5)).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(half))).toEqual(half);
  });
  it("packs authored houses with conserved population and no facilities in ordinary mode", () => {
    const source = skeleton(),
      doc = generateVectorUrban(source, { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 90, maxLanes: 4 });
    expect(doc.paths).toMatchObject(source.paths);
    expect(doc.site).toEqual(source.site);
    expect(doc.urban!.report.housingBuildings).toBeGreaterThan(0);
    expect(doc.urban!.report.requiredFacilities).toBe(0);
    expect(doc.urban!.checkpoints.map(c => c.id)).toEqual([
      "inputs",
      "skeleton",
      "regions",
      "blocksAndLanes",
      "housing"
    ]);
    expect(doc.urban!.report.assignedPopulation + doc.urban!.report.unplacedPopulation).toBe(90);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
  });
  it("reserves facilities before housing and replays the same saved result", () => {
    const doc = generateVectorUrban(skeleton(), {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval-facilities",
      population: 200,
      maxLanes: 4
    });
    const urban = doc.urban!;
    expect(urban.report.placedFacilities).toBeGreaterThan(0);
    const blocks = renderVectorDocument(doc, undefined, undefined, "blocksAndLanes"),
      fac = renderVectorDocument(doc, undefined, undefined, "facilities"),
      housing = renderVectorDocument(doc);
    expect(blocks.querySelectorAll("[data-vector-placement]").length).toBe(0);
    expect(fac.querySelectorAll('[data-vector-building-kind="housing"]').length).toBe(0);
    expect(housing.querySelectorAll('[data-vector-building-kind="facility"]').length).toBe(
      urban.report.placedFacilities
    );
    expect(housing.querySelectorAll('[data-vector-building-kind="housing"]').length).toBe(
      urban.report.housingBuildings
    );
    expect(urban.report.mixedDwellings + urban.report.housingBuildings).toBe(urban.report.capacityDwellings);
    const placements = Object.values(doc.placements);
    for (let i = 0; i < placements.length; i++)
      for (let j = i + 1; j < placements.length; j++)
        expect(
          regionBoolean(placements[i].building!.reserved, placements[j].building!.reserved, "intersection").reduce(
            (n, p) => n + regionArea(p),
            0
          )
        ).toBeLessThan(1e-4);
    const loaded = parseVectorDocument(serializeVectorDocument(doc))!;
    expect(loaded).toEqual(doc);
    expect(generateVectorUrban(loaded, urban.settings).placements).toEqual(doc.placements);
    const changed = structuredClone(doc);
    changed.paths[Object.keys(changed.generation!.pathRevisions)[0]].revision++;
    changed.revision++;
    expect(() => generateVectorUrban(changed, urban.settings)).toThrow("edited-urban");
  });
});

describe("urban physical constraints and capacity deficits", () => {
  it("connects new lanes explicitly and preserves manual reserved sites and known building dimensions", () => {
    const source = skeleton();
    source.placements.fixed = {
      id: "fixed",
      modelId: "manual:site",
      position: [45, 45],
      facingDegrees: 0,
      origin: "manual",
      editPolicy: "fixed",
      site: {
        outer: [
          [40, 40],
          [50, 40],
          [50, 50],
          [40, 50]
        ],
        holes: []
      },
      accesses: []
    };
    const doc = generateVectorUrban(source, {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval",
      population: 200,
      maxLanes: 4
    });
    expect(doc.placements.fixed).toEqual(source.placements.fixed);
    expect(doc.urban!.report.reasons).toContain("manual-capacity-unverified");
    // Generated streets and lanes stay in fabric; every join to a main road is an explicit node on that road.
    const fabric = doc.fabric!;
    const mouths = [
      ...Object.values(fabric.districts).flatMap(d => d.mouths),
      ...Object.values(fabric.cells).flatMap(c => c.mouths)
    ];
    expect(mouths.length).toBeGreaterThan(0);
    for (const m of mouths)
      expect(doc.connections.nodes[m.nodeId].anchors.some(a => doc.paths[a.pathId]?.role === "road")).toBe(true);
    expect(doc.urban!.ownedPaths).toEqual([]);
    expect(Object.values(doc.placements).some(p => p.building?.kind === "housing")).toBe(false);
    let houses = 0;
    for (const cell of Object.values(fabric.cells))
      for (let i = 0; i < cellHouseCount(cell); i++) {
        const site = { outer: cellHouseRing(cell, i), holes: [] };
        expect(cell.houses.storeys[i]).toBe(residentialStoreys(doc.context.historicalPeriod).standard);
        expect(cell.houses.dwellings[i]).toBe(perimeterHouseDwellings(regionArea(site), cell.houses.storeys[i]));
        expect(regionBoolean([site], [source.placements.fixed.site], "intersection")).toHaveLength(0);
        houses++;
      }
    expect(houses).toBe(doc.urban!.report.housingBuildings);
  });
  it("keeps a fixed manual domain and reports unplaced people without shrinking buildings", () => {
    const source = generateVectorSkeleton(syntheticVectorInput("small", 30, false), {
      ...DEFAULT_VECTOR_GENERATION,
      branches: 2
    }).document;
    source.site!.id = "manual-site";
    const doc = generateVectorUrban(source, {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval",
      population: 200,
      maxLanes: 0
    });
    expect(doc.urban!.domain).toEqual(source.site!.domain);
    expect(doc.urban!.report.unplacedDwellings).toBeGreaterThan(0);
    expect(doc.urban!.report.unplacedPopulation).toBeGreaterThan(0);
    expect(doc.urban!.report.assignedPopulation + doc.urban!.report.unplacedPopulation).toBe(200);
    const zero = generateVectorUrban(source, { ...DEFAULT_VECTOR_URBAN, population: 0, maxLanes: 0 });
    expect(zero.urban!.report.capacityDwellings).toBe(0);
    expect(zero.urban!.report.requiredFacilities).toBe(0);
    expect(zero.urban!.report.unplacedPopulation).toBe(0);
  });
  it("uses physical riverbanks, preserves source walls and limits suburbs to synthetic input", () => {
    const source = generateVectorSkeleton(syntheticVectorInput("river", 100, true), {
      ...DEFAULT_VECTOR_GENERATION,
      branches: 4,
      wall: "ellipse"
    }).document;
    const doc = generateVectorUrban(source, { ...DEFAULT_VECTOR_URBAN, population: 500, maxLanes: 4 });
    expect(doc.paths["auto-wall"]).toEqual(source.paths["auto-wall"]);
    expect(doc.connections.bridges).toEqual(source.connections.bridges);
    expect(doc.site).toEqual(source.site);
    for (const p of Object.values(doc.placements))
      if (p.building?.riverbankDistanceMeters !== undefined)
        expect(p.building.riverbankDistanceMeters).toBeLessThanOrEqual(50);
    const expanded = generateVectorUrban(source, {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval",
      population: 2000,
      maxLanes: 0
    });
    expect(expanded.urban!.report.reasons).toContain("suburbs-expanded");
    expect(
      expanded
        .urban!.domain.flatMap(p => p.outer)
        .every(p => Math.abs(p[0]) < source.frame.extentMeters / 2 && Math.abs(p[1]) < source.frame.extentMeters / 2)
    ).toBe(true);
  });
  it("migrates native v4 and rejects tampered stage ordering, totals and physical footprints", () => {
    const source = skeleton();
    expect(parseVectorDocument(JSON.stringify({ ...source, version: 4 }))).toEqual(source);
    const doc = generateVectorUrban(source, { ...DEFAULT_VECTOR_URBAN, population: 90, maxLanes: 0 });
    const wrong = structuredClone(doc);
    wrong.urban!.checkpoints[3].placementIds = [...wrong.urban!.ownedPlacements];
    expect(parseVectorDocument(JSON.stringify(wrong))).toBeNull();
    const totals = structuredClone(doc);
    totals.urban!.report.unplacedPopulation++;
    expect(parseVectorDocument(JSON.stringify(totals))).toBeNull();
  });
  it("records a capped facility search separately from housing land or housing search", () => {
    const starved = generateVectorUrban(
      skeleton(),
      { ...DEFAULT_VECTOR_URBAN, mode: "medieval-facilities", population: 200, maxLanes: 2 },
      undefined,
      { facilityAttempts: 0, requestAttempts: 5, housingAttempts: 40000 }
    );
    const reasons = starved.urban!.report.reasons;
    expect(reasons).toContain("facility-search-starved");
    expect(
      starved.urban!.report.unplacedFacilities.some(item => item.reason === "budget" || item.reason === "unsearched")
    ).toBe(true);
    const land = reasons.includes("housing-capacity-shortfall");
    const search = reasons.includes("housing-search-budget");
    expect(land && search).toBe(false);
    expect(land || search).toBe(starved.urban!.report.unplacedPopulation > 0);
    const tight = generateVectorUrban(
      skeleton(),
      { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 400, maxLanes: 4 },
      undefined,
      { housingAttempts: 3 }
    );
    expect(tight.urban!.report.unplacedPopulation).toBeGreaterThan(0);
    expect(tight.urban!.report.reasons).toContain("housing-search-budget");
    expect(tight.urban!.report.reasons).not.toContain("housing-capacity-shortfall");
    const profile = {
      lanesMs: 0,
      facilityMs: 0,
      housingMs: 0,
      facilityAttempts: 0,
      housingAttempts: 0,
      regionMs: 0,
      curveMs: 0,
      starvedFacilities: 0,
      cappedFacilities: 0,
      housingStop: "demand-met" as const
    };
    generateVectorUrban(
      skeleton(),
      { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 40, maxLanes: 1 },
      undefined,
      { profile }
    );
    expect(profile.lanesMs).toBeGreaterThan(0);
    expect(profile.housingAttempts).toBeGreaterThan(0);
    expect(profile.housingStop === "demand-met" || profile.housingStop === "frontage").toBe(true);
  });
  it("uses CE perimeter blocks to house 5000 people without facilities or folded lanes", () => {
    const doc = generateVectorUrban(
      generateVectorSkeleton(syntheticVectorInput("m9-fixed", 240, true), {
        ...DEFAULT_VECTOR_GENERATION,
        branches: 4,
        wall: "ellipse"
      }).document,
      { ...DEFAULT_VECTOR_URBAN, population: 5000, maxLanes: 8 }
    );
    expect(Object.values(doc.placements).some(p => p.building?.kind === "housing")).toBe(false);
    expect(doc.urban!.report.housingBuildings).toBeGreaterThan(0);
    expect(doc.urban!.report.requiredFacilities).toBe(0);
    expect(doc.urban!.report.placedFacilities).toBe(0);
    // CE's street blocks never fold a lane back on itself.
    let lanes = 0;
    for (const cell of Object.values(doc.fabric!.cells))
      for (let l = 0; l < cell.lanes.widths.length; l++) {
        const points = unpackLine(cell.lanes, l, cell.origin);
        lanes++;
        for (let i = 2; i < points.length; i++) {
          const ux = points[i - 1][0] - points[i - 2][0],
            uy = points[i - 1][1] - points[i - 2][1],
            vx = points[i][0] - points[i - 1][0],
            vy = points[i][1] - points[i - 1][1];
          expect((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))).toBeGreaterThan(-0.5);
        }
      }
    expect(lanes).toBeGreaterThan(0);
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    expect(doc.urban!.report.unplacedPopulation).toBe(0);
    expect(doc.urban!.report.reasons).not.toContain("housing-capacity-shortfall");
    expect(doc.urban!.report.reasons).not.toContain("housing-search-budget");
  }, 180000);
});
