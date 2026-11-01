import { describe, expect, it } from "vitest";
import type { ApproachProfile } from "../../services/approachProfile";
import { renderAerialLandmarks } from "../renderers/aerialLandmarksSvg";
import type { BurgSiteRoadEntry } from "../types/contracts/burgSiteDescriptor";
import type { BurgSiteEconomy } from "../types/contracts/burgSiteEconomy";
import type { CityDocument, EdgeFeatureGroup } from "../types/document";
import type { GenerationSettings } from "../types/generationSettings";
import type { Point } from "../types/primitives";
import { buildAerialLandmarkPlan } from "./aerialLandmarks";
import type { BuildingLot } from "./buildingLots";
import {
  type CourtAdmission,
  commerceInnRequest,
  courtAdmission,
  courtAreaM2,
  courtBox,
  placeGateInns,
  stableSpacesFromWagons
} from "./gateInnPlacement";
import { nearestOnPolyline, polygonArea } from "./geom";
import type { GuildSiteView } from "./guildFacilityPlacement";

function profile(partial: Partial<ApproachProfile> = {}): ApproachProfile {
  return {
    share: 0.2,
    throughShare: 0,
    inboundShare: 0.5,
    cargo: {},
    cargoValue: {},
    wagonsPerYear: 12,
    source: "ledger",
    ...partial
  };
}

function roadEntry(
  approachId: string,
  routeId: number,
  partial: Partial<ApproachProfile> & { traffic?: number; trafficRank?: number; group?: string } = {}
): BurgSiteRoadEntry {
  const { traffic, trafficRank, group, ...profilePartial } = partial;
  return {
    approachId,
    routeId,
    group: group ?? "roads",
    entryAzimuthDeg: 0,
    reachesEdge: true,
    path: [
      [0, 0],
      [1, 0]
    ],
    nextBurg: null,
    ...(traffic != null ? { traffic } : {}),
    ...(trafficRank != null ? { trafficRank } : {}),
    ...(Object.keys(profilePartial).length || partial.wagonsPerYear != null || partial.share != null
      ? { approachProfile: profile(profilePartial) }
      : {})
  };
}

function settings(
  approachCommerce: "off" | "on" | undefined,
  roads: BurgSiteRoadEntry[],
  port = false
): GenerationSettings {
  return {
    ...(approachCommerce ? { approachCommerce } : {}),
    config: {
      coast: "none",
      rivers: [],
      relief: false,
      features: { walls: false, citadel: false, plaza: false, temple: false, port, shanty: false },
      wall: { envelope: "auto", coast: "auto", line: "auto" }
    },
    descriptor: { burg: { port }, roads } as GenerationSettings["descriptor"]
  } as GenerationSettings;
}

function addLine(document: CityDocument, id: string, axis: "x" | "y", sourceIndex: number, routeId: number): void {
  const count = 9;
  for (let i = 0; i < count; i++) {
    const vertexId = `${id}-v${i}`;
    document.mesh.vertices[vertexId] = {
      id: vertexId,
      point: axis === "x" ? [i * 50, 0] : [0, i * 50],
      locked: false
    };
    if (i === 0) continue;
    const edgeId = `${id}-e${i}`;
    document.mesh.edges[edgeId] = {
      id: edgeId,
      a: `${id}-v${i - 1}`,
      b: vertexId,
      leftFace: null,
      rightFace: null,
      locked: false
    };
  }
  document.featureGroups.push({
    id,
    kind: "road",
    name: id,
    segments: Array.from({ length: count - 1 }, (_, i) => ({ edgeId: `${id}-e${i + 1}`, forward: true })),
    style: { widthMeters: 4, color: "#444" },
    locked: false,
    sourceRoad: { index: sourceIndex, routeId }
  });
}

function town(
  roads: BurgSiteRoadEntry[],
  approachCommerce: "off" | "on" | undefined,
  port = false,
  economy?: BurgSiteEconomy
): CityDocument {
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 2000, cityRadiusMeters: 80, blockSizeMeters: 20 },
    mesh: { vertices: {}, edges: {}, faces: {} },
    featureGroups: [],
    gates: [],
    elements: [],
    ...(economy ? { siteEconomy: economy } : {}),
    fabric: {
      version: 4,
      seed: "c2",
      districts: [],
      generation: {
        algorithm: "evolution-city-v3",
        seed: "c2",
        settings: settings(approachCommerce, roads, port),
        input: { format: "fmg-city-editor", version: 1 } as Omit<CityDocument, "fabric">
      }
    }
  };
  addLine(document, "main", "x", 0, roads[0]?.routeId ?? 1);
  if (roads.length > 1) addLine(document, "busy", "y", 1, roads[1]?.routeId ?? 2);
  return document;
}

