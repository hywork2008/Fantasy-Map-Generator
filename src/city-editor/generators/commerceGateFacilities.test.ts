import { afterAll, beforeAll, describe, expect, it } from "vitest";
import i18n from "../../i18n/index";
import type { ApproachProfile } from "../../services/approachProfile";
import { renderAerialLandmarks } from "../renderers/aerialLandmarksSvg";
import type { CityDocument, Point } from "../types/document";
import type { GenerationSettings } from "../types/generationSettings";
import type { Cell } from "../types/geometry";
import type { ApproachCommerceRoad } from "./approachCommerce";
import {
  bulkGatePoint,
  commerceFacilityRoles,
  facilityRolesFromShares,
  placeCommerceFacilities
} from "./commerceGateFacilities";
import { polygonOverlaps } from "./fortifications";
import type { PlannedGuildFacility } from "./guildFacilities";
import { type GuildSiteView, placeGuildWorks } from "./guildFacilityPlacement";
import { meshFromCells } from "./mesh";

const originalLanguage = i18n.language;

beforeAll(() => i18n.changeLanguage("ja"));
afterAll(() => i18n.changeLanguage(originalLanguage));

function profile(partial: Partial<ApproachProfile> = {}): ApproachProfile {
  return {
    share: 0.2,
    throughShare: 0,
    inboundShare: 0.5,
    cargo: {},
    cargoValue: {},
    wagonsPerYear: 4,
    source: "ledger",
    ...partial
  };
}

function share(partial: {
  gateIndex?: number;
  point?: Point;
  share?: number;
  roadIndex?: number;
  cargo?: ApproachProfile["cargo"];
  cargoValue?: ApproachProfile["cargoValue"];
  inboundShare?: number;
}) {
  return {
    gateIndex: partial.gateIndex ?? 0,
    point: partial.point ?? [80, 0],
    share: partial.share ?? 0.4,
    main: false,
    inboundShare: partial.inboundShare ?? 0.5,
    cargo: partial.cargo ?? {},
    cargoValue: partial.cargoValue ?? {},
    ...(partial.roadIndex === undefined ? {} : { roadIndex: partial.roadIndex })
  };
}

function centre(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length
  ];
}

function hypot(point: Point): number {
  return Math.hypot(point[0], point[1]);
}

describe("cargo facility roles", () => {
  it("splits livestock, grain, bulk, retail, and luxury by the gate that carries them", () => {
    const roles = facilityRolesFromShares(
      [
        share({
          gateIndex: 0,
          point: [90, 0],
          roadIndex: 0,
          share: 0.4,
          cargo: { livestock: 0.55, bulk: 0.6 }
        }),
        share({
          gateIndex: 1,
          point: [-90, 0],
          roadIndex: 1,
          share: 0.35,
          cargo: { grain: 0.7, livestock: 0.05 }
        }),
        share({
          gateIndex: 2,
          point: [0, 90],
          roadIndex: 2,
          share: 0.25,
          cargo: { perishable: 0.3 },
          cargoValue: { luxury: 0.4 }
        })
      ],
      [0, 0]
    );
    const kinds = (index: number) => roles.filter(role => role.roadIndex === index).map(role => role.kind);
    expect(kinds(0).sort()).toEqual(["bulkYard", "livestockMarket"]);
    expect(kinds(1).sort()).toEqual(["grainMarket", "granary"]);
    expect(kinds(2)).toEqual(["caravanserai"]);
    expect(roles.filter(role => role.kind === "retailMarket")).toHaveLength(1);
    expect(roles.find(role => role.kind === "retailMarket")?.point).toEqual([0, 0]);
    expect(bulkGatePoint(roles)).toEqual([90, 0]);
  });

  it("keeps a tied grain class primary and ignores an even luxury split", () => {
    const tied = facilityRolesFromShares([share({ roadIndex: 0, cargo: { grain: 0.4, livestock: 0.4 } })], [0, 0]);
    expect(tied.map(role => role.kind).sort()).toEqual(["grainMarket", "granary", "livestockMarket"]);

    const lesser = facilityRolesFromShares([share({ roadIndex: 0, cargo: { grain: 0.3, livestock: 0.6 } })], [0, 0]);
    expect(lesser.map(role => role.kind)).toEqual(["livestockMarket"]);

    const split = facilityRolesFromShares(
      [
        share({ gateIndex: 0, roadIndex: 0, share: 0.5, cargoValue: { luxury: 0.1 } }),
        share({ gateIndex: 1, point: [-80, 0], roadIndex: 1, share: 0.5, cargoValue: { luxury: 0.1 } })
      ],
      [0, 0]
    );
    expect(split.some(role => role.kind === "caravanserai")).toBe(false);

    const concentrated = facilityRolesFromShares(
      [
        share({ gateIndex: 0, roadIndex: 0, share: 0.8, cargoValue: { luxury: 0.1 } }),
        share({ gateIndex: 1, point: [-80, 0], roadIndex: 1, share: 0.2, cargoValue: { luxury: 0.1 } })
      ],
      [0, 0]
    );
    expect(concentrated.filter(role => role.kind === "caravanserai").map(role => role.roadIndex)).toEqual([0]);

    const sea = facilityRolesFromShares(
      [
        share({
          gateIndex: -1,
          point: [0, 40],
          share: 0.8,
          cargo: { livestock: 0.9, bulk: 0.9 },
          cargoValue: { luxury: 0.5 }
        })
      ],
      [0, 0]
    );
    expect(sea.map(role => role.kind)).toEqual(["caravanserai"]);
    expect(sea[0]?.roadIndex).toBeUndefined();
  });
});

