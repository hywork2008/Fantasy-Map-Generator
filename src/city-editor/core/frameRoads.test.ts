import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { bindSimulationBurgState } from "../../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { evaluateRiverCubic, type RiverCubic } from "../../services/riverCurveGeometry";
import { pointInWater } from "../../services/riverPhysicalGeometry";
import type { FixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { shareFromDescriptor } from "../io/incomingCity";
import { renderFixedSitePreview } from "../render/fixedSitePreview";
import { renderStandaloneCitySvg } from "../render/svg";
import { createGridDocument, descriptorFrameGridOptions, townMeshExtentMeters } from "./document";
import { frameRoadConnectedToTown, frameRoadTownConnection } from "./frameRoadConnection";
import { type FrameRoadLeg, frameRoadLegs } from "./frameRoads";
import type { BurgSiteDescriptor, BurgSiteRoadEntry } from "./gen/site/burgSiteDescriptor";
import { importedRoadsForSite } from "./gen/site/importedRoads";
import { DEFAULT_SITE_CONFIG } from "./gen/site/siteConfig";
import { synthSite } from "./gen/site/synthSite";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import type { Point } from "./types";

const band: FixedBurgCrossings["rivers"][number] = {
  id: 6,
  geometryVersion: 1,
  rings: [
    [
      [-700, 200],
      [700, 200],
      [700, 500],
      [-700, 500]
    ]
  ],
  sourceSegments: [0],
  artificialCaps: [],
  bankPrecisionMeters: 0.5
};

function road(routeId: number, end: [number, number]): BurgSiteRoadEntry {
  return {
    routeId,
    group: "roads",
    entryAzimuthDeg: 0,
    reachesEdge: true,
    path: [[0, 0], end],
    nextBurg: null
  };
}

function siteWith(roads: BurgSiteRoadEntry[], crossings: FixedBurgCrossings["crossings"] = []): BurgSiteDescriptor {
  const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] }, "frame-roads", {
    extentMeters: 1500,
    cityRadiusMeters: 90
  });
  const bounds = { minX: -400, minY: -400, maxX: 400, maxY: 400 };
  site.frame.extentMeters = 1500;
  site.frame.cityRadiusMeters = 90;
  site.frame.requiredBounds = bounds;
  site.historicalPeriod = "ageOfExploration";
  site.transport = { maxBridgeCrossingMeters: 1000 };
  const river = site.rivers[0];
  river.riverId = 6;
  river.depthMeters = 2;
  river.widthMeters = 300;
  river.segments = [
    {
      points: [
        [-800, 350],
        [800, 350]
      ],
      widthsMeters: [300, 300]
    }
  ];
  site.roads = roads;
  site.fixedCrossings = {
    schemaVersion: 3,
    coverageBounds: { minX: -750, minY: -750, maxX: 750, maxY: 750 },
    coordinateUnit: "metres",
    revision: 0,
    originMeters: [
      site.frame.originMapUnits[0] * site.frame.metersPerMapUnit,
      site.frame.originMapUnits[1] * site.frame.metersPerMapUnit
    ],
    roadWidthMeters: 5,
    requiredBounds: bounds,
    rivers: [band],
    crossings
  };
  return site;
}

function bridges(legs: FrameRoadLeg[]) {
  return legs.flatMap(leg => leg.pieces.filter(piece => piece.kind === "bridge").map(piece => ({ leg, piece })));
}

function maxY(legs: FrameRoadLeg[]): number {
  return Math.max(...legs.flatMap(leg => leg.pieces.flatMap(piece => piece.points.map(point => point[1]))));
}