function openSite(document: CityDocument): GuildSiteView {
  return {
    document,
    town: [],
    insideTown: () => false,
    townDistance: () => 30,
    inFrame: () => true,
    hitsWater: () => false,
    hitsRoutes: () => false,
    hitsBlocked: () => false,
    hitsLanes: () => false,
    buildingsIn: () => [],
    claim: () => {},
    clearsGlacis: () => true,
    approachClearance: () => 0,
    outworkReach: () => 0
  };
}

function lineOf(points: Point[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(2)} ${(-point[1]).toFixed(2)}`).join(" ");
}

function centre(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length
  ];
}

function roadPoints(document: CityDocument, id: string): Point[] {
  const group = document.featureGroups.find(group => group.id === id);
  if (!group || group.kind === "river") return [];
  return group.segments.flatMap(segment => {
    const edge = document.mesh.edges[segment.edgeId];
    const point = edge && document.mesh.vertices[segment.forward ? edge.b : edge.a]?.point;
    return point ? [point] : [];
  });
}

const LOT: BuildingLot = {
  faceId: "f",
  landmark: false,
  polygon: [
    [10, 10],
    [12, 10],
    [12, 12],
    [10, 12]
  ]
};

const ECONOMY: BurgSiteEconomy = {
  version: 1,
  year: 1350,
  commerce: { rank: 0.4, marketCenter: false, merchantHouse: null, mint: false, caravanArrivalRank: 0.4 },
  guilds: [],
  storage: [],
  facilities: [
    { kind: "inn", count: 1, scale: 0.8, stableSpaces: 4 },
    { kind: "caravanserai", count: 1, scale: 0.7, stableSpaces: 36 }
  ],
  tradePartners: []
};

describe("commerce inn court", () => {
  it("grows the drawn court with wagon count and refuses a court that cannot turn or pass", () => {
    expect(stableSpacesFromWagons(0)).toBe(0);
    expect(stableSpacesFromWagons(-4)).toBe(0);
    expect(stableSpacesFromWagons(Number.NaN)).toBe(0);
    expect(stableSpacesFromWagons(10.6)).toBe(11);
    expect(courtAdmission(0)).toBeNull();
    expect(courtAdmission(4)).toBe("through");
    expect(courtAdmission(30)).toBe("through");
    expect(courtAdmission(31)).toBe("turn");
    expect(courtAdmission(40)).toBe("turn");

    const document = town([roadEntry("main", 10, { share: 0.7, wagonsPerYear: 10 })], "on");
    const site = openSite(document);
    const areas = [10, 20, 40, 80].map(wagons => {
      const spaces = stableSpacesFromWagons(wagons);
      const admission = courtAdmission(spaces);
      const placed = placeGateInns(site, [{ kind: "inn", count: 1, scale: 1, stableSpaces: spaces }], 0, {
        group: document.featureGroups[0] as EdgeFeatureGroup,
        admission: admission as CourtAdmission
      });
      expect(placed).toHaveLength(1);
      expect(placed[0].exit === undefined).toBe(admission === "turn");
      return Math.abs(polygonArea(placed[0].court));
    });
    expect(areas.map(area => Math.round(area))).toEqual([120, 240, 480, 960]);
    expect(areas[0]).toBeLessThan(areas[1]);
    expect(areas[1]).toBeLessThan(areas[2]);
    expect(areas[2]).toBeLessThan(areas[3]);
    for (const wagons of [10, 20, 40, 80]) expect(courtBox(wagons).area).toBe(courtAreaM2(wagons));
  });

  it("puts the commerce inn on the main gate even when another road is busier", () => {
    const roads = [
      roadEntry("main", 10, { share: 0.6, wagonsPerYear: 10, traffic: 2, trafficRank: 0.1 }),
      roadEntry("busy", 11, { share: 0.2, wagonsPerYear: 4, traffic: 18, trafficRank: 0.91 })
    ];
    const on = town(roads, "on");
    const request = commerceInnRequest(on);
    expect(request?.group.id).toBe("main");
    expect(request?.lodging.stableSpaces).toBe(10);
    expect(request?.admission).toBe("through");
    const placed = placeGateInns(openSite(on), [request!.lodging], 0, request!);
    expect(placed[0].exit).toBeDefined();
    const at = centre(placed[0].court);
    expect(nearestOnPolyline(at, roadPoints(on, "main")).dist).toBeLessThan(
      nearestOnPolyline(at, roadPoints(on, "busy")).dist
    );
    const exitX = (placed[0].exit![0][0] + placed[0].exit![1][0]) / 2;
    const entranceX = (placed[0].entrance[0][0] + placed[0].entrance[1][0]) / 2;
    expect(exitX).toBeGreaterThan(entranceX);
    const drawn = renderAerialLandmarks({
      domesticWater: [],
      monasteries: [],
      windmills: [],
      barbicans: [],
      tanneries: [],
      gallows: [],
      guildHalls: [],
      guildYards: [],
      storageYards: [],
      gateInns: placed
    });
    const exitPath = lineOf(placed[0].exit!);
    expect(
      [...drawn.querySelectorAll(".ce-gate-inn--inn path")].some(path => path.getAttribute("d") === exitPath)
    ).toBe(true);

    const legacy = placeGateInns(openSite(on), [{ kind: "inn", count: 1, scale: 1, stableSpaces: 4 }], 1200);
    expect(legacy).toHaveLength(1);
    expect(legacy[0].stableSpaces).toBe(4);
    expect(legacy[0].exit).toBeUndefined();
    expect(Math.abs(polygonArea(legacy[0].court))).toBeCloseTo(courtAreaM2(4), 0);
    const legacyAt = centre(legacy[0].court);
    expect(nearestOnPolyline(legacyAt, roadPoints(on, "busy")).dist).toBeLessThan(
      nearestOnPolyline(legacyAt, roadPoints(on, "main")).dist
    );
  });

  it("asks for an inn without traffic or economy, and skips off, zero wagons, and a sea main gate", () => {
    const quiet = [roadEntry("main", 10, { share: 0.8, wagonsPerYear: 40 })];
    const morph = town(quiet, "on");
    expect(commerceInnRequest(morph)?.lodging.stableSpaces).toBe(40);
    expect(commerceInnRequest(town(quiet, undefined))?.group).toBeUndefined();
    expect(commerceInnRequest(town(quiet, "off"))).toBeNull();
    expect(commerceInnRequest(town([roadEntry("main", 10, { share: 0.8, wagonsPerYear: 0.2 })], "on"))).toBeNull();

    const seaRoads = [
      roadEntry("inland", 10, { share: 0.2, wagonsPerYear: 30 }),
      roadEntry("sea", 11, { share: 0.55, wagonsPerYear: 80, group: "searoutes" })
    ];
    expect(commerceInnRequest(town(seaRoads, "on", true))).toBeNull();

    const unlinked = town(quiet, "on");
    for (const group of unlinked.featureGroups) if (group.kind === "road") delete group.sourceRoad;
    expect(commerceInnRequest(unlinked)).toBeNull();
  });

  it("draws the commerce inn from the landmark plan and leaves the economy inn when commerce is off", () => {
    const roads = [
      roadEntry("main", 10, { share: 0.6, wagonsPerYear: 40, traffic: 2, trafficRank: 0.1 }),
      roadEntry("busy", 11, { share: 0.2, wagonsPerYear: 4, traffic: 18, trafficRank: 0.91 })
    ];
    const on = town(roads, "on", false, ECONOMY);
    const input = { buildings: [LOT], lanes: [], farms: [], reserved: [] };
    const first = buildAerialLandmarkPlan(on, input).gateInns;
    const wayside = first.find(inn => inn.kind === "inn");
    const caravan = first.find(inn => inn.kind === "caravanserai");
    expect(wayside?.stableSpaces).toBe(40);
    expect(wayside?.exit).toBeUndefined();
    expect(Math.abs(polygonArea(wayside!.court))).toBeCloseTo(courtAreaM2(40), 0);
    expect(caravan?.stableSpaces).toBe(36);
    expect(caravan?.exit).toBeUndefined();
    for (const inn of first) {
      const at = centre(inn.footprint);
      expect(nearestOnPolyline(at, roadPoints(on, "main")).dist).toBeLessThan(
        nearestOnPolyline(at, roadPoints(on, "busy")).dist
      );
    }

    roads[0].approachProfile!.wagonsPerYear = 10;
    const resized = buildAerialLandmarkPlan(on, input).gateInns.find(inn => inn.kind === "inn");
    expect(resized?.stableSpaces).toBe(10);
    expect(resized?.exit).toBeDefined();
    expect(Math.abs(polygonArea(resized!.court))).toBeCloseTo(120, 0);

    roads[0].approachProfile!.wagonsPerYear = 0;
    const fallen = buildAerialLandmarkPlan(on, input).gateInns;
    const economyInn = fallen.find(inn => inn.kind === "inn");
    expect(economyInn?.stableSpaces).toBe(4);
    expect(economyInn?.exit).toBeUndefined();
    const fallenAt = centre(economyInn!.footprint);
    expect(nearestOnPolyline(fallenAt, roadPoints(on, "busy")).dist).toBeLessThan(
      nearestOnPolyline(fallenAt, roadPoints(on, "main")).dist
    );

    const off = town(
      [
        roadEntry("main", 10, { share: 0.6, wagonsPerYear: 40, traffic: 2, trafficRank: 0.1 }),
        roadEntry("busy", 11, { share: 0.2, wagonsPerYear: 4, traffic: 18, trafficRank: 0.91 })
      ],
      undefined,
      false,
      ECONOMY
    );
    const plain = buildAerialLandmarkPlan(off, input).gateInns.find(inn => inn.kind === "inn");
    expect(plain?.stableSpaces).toBe(4);
    expect(plain?.exit).toBeUndefined();
    const plainAt = centre(plain!.footprint);
    expect(nearestOnPolyline(plainAt, roadPoints(off, "busy")).dist).toBeLessThan(
      nearestOnPolyline(plainAt, roadPoints(off, "main")).dist
    );
  });

  it("keeps a European and caravanserai inn outside, and seats a Japanese inn on the market street", () => {
    const roads = [roadEntry("main", 10, { share: 0.8, wagonsPerYear: 40 })];
    const european = town(roads, "on");
    expect(commerceInnRequest(european)?.seat).toBe("outside");
    const islamic = town(roads, "on", false, ECONOMY);
    expect(commerceInnRequest(islamic)?.seat).toBe("outside");

    const japanese = town(roads, "on");
    japanese.civilization = {
      tradition: "japanese",
      period: "highMedieval",
      faith: "shintoBuddhist",
      cultureFaith: "shintoBuddhist",
      fortification: "japanese",
      culture: { id: 12, name: "Japanese", nameBase: 12 }
    };
    const request = commerceInnRequest(japanese);
    expect(request?.seat).toBe("center");
    const placed = placeGateInns(diskSite(japanese), [request!.lodging], 0, request!);
    const inn = placed.find(item => item.name === "Wayside Inn");
    const toiya = placed.find(item => item.name === "Toiya");
    expect(inn?.kind).toBe("inn");
    expect(Math.hypot(centre(inn!.footprint)[0], centre(inn!.footprint)[1])).toBeLessThan(80);
    expect(toiya?.name).toBe("Toiya");
    expect(Math.hypot(centre(toiya!.footprint)[0], centre(toiya!.footprint)[1])).toBeLessThan(80);

    const outside = placeGateInns(
      diskSite(european),
      [commerceInnRequest(european)!.lodging],
      0,
      commerceInnRequest(european)!
    );
    expect(Math.hypot(centre(outside[0].footprint)[0], centre(outside[0].footprint)[1])).toBeGreaterThan(100);
  });
});

function diskSite(document: CityDocument): GuildSiteView {
  const placed: Point[][] = [];
  const radius = 100;
  return {
    document,
    town: [],
    insideTown: point => Math.hypot(point[0], point[1]) < radius,
    townDistance: point => Math.abs(Math.hypot(point[0], point[1]) - radius),
    inFrame: () => true,
    hitsWater: () => false,
    hitsRoutes: () => false,
    hitsBlocked: polygon =>
      placed.some(existing =>
        polygon.some(point => existing.some(other => Math.hypot(point[0] - other[0], point[1] - other[1]) < 1))
      ),
    hitsLanes: () => false,
    buildingsIn: () => [],
    claim: polygon => {
      placed.push(polygon);
    },
    clearsGlacis: () => true,
    approachClearance: () => 0,
    outworkReach: () => 0
  };
}
