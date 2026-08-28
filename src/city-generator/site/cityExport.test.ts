// cityExport — the "share this city with an AI" payload. Two guarantees matter:
//   • `settings.resolved` fed back to `generateCity` reproduces `city` exactly;
//   • the digest counts line up with the GenerationResult it was built from.

import { describe, expect, it } from "vitest";
import { generateCity } from "../core/pipeline";
import { DEFAULT_WALL_PLAN } from "../core/types";
import { type BurgSiteDescriptor, DESCRIPTOR_VERSION } from "./burgSiteDescriptor";
import { buildCityExport, CITY_EXPORT_KIND, type CityExportSource, cityExportFilename } from "./cityExport";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "./siteConfig";
import { resolveWallPlan, siteToGeography, siteToParams, siteToProgram } from "./siteInput";
import { synthSite } from "./synthSite";

const NOW = new Date("2026-08-28T12:00:00.000Z");

/** Mirror of CityGeneratorPage.build() for the standalone path. */
function standaloneSource(config: SiteConfig, seed: string): CityExportSource {
  const descriptor = synthSite("smallCity", config, seed);
  const geo = siteToGeography(descriptor);
  const base = siteToProgram(descriptor);
  const program = { ...base, wallPlan: resolveWallPlan(base.wallPlan ?? DEFAULT_WALL_PLAN, config.wall) };
  const params = siteToParams(descriptor);
  return {
    mode: { kind: "standalone", preset: "smallCity", config },
    seed,
    descriptor,
    params,
    geography: geo,
    program,
    result: generateCity(params, geo, program),
    now: NOW
  };
}

function importedDescriptor(overrides: Partial<BurgSiteDescriptor> = {}): BurgSiteDescriptor {
  return {
    version: DESCRIPTOR_VERSION,
    burg: {
      id: 7,
      name: "Port Royal",
      group: "",
      type: "City",
      seed: "imp-seed",
      population: 9000,
      capital: true,
      port: true,
      citadel: false,
      plaza: true,
      walls: true,
      temple: true,
      shanty: false
    },
    frame: { originMapUnits: [0, 0], metersPerMapUnit: 1, extentMeters: 2400, cityRadiusMeters: 400 },
    climate: { temperatureC: 12, biomeId: 0 },
    terrain: {
      elevationMeters: 40,
      downhillAzimuthDeg: 0,
      gradePercent: 1,
      heightfield: { size: 2, spacingMeters: 1200, elevationsMeters: [0, 0, 0, 0], waterMask: [0, 0, 0, 0] }
    },
    rivers: [
      {
        riverId: 1,
        name: "Kingsflow",
        type: "River",
        widthMeters: 24,
        axisAzimuthDeg: 90,
        offsetMeters: 40,
        offsetRatio: 0.1,
        cityBank: "left",
        crossesSite: true,
        throughBurgCell: true,
        rawOffsetMeters: 40,
        snappedToBank: true,
        parentRiverId: null,
        leftBankSegments: [],
        rightBankSegments: [],
        downstream: { terminal: "ocean", distanceMeters: 1200, bearingDeg: 90 },
        segments: [
          {
            points: [
              [-1200, 60],
              [0, 20],
              [1200, -40]
            ],
            widthsMeters: [18, 24, 30]
          }
        ]
      }
    ],
    waterbody: { kind: "ocean", name: "The Sea", isPort: true, shoreAzimuthDeg: 270, shoreline: [] },
    roads: [
      {
        routeId: 1,
        group: "roads",
        entryAzimuthDeg: 30,
        reachesEdge: true,
        path: [
          [0, 0],
          [900, 500]
        ],
        nextBurg: null
      },
      {
        routeId: 2,
        group: "roads",
        entryAzimuthDeg: 150,
        reachesEdge: true,
        path: [
          [0, 0],
          [700, -700]
        ],
        nextBurg: null
      }
    ],
    suggestedGates: 2,
    suggestedArchetype: "harbor",
    ...overrides
  };
}

function importedSource(): CityExportSource {
  const descriptor = importedDescriptor();
  const params = { ...siteToParams(descriptor), seed: descriptor.burg.seed };
  const geo = siteToGeography(descriptor);
  const program = siteToProgram(descriptor);
  return {
    mode: { kind: "imported", origin: "world" },
    seed: descriptor.burg.seed,
    descriptor,
    params,
    geography: geo,
    program,
    result: generateCity(params, geo, program),
    link: "https://example.test/city/#token",
    now: NOW
  };
}