describe("frame roads", () => {
  it("keeps the town mesh fitted and continues a dry road to the frame", () => {
    const site = siteWith([road(1, [750, 0]), road(2, [40, 0])]);
    expect(townMeshExtentMeters(site.frame)).toBe(300);
    const legs = frameRoadLegs(site, "beyond-mesh");
    expect(legs.map(leg => leg.routeId)).toEqual([1]);
    expect(legs[0].pieces).toHaveLength(1);
    expect(legs[0].pieces[0].kind).toBe("road");
    expect(legs[0].pieces[0].points[0][0]).toBeCloseTo(150);
    expect(legs[0].pieces[0].points.at(-1)).toEqual([750, 0]);
    expect(frameRoadLegs(site, "frame")[0].pieces[0].points[0]).toEqual([0, 0]);
  });

  it("crosses a river on the normal through the centerline, not along the road chord", () => {
    const site = siteWith([road(1, [0, 750]), road(2, [750, 750])]);
    const legs = frameRoadLegs(site, "beyond-mesh");
    const spanned = bridges(legs);
    expect(spanned).toHaveLength(2);
    const north = spanned.find(span => span.leg.routeId === 1)!;
    const diagonal = spanned.find(span => span.leg.routeId === 2)!;
    expect(north.piece.points[0][0]).toBeCloseTo(0, 3);
    expect(north.piece.points[1][0]).toBeCloseTo(0, 3);
    expect(north.piece.points[0][1]).toBeLessThan(200);
    expect(north.piece.points[1][1]).toBeGreaterThan(500);
    const [a, b] = diagonal.piece.points;
    expect(a[0]).toBeCloseTo(350, 3);
    expect(b[0]).toBeCloseTo(350, 3);
    expect(Math.abs(b[0] - a[0])).toBeLessThan(1e-6);
    const deck = [b[0] - a[0], b[1] - a[1]] as Point;
    const length = Math.hypot(deck[0], deck[1]);
    expect(Math.abs(deck[0] / length)).toBeLessThan(1e-6);
    const q: Point = [350, 350];
    const t = ((q[0] - a[0]) * deck[0] + (q[1] - a[1]) * deck[1]) / (length * length);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    for (const leg of legs)
      for (const piece of leg.pieces)
        if (piece.kind === "road")
          for (const point of piece.points) expect(point[1] <= 200.5 || point[1] >= 499.5).toBe(true);
    for (const leg of legs) expect(leg.pieces.at(-1)!.points.at(-1)![1]).toBeGreaterThan(700);
  });

  it("follows the bank beside a road that runs along the channel and still reaches the frame", () => {
    const site = siteWith([road(1, [750, 215])]);
    site.roads[0].path = [
      [0, 215],
      [750, 215]
    ];
    site.fixedCrossings!.rivers = [
      {
        ...site.fixedCrossings!.rivers[0],
        rings: [
          [
            [-700, 200],
            [700, 200],
            [700, 230],
            [-700, 230]
          ]
        ]
      }
    ];
    site.rivers[0].widthMeters = 30;
    site.rivers[0].segments = [
      {
        points: [
          [-800, 215],
          [800, 215]
        ],
        widthsMeters: [30, 30]
      }
    ];
    const legs = frameRoadLegs(site, "beyond-mesh");
    expect(bridges(legs)).toHaveLength(0);
    expect(legs.at(-1)?.pieces.at(-1)?.points.at(-1)).toEqual([750, 215]);
    for (const leg of legs)
      for (const piece of leg.pieces)
        for (const point of piece.points)
          if (point[0] > 200.5 && point[0] < 699.5) expect(point[1] <= 200.5 || point[1] >= 229.5).toBe(true);
  });

  it("stops a road at the near bank when the channel is wider than the crossing allowance", () => {
    const site = siteWith([road(1, [0, 750])]);
    site.transport = { maxBridgeCrossingMeters: 50 };
    const legs = frameRoadLegs(site, "beyond-mesh");
    expect(bridges(legs)).toHaveLength(0);
    expect(maxY(legs)).toBeLessThan(201);
    expect(maxY(legs)).toBeGreaterThan(150);
  });

  it("reuses one deck for shared branches and an imported facility", () => {
    const shared = road(1, [0, 750]);
    shared.sharedBranches = [
      {
        routeId: 10,
        path: [
          [0, 0],
          [0, 750]
        ],
        nextBurg: null
      },
      {
        routeId: 11,
        path: [
          [0, 0],
          [0, 750]
        ],
        nextBurg: null
      }
    ];
    const legs = frameRoadLegs(siteWith([shared, road(2, [750, 750])]), "beyond-mesh");
    expect(bridges(legs)).toHaveLength(2);
    expect(bridges(legs).filter(span => span.leg.routeId === 10 || span.leg.routeId === 11)).toHaveLength(1);

    const placed = siteWith(
      [road(1, [0, 750]), road(2, [750, 750])],
      [
        {
          id: 1,
          riverId: 6,
          geometryVersion: 1,
          kind: "fixedBridge",
          q: [0, 350],
          tangent: [1, 0],
          normal: [0, 1],
          waterA: [0, 200],
          waterB: [0, 500],
          deckA: [0, 199.3],
          deckB: [0, 500.7],
          approachA: [0, 190],
          approachB: [0, 510],
          witness: {
            kind: "line",
            controls: [
              [0, 190],
              [0, 510]
            ],
            parameter: 0.5
          }
        }
      ]
    );
    const reused = frameRoadLegs(placed, "beyond-mesh");
    expect(bridges(reused).map(span => span.leg.routeId)).toEqual([2]);
    const north = reused.find(leg => leg.routeId === 1)!;
    expect(north.pieces.some(piece => piece.points.some(point => point[1] > 600))).toBe(true);
    expect(north.pieces.some(piece => piece.points.some(point => point[1] < 180))).toBe(true);
  });

  it("continues a shared branch from the far approach to the fitted frame", () => {
    const site = siteWith(
      [],
      [
        {
          id: 1,
          riverId: 6,
          geometryVersion: 1,
          kind: "fixedBridge",
          q: [80, 0],
          tangent: [0, 1],
          normal: [1, 0],
          waterA: [70, 0],
          waterB: [90, 0],
          deckA: [69.3, 0],
          deckB: [90.7, 0],
          approachA: [65, 0],
          approachB: [95, 0],
          witness: {
            kind: "line",
            controls: [
              [65, 0],
              [95, 0]
            ],
            parameter: 0.5
          }
        }
      ]
    );
    site.frame.extentMeters = 300;
    site.frame.cityRadiusMeters = 80;
    site.frame.requiredBounds = { minX: 40, minY: -20, maxX: 100, maxY: 20 };
    site.fixedCrossings!.coverageBounds = { minX: -150, minY: -150, maxX: 150, maxY: 150 };
    site.fixedCrossings!.rivers = [
      {
        ...site.fixedCrossings!.rivers[0],
        rings: [
          [
            [70, -200],
            [90, -200],
            [90, 200],
            [70, 200]
          ]
        ]
      }
    ];
    site.rivers[0].widthMeters = 20;
    site.rivers[0].segments = [
      {
        points: [
          [80, -200],
          [80, 200]
        ],
        widthsMeters: [20, 20]
      }
    ];
    const branch = road(1, [95, 0]);
    branch.sharedBranches = [
      {
        routeId: 10,
        path: [
          [0, 0],
          [65, 0],
          [69.3, 0],
          [90.7, 0],
          [95, 0],
          [400, 20]
        ],
        nextBurg: null
      },
      {
        routeId: 11,
        path: [
          [0, 0],
          [65, 0],
          [69.3, 0],
          [90.7, 0],
          [95, 0],
          [400, -30]
        ],
        nextBurg: null
      }
    ];
    site.roads = [branch];
    expect(townMeshExtentMeters(site.frame)).toBe(300);
    const legs = frameRoadLegs(site, "beyond-mesh");
    expect(bridges(legs)).toHaveLength(0);
    expect(legs.map(leg => leg.routeId).sort()).toEqual([10, 11]);
    for (const leg of legs) {
      const end = leg.pieces.at(-1)!.points.at(-1)!;
      expect(Math.max(Math.abs(end[0]), Math.abs(end[1]))).toBeCloseTo(150, 3);
      expect(end[0]).toBeGreaterThan(140);
    }
  });

  it("continues a bank to the frame when the descriptor end stays in the channel", () => {
    const site = siteWith([road(1, [450, 750])]);
    site.fixedCrossings!.rivers = [
      {
        ...site.fixedCrossings!.rivers[0],
        rings: [
          [
            [40, 900],
            [840, -700],
            [1466, -387],
            [666, 1213]
          ]
        ]
      }
    ];
    site.rivers[0].widthMeters = 700;
    site.rivers[0].segments = [
      {
        points: [
          [353, 1056],
          [1153, -543]
        ],
        widthsMeters: [700, 700]
      }
    ];
    const legs = frameRoadLegs(site, "beyond-mesh");
    const end = legs[0].pieces.at(-1)!.points.at(-1)!;
    expect(Math.max(Math.abs(end[0]), Math.abs(end[1]))).toBeGreaterThan(747);
    expect(end[1]).toBeGreaterThan(700);
    expect(pointInWater(end, { id: 6, rings: site.fixedCrossings!.rivers[0].rings })).toBe(false);
    for (const span of bridges(legs)) {
      const [a, b] = span.piece.points;
      const deck: Point = [b[0] - a[0], b[1] - a[1]];
      const tangent: Point = [800, -1600];
      const deckLength = Math.hypot(deck[0], deck[1]);
      const tangentLength = Math.hypot(tangent[0], tangent[1]);
      expect(Math.abs((deck[0] * tangent[0] + deck[1] * tangent[1]) / (deckLength * tangentLength))).toBeLessThan(1e-6);
    }
  });

  it("stops an imported road on the town side when the mesh edge is in the river", () => {
    const site = siteWith([road(1, [0, 750]), road(2, [750, 0])]);
    site.fixedCrossings!.rivers = [
      {
        ...site.fixedCrossings!.rivers[0],
        rings: [
          [
            [-400, 100],
            [400, 100],
            [400, 400],
            [-400, 400]
          ]
        ]
      }
    ];
    const roads = importedRoadsForSite(site);
    const north = roads.find(item => item.routeId === 1)!;
    const east = roads.find(item => item.routeId === 2)!;
    expect(north.path.at(-1)![1]).toBeLessThan(100);
    expect(north.path.at(-1)![1]).toBeGreaterThan(80);
    expect(pointInWater(north.path.at(-1)!, { id: 6, rings: site.fixedCrossings!.rivers[0].rings })).toBe(false);
    expect(east.path.at(-1)).toEqual([150, 0]);
  });

  it("draws road directions on the imported crossing preview", () => {
    const site = siteWith([road(1, [0, 750])]);
    const svg = renderFixedSitePreview(site);
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-label")).toBe("Imported fixed river crossings and road directions");
    expect(svg!.querySelector("[data-frame-road]")).not.toBeNull();
    expect(svg!.querySelector("[data-frame-bridge]")?.getAttribute("stroke-linecap")).toBe("butt");
    const deck = svg!.querySelector("[data-frame-bridge]")!.getAttribute("d")!;
    expect(deck.startsWith("M0,")).toBe(true);
    expect(deck).toContain("L0,");
  });
});

