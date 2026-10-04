import { describe, expect, it } from "vitest";
import type { FixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { renderEditorSvg } from "../render/svg";
import { createGridDocument, createSizedDocument, parseDocument } from "./document";
import { featureGroupVertices } from "./features";
import fixedFixture from "./fixtures/rarerland518-20261004.json";
import { buildCityBuildings } from "./gen/buildingLots";
import { DEFAULT_SITE_CONFIG } from "./gen/site/siteConfig";
import { siteToGeography } from "./gen/site/siteInput";
import { synthSite } from "./gen/site/synthSite";
import { defaultGenerationSettings, generateStageOnDocument } from "./generate";
import { facePoints, validate } from "./mesh";
import type { Point } from "./types";
import {
  cellInsideWater,
  dryRuns,
  fixedWaterPolygons,
  lineHitsWater,
  polygonHitsWater,
  waterPolygons
} from "./waterGeometry";

const channel: Point[] = [
  [-600, 135],
  [600, 135],
  [600, 232],
  [-600, 232]
];
describe("continuous water geometry", () => {
  it("preserves islands and coverage bounds in imported physical water", () => {
    const fixed = structuredClone(fixedFixture.fixedCrossings) as unknown as FixedBurgCrossings;
    if (fixed.schemaVersion !== 3 && fixed.schemaVersion !== 4) throw new Error("Expected a surveyed fixture");
    fixed.coverageBounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    fixed.obstacles = [];
    fixed.rivers[0].rings = [
      [
        [-200, -200],
        [200, -200],
        [200, 200],
        [-200, 200]
      ],
      [
        [-20, -20],
        [-20, 20],
        [20, 20],
        [20, -20]
      ]
    ];
    fixed.rivers = [fixed.rivers[0]];
    const water = fixedWaterPolygons(fixed);
    expect(
      polygonHitsWater(
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10]
        ],
        water
      )
    ).toBe(false);
    expect(
      lineHitsWater(
        [
          [30, 30],
          [80, 80]
        ],
        water
      )
    ).toBe(true);
    expect(water.flat().every(p => p.every(v => Math.abs(v) <= 100))).toBe(true);
  });
  it("keeps internal decomposition seams wet but external banks dry", () => {
    const pieces: Point[][] = [
      [
        [0, 0],
        [100, 0],
        [100, 100]
      ],
      [
        [0, 0],
        [100, 100],
        [0, 100]
      ]
    ];
    expect(
      dryRuns(
        [
          [10, 10],
          [90, 90]
        ],
        pieces
      )
    ).toEqual([]);
    expect(
      lineHitsWater(
        [
          [10, 0],
          [90, 0]
        ],
        pieces
      )
    ).toBe(false);
  });
  it("finds a narrow crossing without a wet centroid or vertex, including concave water", () => {
    const cell: Point[] = [
      [-200, 0],
      [200, 0],
      [200, 400],
      [-200, 400]
    ];
    expect(cellInsideWater(cell, channel)).toBe(false);
    expect(polygonHitsWater(cell, [channel])).toBe(true);
    expect(
      lineHitsWater(
        [
          [0, 0],
          [0, 400]
        ],
        [channel]
      )
    ).toBe(true);
    const runs = dryRuns(
      [
        [0, 0],
        [0, 400]
      ],
      [channel]
    );
    expect(runs).toHaveLength(2);
    expect(runs[0][1][1]).toBeCloseTo(135);
    expect(runs[1][0][1]).toBeCloseTo(232);
    expect(
      lineHitsWater(
        [
          [-600, 135],
          [600, 135]
        ],
        [channel]
      )
    ).toBe(false);
    const bent: Point[] = [
      [0, 100],
      [100, 100],
      [100, 300],
      [300, 300],
      [300, 400],
      [0, 400]
    ];
    expect(
      polygonHitsWater(
        [
          [150, 150],
          [200, 150],
          [200, 200],
          [150, 200]
        ],
        [bent]
      )
    ).toBe(false);
    expect(
      polygonHitsWater(
        [
          [50, 150],
          [150, 150],
          [150, 200],
          [50, 200]
        ],
        [bent]
      )
    ).toBe(true);
  });
  it.each(["voronoi", "evolution"] as const)(
    "retains a 97m channel on a %s mesh and uses it for rendering, walls, roads and buildings",
    grid => {
      const site = synthSite(
        "smallTown",
        {
          ...DEFAULT_SITE_CONFIG,
          coast: "none",
          rivers: ["straight"],
          features: { walls: true, citadel: false, plaza: true, temple: false, port: false, shanty: false }
        },
        "continuous-water",
        { extentMeters: 1200, cityRadiusMeters: 240 }
      );
      site.transport = { maxBridgeCrossingMeters: 50 };
      Object.assign(site.rivers[0], {
        widthMeters: 97,
        throughBurgCell: true,
        crossesSite: true,
        cityBank: "right",
        segments: [
          {
            points: [
              [-600, 183.5],
              [600, 183.5]
            ],
            widthsMeters: [97, 97]
          }
        ],
        leftBankSegments: [
          [
            [-600, 232],
            [600, 232]
          ]
        ],
        rightBankSegments: [
          [
            [-600, 135],
            [600, 135]
          ]
        ]
      });
      const geo = siteToGeography(site);
      const source = createGridDocument({ size: "small", seed: "continuous-water", grid, cityRadiusMeters: 240 });
      const settings = { ...defaultGenerationSettings(), descriptor: site };
      const wet = generateStageOnDocument(source, settings, "continuous-water", 1)!;
      expect(wet).toBeTruthy();
      expect(waterPolygons(wet)).toEqual(geo.channels!.map(c => c.polygon));
      for (const face of Object.values(wet.mesh.faces).filter(f => f.properties.water !== "land"))
        expect(cellInsideWater(facePoints(wet.mesh, face), waterPolygons(wet)[0])).toBe(true);
      expect(parseDocument(JSON.stringify(wet))?.waterAreas).toEqual(wet.waterAreas);
      const svg = renderEditorSvg(wet, "select", {}, "-600 -600 1200 1200", 1);
      expect(svg.querySelectorAll(".ce-continuous-water path")).toHaveLength(1);
      const city = generateStageOnDocument(source, settings, "continuous-water", 6)!;
      expect(city).toBeTruthy();
      expect(validate(city)).toEqual([]);
      expect(city.featureGroups.some(g => g.kind === "wall")).toBe(true);
      expect(city.featureGroups.some(g => g.kind === "road")).toBe(true);
      expect(buildCityBuildings(city).length).toBeGreaterThan(0);
      for (const group of city.featureGroups.filter(g => g.kind === "wall" || g.kind === "road"))
        expect(
          lineHitsWater(
            featureGroupVertices(city, group).map(id => city.mesh.vertices[id].point),
            waterPolygons(city)
          ),
          group.id
        ).toBe(false);
      for (const lot of buildCityBuildings(city))
        expect(polygonHitsWater(lot.polygon, waterPolygons(city))).toBe(false);
    }
  );
  it("keeps a 12km river bank when the centreline is outside the city frame", () => {
    const site = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "offscreen-river"
    );
    Object.assign(site.rivers[0], {
      widthMeters: 12000,
      throughBurgCell: true,
      crossesSite: false,
      snappedToBank: false,
      segments: [],
      leftBankSegments: [
        [
          [150, -600],
          [150, 600]
        ]
      ],
      rightBankSegments: []
    });
    const geo = siteToGeography(site);
    expect(geo.channels).toHaveLength(1);
    expect(geo.rivers).toHaveLength(0);
    expect(
      polygonHitsWater(
        [
          [200, -100],
          [300, -100],
          [300, 100],
          [200, 100]
        ],
        geo.channels!.map(c => c.polygon)
      )
    ).toBe(true);
    expect(
      polygonHitsWater(
        [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100]
        ],
        geo.channels!.map(c => c.polygon)
      )
    ).toBe(false);
  });
  it("rejects malformed imported water while accepting legacy documents", () => {
    const source = createSizedDocument("tiny", "water-validation");
    expect(parseDocument(JSON.stringify(source))).toBeTruthy();
    expect(
      parseDocument(
        JSON.stringify({
          ...source,
          waterAreas: [
            {
              kind: "river",
              polygon: [
                [0, 0],
                [1, 1]
              ]
            }
          ]
        })
      )
    ).toBeNull();
  });
});