describe("buildCityExport — standalone", () => {
  const src = standaloneSource({ ...DEFAULT_SITE_CONFIG, coast: "bay", rivers: ["through"] }, "abc123");
  const data = buildCityExport(src);

  it("stamps the envelope", () => {
    expect(data.kind).toBe(CITY_EXPORT_KIND);
    expect(data.exportVersion).toBe(1);
    expect(data.descriptorVersion).toBe(DESCRIPTOR_VERSION);
    expect(data.generatedAt).toBe("2026-08-28T12:00:00.000Z");
  });

  it("carries the reproduction settings", () => {
    expect(data.settings.mode).toBe("standalone");
    expect(data.settings.preset).toEqual({ id: "smallCity", label: "Small City", population: 12_000 });
    expect(data.settings.siteConfig).toEqual(src.mode.kind === "standalone" ? src.mode.config : null);
    expect(data.settings.descriptorIsSynthetic).toBe(true);
    expect(data.settings.descriptor.burg.seed).toBe("abc123");
    expect(data.settings.resolved.params).toBe(src.params);
    expect(data.settings.resolved.program.wallPlan).toBeDefined();
  });

  it("digest counts line up with the GenerationResult", () => {
    const final = src.result.steps[src.result.steps.length - 1];
    const t = data.city.cellTags;
    expect(data.city.dimensions.cellCount).toBe(src.result.cells.length);
    expect(t.total).toBe(final.cells.length);
    expect(t.sea + t.urban + t.outskirts + t.rural).toBe(t.total);
    expect(data.city.stages.stepLabels).toEqual(src.result.steps.map(s => s.label));
    expect(data.city.walls.loopCount).toBe(src.result.borders.length);
    expect(data.city.gates).toHaveLength(src.result.gates.length);
  });

  it("resolved inputs reproduce the digest byte-for-byte", () => {
    const rerun = generateCity(
      data.settings.resolved.params,
      data.settings.resolved.geography,
      data.settings.resolved.program
    );
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(src.result));
  });

  it("writes a readable description", () => {
    expect(data.description.length).toBeGreaterThan(3);
    expect(data.description.every(l => typeof l === "string" && l.length > 0)).toBe(true);
    expect(data.description[0]).toContain("Standalone");
    expect(data.description.some(l => l.startsWith("Cell classification"))).toBe(true);
  });

  it("is deterministic and JSON-safe", () => {
    const again = buildCityExport(
      standaloneSource({ ...DEFAULT_SITE_CONFIG, coast: "bay", rivers: ["through"] }, "abc123")
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(data));
    expect(JSON.parse(JSON.stringify(data)).kind).toBe(CITY_EXPORT_KIND);
  });
});

describe("buildCityExport — imported", () => {
  const src = importedSource();
  const data = buildCityExport(src);

  it("records the world-map origin and a shareable link", () => {
    expect(data.settings.mode).toBe("imported");
    expect(data.settings.origin).toBe("world");
    expect(data.settings.shareableLink).toBe("https://example.test/city/#token");
    expect(data.settings.descriptorIsSynthetic).toBe(false);
    expect(data.settings.preset).toBeUndefined();
  });

  it("summarises the coast and the gates", () => {
    expect(data.city.coast).not.toBeNull();
    expect(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).toContain(data.city.coast?.compass);
    expect(data.city.rivers).toHaveLength(src.result.riverPaths.length);
    for (const g of data.city.gates) {
      expect(g.bearingDeg).toBeGreaterThanOrEqual(0);
      expect(g.bearingDeg).toBeLessThan(360);
      expect(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).toContain(g.compass);
    }
  });

  it("reproduces from resolved inputs", () => {
    const rerun = generateCity(
      data.settings.resolved.params,
      data.settings.resolved.geography,
      data.settings.resolved.program
    );
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(src.result));
  });
});

describe("cityExportFilename", () => {
  it("slugifies the burg name and seed", () => {
    const name = cityExportFilename(buildCityExport(importedSource()));
    expect(name).toMatch(/^fmg-city-[a-z0-9-]+-[a-z0-9-]+\.json$/);
    expect(name).toContain("port-royal");
  });

  it("falls back to the preset label when standalone", () => {
    const name = cityExportFilename(buildCityExport(standaloneSource(DEFAULT_SITE_CONFIG, "Seed 99")));
    expect(name).toBe("fmg-city-small-city-seed-99.json");
  });
});
