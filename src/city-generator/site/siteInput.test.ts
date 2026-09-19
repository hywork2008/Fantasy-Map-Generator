// siteToGeography — the adapter from a real (or synthetic) BurgSiteDescriptor to
// the rough corridors the pipeline walks. These cover the two adaptations M3
// added for real FMG descriptors, which the synthetic path never exercises.

import { describe, expect, it } from "vitest";
import { generateCity } from "../core/pipeline";
import type { BurgSiteDescriptor, BurgSiteRiver } from "./burgSiteDescriptor";
import { siteToGeography, siteToParams, siteToProgram, siteToWallPlan } from "./siteInput";

function baseDescriptor(overrides: Partial<BurgSiteDescriptor> = {}): BurgSiteDescriptor {
  return {
    version: 2,
    burg: {
      id: 1,
      name: "Testburg",
      group: "",
      type: "Generic",
      seed: "sitest",
      population: 6000,
      capital: false,
      port: false,
      citadel: false,
      plaza: false,
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
    rivers: [],
    waterbody: null,
    roads: [],
    suggestedGates: 0,
    suggestedArchetype: "crossroads",
    ...overrides
  };
}

function river(overrides: Partial<BurgSiteRiver>): BurgSiteRiver {
  return {
    riverId: 1,
    name: "R",
    type: "River",
    widthMeters: 20,
    axisAzimuthDeg: 90,
    offsetMeters: 0,
    offsetRatio: 0,
    cityBank: "left",
    crossesSite: true,
    throughBurgCell: true,
    rawOffsetMeters: 0,
    snappedToBank: false,
    segments: [
      {
        points: [
          [-1200, 0],
          [1200, 0]
        ],
        widthsMeters: [20, 20]
      }
    ],
    parentRiverId: null,
    leftBankSegments: [],
    rightBankSegments: [],
    downstream: { terminal: "unknown", distanceMeters: 0, bearingDeg: 0 },
    ...overrides
  };
}

describe("extractCoast — empty-shoreline port burg", () => {
  it("synthesises a shore corridor when waterbody has no in-window polyline", () => {
    const geo = siteToGeography(
      baseDescriptor({
        waterbody: { kind: "ocean", isPort: true, shoreAzimuthDeg: 90, shoreline: [] }
      })
    );
    expect(geo.coast).not.toBeNull();
    expect(geo.coast?.waterAzimuthDeg).toBe(90);
    expect(geo.coast?.corridor.length).toBeGreaterThanOrEqual(2);
  });

  it("still drops the coast when there is no waterbody at all", () => {
    expect(siteToGeography(baseDescriptor()).coast).toBeNull();
  });

  it("lets the pipeline place sea cells from the synthesised corridor", () => {
    const site = baseDescriptor({
      waterbody: { kind: "ocean", isPort: true, shoreAzimuthDeg: 90, shoreline: [] }
    });
    const result = generateCity(siteToParams(site), siteToGeography(site));
    const seaCount = result.steps[result.steps.length - 1].cells.filter(c => c.tag === "sea").length;
    expect(seaCount).toBeGreaterThan(0);
    expect(result.shoreline).not.toBeNull();
  });
});

describe("siteToProgram — verbatim pass-through of the Features flags", () => {
  const withBurg = (flags: Partial<BurgSiteDescriptor["burg"]>): BurgSiteDescriptor =>
    baseDescriptor({ burg: { ...baseDescriptor().burg, ...flags } });

  it("copies each flag as-is, and derives wallPlan from the §8 matrix", () => {
    const site = withBurg({
      capital: true,
      port: true,
      citadel: false,
      plaza: true,
      walls: false,
      temple: true,
      shanty: false
    });
    const prog = siteToProgram(site);
    const { wallPlan, ...flags } = prog;
    expect(flags).toEqual({
      walls: false,
      citadel: false,
      plaza: true,
      temple: true,
      port: true,
      shanty: false,
      capital: true
    });
    expect(wallPlan).toEqual(siteToWallPlan(site, flags));
    // walls:false ⇒ nothing is drawn.
    expect(wallPlan?.extent).toBe("none");
  });

  it("round-trips an all-on and an all-off Features set", () => {
    const keys = ["walls", "citadel", "plaza", "temple", "port", "shanty", "capital"] as const;
    for (const value of [true, false]) {
      const flags = Object.fromEntries(keys.map(k => [k, value])) as Record<(typeof keys)[number], boolean>;
      const prog = siteToProgram(withBurg(flags));
      for (const k of keys) expect(prog[k], `${k}=${value}`).toBe(value);
    }
  });
});

describe("extractRivers — far, non-crossing river", () => {
  it("drops a river that is >1.6 radii away and does not cross the site", () => {
    const geo = siteToGeography(
      baseDescriptor({ rivers: [river({ crossesSite: false, throughBurgCell: false, offsetRatio: 2.6 })] })
    );
    expect(geo.rivers).toHaveLength(0);
  });

  it("keeps a nearby 'beside' river that does not cross the site", () => {
    const geo = siteToGeography(baseDescriptor({ rivers: [river({ crossesSite: false, offsetRatio: 1.0 })] }));
    expect(geo.rivers).toHaveLength(1);
  });

  it("keeps a crossing river regardless of offset", () => {
    const geo = siteToGeography(baseDescriptor({ rivers: [river({ crossesSite: true, offsetRatio: 3.0 })] }));
    expect(geo.rivers).toHaveLength(1);
  });

  it("turns a wide on-cell river into a water area at its nearest bank", () => {
    const geo = siteToGeography(
      baseDescriptor({
        rivers: [
          river({
            widthMeters: 1000,
            crossesSite: false,
            offsetRatio: 8,
            segments: [],
            leftBankSegments: [
              [
                [-1200, -200],
                [1200, -200]
              ]
            ]
          })
        ]
      })
    );
    expect(geo.rivers).toHaveLength(0);
    expect(geo.waterAreas).toEqual([
      expect.objectContaining({
        kind: "river",
        corridor: [
          [-1200, -200],
          [1200, -200]
        ]
      })
    ]);
    const result = generateCity(
      siteToParams(
        baseDescriptor({
          rivers: [
            river({
              widthMeters: 1000,
              segments: [],
              leftBankSegments: [
                [
                  [-1200, -200],
                  [1200, -200]
                ]
              ]
            })
          ]
        })
      ),
      geo
    );
    expect(result.steps.at(-1)?.cells.some(cell => cell.tag === "sea")).toBe(true);
  });
});
