import { describe, expect, it } from "vitest";
import { nearestOnPolyline, pointInPolygon } from "../geom";
import { DEFAULT_SITE_CONFIG } from "./siteConfig";
import { resolveWallPlan, siteToGeography, siteToProgram } from "./siteInput";
import { synthSite } from "./synthSite";

describe("independent sea defenses", () => {
  it.each([
    { capital: false, citadel: false },
    { capital: true, citadel: false },
    { capital: false, citadel: true },
    { capital: true, citadel: true }
  ])("leaves a harbour open regardless of capital=$capital / castle=$citadel", flags => {
    const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "bay" }, "sea-defense");
    Object.assign(site.burg, { walls: true, port: true, ...flags });
    const program = siteToProgram(site);
    expect(program.wallPlan?.coast).toBe("open");
    expect(resolveWallPlan(program.wallPlan!, { coast: "seaWall" }).coast).toBe("seaWall");
    site.burg.port = false;
    expect(siteToProgram(site).wallPlan?.coast).toBe("seaWall");
  });
});

describe("wide-channel bank clearance", () => {
  it.each(["both", "one", "unequal"] as const)("keeps disconnected %s-bank fragments separate", banks => {
    const site = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "disconnected-frontage",
      { extentMeters: 3000, cityRadiusMeters: 80 }
    );
    site.burg.port = false;
    site.transport = { maxBridgeCrossingMeters: 100 };
    Object.assign(site.rivers[0], {
      widthMeters: 40,
      cityBank: "left",
      snappedToBank: false,
      segments: [
        {
          points: [
            [1000, -900],
            [1100, -800]
          ],
          widthsMeters: [40, 40]
        },
        {
          points: [
            [1100, 800],
            [1000, 900]
          ],
          widthsMeters: [40, 40]
        }
      ],
      leftBankSegments: [
        [
          [980, -900],
          [1080, -800]
        ],
        [
          [1080, 800],
          [980, 900]
        ]
      ],
      rightBankSegments:
        banks === "one"
          ? []
          : banks === "unequal"
            ? [
                [
                  [1120, 800],
                  [1020, 900]
                ]
              ]
            : [
                [
                  [1020, -900],
                  [1120, -800]
                ],
                [
                  [1120, 800],
                  [1020, 900]
                ]
              ]
    });
    const before = JSON.stringify(site);
    const geo = siteToGeography(site);
    expect(geo.channels).toHaveLength(2);
    expect(geo.channels!.every(c => !pointInPolygon([1100, 0], c.polygon))).toBe(true);
    expect(geo.channels!.some(c => pointInPolygon([1050, -850], c.polygon))).toBe(true);
    expect(geo.channels!.some(c => pointInPolygon([1050, 850], c.polygon))).toBe(true);
    expect(geo.channels!.every(c => c.shoreline.every(p => p[1] < 0) || c.shoreline.every(p => p[1] > 0))).toBe(true);
    expect(JSON.stringify(site)).toBe(before);
  });

  it.each([
    { y: 0, bank: "left" as const },
    { y: 0, bank: "right" as const },
    { y: -100, bank: "left" as const },
    { y: 100, bank: "right" as const },
    { y: -220, bank: "left" as const },
    { y: 220, bank: "right" as const },
    { y: -400, bank: "left" as const },
    { y: 400, bank: "right" as const }
  ])("keeps a wide river at y=$y on the $bank bank", ({ y, bank }) => {
    const site = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "wide-channel-clearance",
      { extentMeters: 1500, cityRadiusMeters: 240 }
    );
    site.transport = { maxBridgeCrossingMeters: 50 };
    Object.assign(site.rivers[0], {
      widthMeters: 400,
      throughBurgCell: true,
      crossesSite: true,
      cityBank: bank,
      segments: [
        {
          points: [
            [-750, y],
            [750, y]
          ],
          widthsMeters: [400, 400]
        }
      ]
    });

    const geo = siteToGeography(site);
    expect(geo.channels).toHaveLength(1);
    expect(geo.rivers).toHaveLength(0);
    const channel = geo.channels![0];
    expect(pointInPolygon([0, 0], channel.polygon)).toBe(false);
    expect(nearestOnPolyline([0, 0], channel.shoreline).dist).toBeCloseTo(Math.max(72, Math.abs(y) - 200));
    // The far bank remains at its original position; only the near bank moves.
    const farY = y + (bank === "left" ? -200 : 200);
    expect(pointInPolygon([0, (channel.shoreline[0][1] + farY) / 2], channel.polygon)).toBe(true);
    expect(channel.polygon.slice(channel.shoreline.length).every(p => p[1] === farY)).toBe(true);
  });
});