const archive = resolve(process.cwd(), "temp/000.savdata/Bria 2026-10-04-17-10.fmg");

describe.skipIf(!existsSync(archive))("Tverdur frame roads", () => {
  it("carries the land roads to the frame and bridges route 24 on the river normal", async () => {
    const buffer = readFileSync(archive);
    const validated = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(4, buffer.byteLength))
    });
    Object.assign(worldContext, validated.document.world);
    bindSimulationBurgState(worldContext, validated.document.simulation);
    const routeIds = worldContext.pack.routes.map(route => route.i);
    const site = getBurgSiteDescriptor(98);
    expect(worldContext.pack.routes.map(route => route.i)).toEqual(routeIds);
    expect(site?.burg.name).toBe("Tverdur");
    if (!site) return;
    const legs = frameRoadLegs(site, "beyond-mesh");
    const land = site.roads.flatMap((road, sourceIndex) =>
      road.group === "searoutes"
        ? []
        : [{ sourceIndex, routeId: road.routeId, end: road.sharedBranches?.[0]?.path.at(-1) ?? road.path.at(-1)! }]
    );
    expect(land.length).toBeGreaterThanOrEqual(3);
    for (const road of land) {
      const leg = legs.find(item => item.sourceIndex === road.sourceIndex && item.routeId === road.routeId);
      expect(leg, `route ${road.routeId}`).toBeTruthy();
      const end = leg!.pieces.at(-1)!.points.at(-1)!;
      expect(Math.hypot(end[0] - road.end[0], end[1] - road.end[1]), `route ${road.routeId}`).toBeLessThanOrEqual(25);
    }
    const crossing = site.fixedCrossings!.crossings;
    expect(crossing).toHaveLength(1);
    expect(bridges(legs)).toHaveLength(0);
    const c = crossing[0];
    expect(c.witness.kind).toBe("cubic");
    const derivative = evaluateRiverCubic(c.witness.controls as unknown as RiverCubic, c.witness.parameter).derivative;
    const deck: Point = [c.deckB[0] - c.deckA[0], c.deckB[1] - c.deckA[1]];
    expect(
      Math.abs((deck[0] * derivative[0] + deck[1] * derivative[1]) / (Math.hypot(...deck) * Math.hypot(...derivative)))
    ).toBeLessThan(1e-9);
    expect(pointInWater(c.q, site.fixedCrossings!.rivers[0])).toBe(true);
    const share = shareFromDescriptor(site);
    const document = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: share.gridSeed ?? share.seed,
      patchParams: share.patchParams,
      ...descriptorFrameGridOptions(site.frame),
      measureBlockSize: share.measureBlockSize
    });
    const settings = defaultGenerationSettings();
    settings.descriptor = share.descriptor;
    const city = generateCityOnDocument(document, settings, site.burg.seed);
    expect(city).not.toBeNull();
    const drawn = renderStandaloneCitySvg(city!);
    expect(drawn.querySelectorAll(".ce-frame-road").length).toBeGreaterThanOrEqual(3);
    expect(drawn.querySelectorAll("[data-facility-id]")).toHaveLength(1);
    expect(drawn.querySelectorAll("[data-frame-bridge]")).toHaveLength(0);
    // Straight shared endpoints need no extra boundary connector path.
    const connectors = city!.frameRoads!.filter(leg => {
      const connection = frameRoadTownConnection(city!, leg);
      return connection && Math.hypot(connection[0][0] - connection[1][0], connection[0][1] - connection[1][1]) > 1e-5;
    });
    expect(drawn.querySelectorAll("[data-frame-connection]")).toHaveLength(connectors.length);
    for (const leg of city!.frameRoads!)
      expect(frameRoadConnectedToTown(city!, leg), `route ${leg.routeId}`).toBe(true);
  }, 60_000);
});