function addApproach(document: CityDocument, id: string, from: Point, to: Point, sourceIndex: number): void {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const vertexId = `${id}-v${i}`;
    document.mesh.vertices[vertexId] = {
      id: vertexId,
      point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
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
    sourceRoad: { index: sourceIndex, routeId: sourceIndex + 1 }
  });
}

function commerceDocument(
  approachCommerce: "off" | "on" | undefined,
  roads: ApproachCommerceRoad[],
  lines: Array<{ id: string; from: Point; to: Point; sourceIndex: number }> = [],
  harbor?: Point,
  port = false
): CityDocument {
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 2000, cityRadiusMeters: 80, blockSizeMeters: 20 },
    mesh: { vertices: {}, edges: {}, faces: {} },
    featureGroups: [],
    gates: [],
    elements: harbor ? [{ id: "harbor", kind: "harbor", faceIds: [], point: harbor, locked: false }] : [],
    fabric: {
      version: 4,
      seed: "c3",
      districts: [],
      generation: {
        algorithm: "evolution-city-v3",
        seed: "c3",
        settings: {
          ...(approachCommerce ? { approachCommerce } : {}),
          config: {
            coast: "none",
            rivers: [],
            relief: false,
            features: { walls: false, citadel: false, plaza: false, temple: false, port, shanty: false },
            wall: { envelope: "auto", coast: "auto", line: "auto" }
          },
          descriptor: { burg: { port }, roads }
        } as GenerationSettings,
        input: { format: "fmg-city-editor", version: 1 } as Omit<CityDocument, "fabric">
      }
    }
  };
  for (const line of lines) addApproach(document, line.id, line.from, line.to, line.sourceIndex);
  return document;
}