describe("historical crossing policy", () => {
  it("keeps a Leon-sized river bridgeable when loading an old 50m share", () => {
    const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] }, "leon-policy");
    site.historicalPeriod = "ageOfExploration";
    site.transport = { maxBridgeSpanMeters: 50 };
    Object.assign(site.rivers[0], {
      widthMeters: 97,
      throughBurgCell: true,
      crossesSite: true,
      segments: [
        {
          points: [
            [-750, -150],
            [750, -150]
          ],
          widthsMeters: [97, 97]
        }
      ]
    });
    expect(siteToGeography(site).channels).toHaveLength(0);
    expect(siteToGeography(site).rivers[0].bridgeAllowed).toBe(true);
    site.rivers[0].segments[0].widthsMeters = [12000, 12000];
    site.rivers[0].widthMeters = 12000;
    expect(siteToGeography(site).rivers).toHaveLength(0);
  });
});

describe("FMG crossing handoff", () => {
  it("does not generate a bridge for an explicit ferry decision", () => {
    const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] }, "ferry");
    site.rivers[0].crossing = {
      kind: "ferry",
      widthMeters: 30,
      depthMeters: 3,
      clearanceMeters: 4,
      openingMeters: 0,
      navigationRequired: true,
      reason: "navigationClearance"
    };
    expect(siteToGeography(site).rivers[0].bridgeAllowed).toBe(false);
    site.rivers[0].crossing.kind = "movableBridge";
    expect(siteToGeography(site).rivers[0]).toMatchObject({ bridgeAllowed: true, crossing: { kind: "movableBridge" } });
  });
});