/** Open land outside a 100 m town disk. Claimed plots block the next one. */
function ringSite(document: CityDocument): GuildSiteView {
  const placed: Point[][] = [];
  const radius = 100;
  return {
    document,
    town: [],
    insideTown: point => hypot(point) < radius,
    townDistance: point => Math.abs(hypot(point) - radius),
    inFrame: () => true,
    hitsWater: () => false,
    hitsRoutes: () => false,
    hitsBlocked: polygon => placed.some(existing => polygonOverlaps(polygon, existing)),
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

const SPLIT_ROADS: ApproachCommerceRoad[] = [
  {
    approachId: "east",
    group: "roads",
    approachProfile: profile({ share: 0.4, cargo: { livestock: 0.55, bulk: 0.6 } })
  },
  {
    approachId: "west",
    group: "roads",
    approachProfile: profile({ share: 0.35, cargo: { grain: 0.7, livestock: 0.05 } })
  },
  {
    approachId: "north",
    group: "roads",
    approachProfile: profile({ share: 0.25, cargo: { perishable: 0.3 }, cargoValue: { luxury: 0.4 } })
  }
];

const SPLIT_LINES = [
  { id: "livestock", from: [90, 0] as Point, to: [400, 0] as Point, sourceIndex: 0 },
  { id: "grain", from: [-90, 0] as Point, to: [-400, 0] as Point, sourceIndex: 1 },
  { id: "luxury", from: [0, 90] as Point, to: [0, 400] as Point, sourceIndex: 2 }
];

describe("drawn gate facilities", () => {
  it("draws a livestock pen outside its gate and a granary inside the grain gate", () => {
    const document = commerceDocument("on", SPLIT_ROADS, SPLIT_LINES);
    const roles = commerceFacilityRoles(document);
    expect(roles.find(role => role.kind === "livestockMarket")?.point).toEqual([90, 0]);
    expect(roles.find(role => role.kind === "granary")?.point).toEqual([-90, 0]);
    expect(bulkGatePoint(roles)).toEqual([90, 0]);
    const plots = placeCommerceFacilities(ringSite(document), roles);
    const livestock = plots.yards.find(yard => yard.id === "commerce-livestock-0");
    const grain = plots.yards.find(yard => yard.id === "commerce-grain-market-1");
    const granary = plots.yards.find(yard => yard.id === "commerce-granary-1");
    const retail = plots.yards.find(yard => yard.id === "commerce-retail");
    const caravan = plots.inns.find(inn => inn.kind === "caravanserai");
    expect(livestock?.form).toBe("livestockPen");
    expect(livestock?.outside).toBe(true);
    expect(livestock?.polygon.every(point => hypot(point) > 100)).toBe(true);
    expect(centre(livestock!.polygon)[0]).toBeGreaterThan(100);
    expect(grain?.name).toBe("Grain Market");
    expect(grain?.polygon.every(point => hypot(point) < 100)).toBe(true);
    expect(granary?.name).toBe("Granary");
    expect(granary?.outside).toBe(false);
    expect(granary?.polygon.every(point => hypot(point) < 100)).toBe(true);
    const granaryAt = centre(granary!.polygon);
    expect(Math.hypot(granaryAt[0] + 90, granaryAt[1])).toBeLessThan(Math.hypot(granaryAt[0] - 90, granaryAt[1]));
    expect(retail?.form).toBe("warehouse");
    expect(hypot(centre(retail!.polygon))).toBeLessThan(30);
    const caravanAt = centre(caravan!.footprint);
    expect(hypot(caravanAt)).toBeLessThan(Math.hypot(caravanAt[0], caravanAt[1] - 90));
    expect(caravan?.exit).toBeUndefined();
    expect(plots.yards.some(yard => yard.form === "timberYard")).toBe(false);

    const drawn = renderAerialLandmarks({
      domesticWater: [],
      monasteries: [],
      windmills: [],
      barbicans: [],
      tanneries: [],
      gallows: [],
      guildHalls: [],
      guildYards: [],
      storageYards: plots.yards,
      gateInns: plots.inns
    });
    const picks = [...drawn.querySelectorAll("[data-pick]")].map(node =>
      decodeURIComponent(node.getAttribute("data-pick")!)
    );
    expect(picks.some(pick => pick.includes("家畜市"))).toBe(true);
    expect(picks.some(pick => pick.includes("穀倉") && pick.includes("Grain Market"))).toBe(true);
    expect(picks.some(pick => pick.includes("穀倉") && pick.includes("Granary"))).toBe(true);
    expect(picks.some(pick => pick.includes("隊商宿") && pick.includes("Caravanserai"))).toBe(true);
  });

  it("names the centre exchange Khan and sits it closer to the plaza", () => {
    const document = commerceDocument("on", SPLIT_ROADS, SPLIT_LINES);
    const roles = commerceFacilityRoles(document);
    const european = placeCommerceFacilities(ringSite(document), roles).inns.find(inn => inn.kind === "caravanserai");
    const khan = placeCommerceFacilities(ringSite(document), roles, 0, "islamic").inns.find(
      inn => inn.kind === "caravanserai"
    );
    expect(european?.name).toBe("Caravanserai");
    expect(khan?.name).toBe("Khan");
    expect(hypot(centre(khan!.footprint))).toBeLessThan(hypot(centre(european!.footprint)));
    expect(khan?.exit).toBeUndefined();
  });

  it("returns no roles when commerce is off or unset, and drops a sea caravanserai without a harbour", () => {
    expect(commerceFacilityRoles(commerceDocument(undefined, SPLIT_ROADS, SPLIT_LINES))).toEqual([]);
    expect(commerceFacilityRoles(commerceDocument("off", SPLIT_ROADS, SPLIT_LINES))).toEqual([]);
    const seaRoads: ApproachCommerceRoad[] = [
      { approachId: "inland", group: "roads", approachProfile: profile({ share: 0.2 }) },
      {
        approachId: "sea",
        group: "searoutes",
        approachProfile: profile({
          share: 0.8,
          cargo: { livestock: 0.9, perishable: 0.3 },
          cargoValue: { luxury: 0.5 }
        })
      }
    ];
    const dropped = commerceFacilityRoles(commerceDocument("on", seaRoads, [], undefined, true));
    expect(dropped.map(role => role.kind)).toEqual(["retailMarket"]);
    const harbor = commerceFacilityRoles(commerceDocument("on", seaRoads, [], [12, -40], true));
    const caravan = harbor.find(role => role.kind === "caravanserai");
    expect(caravan?.point).toEqual([12, -40]);
    expect(caravan?.roadIndex).toBeUndefined();
    expect(harbor.some(role => role.kind === "livestockMarket" || role.kind === "bulkYard")).toBe(false);
  });
});

function face(id: number, at: Point): Cell {
  const [cx, cy] = at;
  const half = 25;
  return {
    id,
    site: at,
    centroid: at,
    polygon: [
      [cx - half, cy - half],
      [cx + half, cy - half],
      [cx + half, cy + half],
      [cx - half, cy + half]
    ],
    neighbors: [],
    onBorder: false
  };
}

function yardSite(mesh: CityDocument["mesh"]): GuildSiteView {
  return {
    document: { mesh } as CityDocument,
    town: [],
    insideTown: () => false,
    townDistance: point => (point[0] > 100 ? 150 : 20),
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

function facility(
  domain: PlannedGuildFacility["domain"],
  kind: PlannedGuildFacility["ancillary"][number]
): PlannedGuildFacility {
  return {
    domain,
    status: "chapter",
    practitioners: 4,
    hall: false,
    belfry: false,
    workshopWeight: 0,
    ancillary: [kind]
  };
}

describe("bulk guild yards", () => {
  const mesh = meshFromCells([face(0, [200, 30]), face(1, [30, 200])]);

  it("pulls timber to the bulk gate and leaves a sand yard on the old score", () => {
    const site = yardSite(mesh);
    const biased = placeGuildWorks(site, [facility("woodworking", "timberYard")], 1200, [200, 0]);
    expect(centre(biased.yards[0].polygon)[0]).toBeGreaterThan(150);
    const plain = placeGuildWorks(yardSite(mesh), [facility("woodworking", "timberYard")], 1200);
    expect(centre(plain.yards[0].polygon)[0]).toBeLessThan(80);
    const sand = placeGuildWorks(yardSite(mesh), [facility("glassware", "sandYard")], 1200, [200, 0]);
    expect(centre(sand.yards[0].polygon)[0]).toBeLessThan(80);
  });
});