describe("river port geometry lost to FMG clipping", () => {
  function riverPort(width = 30) {
    const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "none" }, "clipped-river-port");
    site.burg.port = true;
    site.burg.waterAccess = {
      river: true,
      sea: false,
      lake: false,
      riverId: 42,
      seaFeatureIds: [],
      lakeFeatureIds: [],
      port: { river: true, sea: false, lake: false }
    };
    site.burg.riverPlacement = { riverId: 42, bank: "left", widthMeters: width };
    site.rivers = [];
    return site;
  }
  it("restores a nearby river without inventing an ocean or changing the source", () => {
    const site = riverPort();
    const before = JSON.stringify(site);
    const geo = siteToGeography(site);
    expect(geo.coast).toBeNull();
    expect(geo.waterAreas).toHaveLength(0);
    expect(geo.rivers).toHaveLength(1);
    expect(geo.rivers[0].widths.length).toBeGreaterThan(2);
    expect(geo.rivers[0].widths.every(width => width === 30)).toBe(true);
    expect(nearestOnPolyline([0, 0], geo.rivers[0].corridor).dist).toBeLessThan(site.frame.cityRadiusMeters);
    expect(JSON.stringify(site)).toBe(before);
  });
  it("keeps a 7 km river as a channel with a nearby bank and a dry town", () => {
    const site = riverPort(7000);
    const geo = siteToGeography(site);
    expect(geo.rivers).toHaveLength(0);
    expect(geo.channels).toHaveLength(1);
    expect(pointInPolygon([0, 0], geo.channels![0].polygon)).toBe(false);
    expect(nearestOnPolyline([0, 0], geo.channels![0].shoreline).dist).toBeCloseTo(
      site.frame.cityRadiusMeters * 0.45,
      0
    );
  });
  it("keeps a surveyed course south of town instead of moving it", () => {
    const site = riverPort(40);
    const river = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "surveyed-bend"
    ).rivers[0];
    const half = site.frame.extentMeters / 2;
    Object.assign(river, {
      riverId: 42,
      widthMeters: 40,
      cityBank: "left",
      axisAzimuthDeg: 90,
      offsetMeters: 1000,
      offsetRatio: 1000 / site.frame.cityRadiusMeters,
      segments: [
        {
          points: [
            [-half, -1000],
            [0, -1080],
            [half, -1000]
          ],
          widthsMeters: [40, 40, 40]
        }
      ],
      leftBankSegments: [],
      rightBankSegments: []
    });
    site.rivers = [river];
    const before = JSON.stringify(site);
    const geo = siteToGeography(site);
    const water = geo.channels?.[0]?.shoreline ?? geo.rivers[0]?.corridor ?? [];
    expect(water.length).toBeGreaterThanOrEqual(2);
    expect(water.every(point => point[1] < -500)).toBe(true);
    expect(JSON.stringify(site)).toBe(before);
  });
  it("keeps a surveyed river north of town on that side", () => {
    const site = riverPort(40);
    const river = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "surveyed-north"
    ).rivers[0];
    Object.assign(river, {
      riverId: 42,
      widthMeters: 40,
      cityBank: "right",
      axisAzimuthDeg: 90,
      offsetMeters: 1800,
      offsetRatio: 1800 / site.frame.cityRadiusMeters,
      throughBurgCell: true,
      segments: [
        {
          points: [
            [-200, 1800],
            [200, 1800]
          ],
          widthsMeters: [40, 40]
        }
      ],
      leftBankSegments: [],
      rightBankSegments: []
    });
    site.rivers = [river];
    const geo = siteToGeography(site);
    const water = geo.channels?.[0]?.shoreline ?? geo.rivers[0]?.corridor ?? [];
    expect(water.length).toBeGreaterThanOrEqual(2);
    expect(water.every(point => point[1] > 1000)).toBe(true);
  });
  it.each([
    { limit: 1000, depth: 2, kind: "fixedBridge" },
    { limit: 50, depth: 2, kind: "ferry" },
    { limit: 1000, depth: null, kind: "ferry" }
  ])("retains both road banks for $kind (limit=$limit, depth=$depth)", ({ limit, depth, kind }) => {
    const site = riverPort(300);
    site.historicalPeriod = "ageOfExploration";
    site.transport = { maxBridgeCrossingMeters: limit };
    const river = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "crossing-bank"
    ).rivers[0];
    Object.assign(river, {
      riverId: 42,
      widthMeters: 300,
      depthMeters: depth,
      crossing: undefined,
      axisAzimuthDeg: 90,
      cityBank: "left",
      segments: [],
      leftBankSegments: [],
      rightBankSegments: []
    });
    site.rivers = [river];
    site.roads = [
      {
        ...site.roads[0],
        routeId: 12,
        group: "roads",
        path: [
          [0, 0],
          [0, -site.frame.extentMeters]
        ],
        entryAzimuthDeg: 180
      }
    ];
    const connection = siteToGeography(site, true).importedRoads![0].riverConnection!;
    expect(connection).toBeDefined();
    expect(connection.crossing.kind).toBe(kind);
    expect(connection.farRoad.at(-1)![1]).toBe(-site.frame.extentMeters / 2);
    expect(connection.banks[1][1]).toBeLessThan(connection.banks[0][1]);
    expect(connection.townRoad.at(-1)).toEqual(connection.banks[0]);
  });
  it("does not infer a river from a coastal anchor", () => {
    const site = riverPort();
    site.burg.waterAccess!.port.river = false;
    site.burg.waterAccess!.port.sea = true;
    expect(siteToGeography(site).rivers).toHaveLength(0);
  });
});
