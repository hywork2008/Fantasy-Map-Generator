import { beforeAll, describe, expect, it } from "vitest";
import { renderAerialLandmarks } from "../../render/aerialLandmarksSvg";
import { renderEditorSvg } from "../../render/svg";
import { createGridDocument } from "../document";
import { featureGroupVertices } from "../features";
import { FixedRoadReservation } from "../fixedRoadReservation";
import { circuitRing, polygonOverlaps } from "../fortifications";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { facePoints } from "../mesh";
import { MoatReservation } from "../moats";
import { flowingRivers } from "../riverFlow";
import type { CityDocument, Point } from "../types";
import {
  aerialLandmarkFootprints,
  buildAerialLandmarkPlan,
  prevailingWindKey,
  TANNERY_WATER_USER_CLEARANCE_METERS,
  windmillFacingRadians
} from "./aerialLandmarks";
import { externalGateRoads } from "./approachBeyond";
import { buildBlockFabric, type DistrictFabric, FabricCache } from "./blockInfill";
import { courtAreaM2, innClearsRoad } from "./gateInnPlacement";
import { convexHull, nearestOnPolyline, pointInPolygon, polygonArea, shrinkPolygon } from "./geom";
import { COBBLE_WIDTH_SCALE } from "./roadTraffic";
import type { BurgSiteDescriptor } from "./site/burgSiteDescriptor";

function walledRiverTown(): CityDocument {
  const grid = createGridDocument({
    size: "medium",
    grid: "evolution",
    seed: "probe-a"
  });
  const settings = defaultGenerationSettings();
  settings.config.coast = "none";
  settings.config.rivers = ["meander"];
  settings.config.relief = true;
  settings.config.features = {
    walls: true,
    citadel: true,
    plaza: true,
    temple: true,
    port: false,
    shanty: false
  };
  const city = generateCityOnDocument(grid, settings, "probe-a");
  if (!city) throw new Error("generation failed");
  return city;
}

function centre(points: Point[]): Point {
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

/** Independent, one-metre audit of the town's last contact with the river bank. */
function downstreamTownExit(points: Point[], width: number, town: Point[]): number {
  let walked = 0;
  let exit = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) continue;
    const count = Math.ceil(length);
    for (let j = 0; j <= count; j++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * j) / count, a[1] + ((b[1] - a[1]) * j) / count];
      if (pointInPolygon(p, town) || nearestOnPolyline(p, [...town, town[0]]).dist <= width / 2 + 25)
        exit = walked + (length * j) / count;
    }
    walked += length;
  }
  return exit;
}

function riverStation(p: Point, points: Point[]): number {
  let best = Infinity,
    station = 0,
    walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const hit = nearestOnPolyline(p, [a, b]);
    if (hit.dist < best) {
      best = hit.dist;
      station = walked + Math.hypot(hit.point[0] - a[0], hit.point[1] - a[1]);
    }
    walked += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return station;
}

function polygonGap(a: Point[], b: Point[]): number {
  if (polygonOverlaps(a, b)) return 0;
  return Math.min(
    ...a.map(p => nearestOnPolyline(p, [...b, b[0]]).dist),
    ...b.map(p => nearestOnPolyline(p, [...a, a[0]]).dist)
  );
}

function roadPolylines(city: CityDocument): Array<{ points: Point[]; width: number }> {
  return city.featureGroups
    .filter(g => g.kind === "road")
    .map(g => ({
      points: featureGroupVertices(city, g).map(id => city.mesh.vertices[id].point),
      width: g.style.widthMeters
    }));
}

describe("windmill facing", () => {
  it("faces into a wind that blows east", () => {
    expect(windmillFacingRadians(90)).toBeCloseTo(Math.PI);
  });

  it("faces into a wind that blows north", () => {
    expect(windmillFacingRadians(0)).toBeCloseTo((Math.PI * 3) / 2);
  });

  it("draws the sails on the windward side", () => {
    const layer = renderAerialLandmarks({
      domesticWater: [],
      monasteries: [],
      windmills: [
        {
          id: "windmill-0",
          kind: "post",
          name: "Windmill #1 (Post Mill)",
          center: [10, 20],
          baseRadius: 5,
          facing: windmillFacingRadians(90),
          sailAngle: 0,
          sailLength: 9
        }
      ],
      barbicans: [],
      tanneries: [],
      gallows: [],
      guildHalls: [],
      guildYards: [],
      storageYards: [],
      gateInns: []
    });
    const body = layer.querySelector(".ce-windmill g");
    expect(body?.getAttribute("transform")).toContain("rotate(-180.0)");
    expect(layer.querySelector(".ce-windmill-sails")?.getAttribute("transform")).toContain("translate(2.2 0)");
  });
});

describe("aerial landmarks (1008-wards-and-features priority list)", () => {
  let city: CityDocument;
  let fabric: DistrictFabric;
  let ring: Point[];
  beforeAll(() => {
    city = walledRiverTown();
    fabric = buildBlockFabric(city);
    ring = circuitRing(city, city.defenseCircuits!.find(c => c.scope === "town")!);
  }, 120000);

  it("places landmarks but omits a tannery when downstream watermills leave no room", () => {
    const plan = fabric.aerialLandmarks!;
    expect(plan.monasteries.length).toBeGreaterThanOrEqual(2);
    expect(plan.monasteries.some(m => m.kind === "friary")).toBe(true);
    expect(plan.monasteries.some(m => m.kind === "abbey")).toBe(true);
    expect(plan.windmills.length).toBeGreaterThan(0);
    expect(plan.barbicans.length).toBeGreaterThan(0);
    expect(plan.tanneries).toHaveLength(0);
    expect(plan.gallows).toHaveLength(1);
  });

  it("fits accessible domestic water into vacant ground without displacing housing", () => {
    const points = fabric.aerialLandmarks!.domesticWater;
    expect(points.length).toBeGreaterThan(0);
    expect(points.some(p => p.placement === "plaza")).toBe(true);
    const moat = new MoatReservation(city);
    const fixed = new FixedRoadReservation(city);
    const roads = [...roadPolylines(city), ...fabric.lanes.map(l => ({ points: l.points, width: l.widthMeters }))];
    for (const water of points) {
      expect(fabric.buildings.some(b => polygonOverlaps(b.polygon, water.footprint))).toBe(false);
      expect(fabric.farms.some(f => polygonOverlaps(f.polygon, water.footprint))).toBe(false);
      expect(moat.hitsPolygon(water.footprint)).toBe(false);
      expect(fixed.hitsPolygon(water.footprint)).toBe(false);
      expect(roads.some(r => nearestOnPolyline(water.access.at(-1)!, r.points).dist < 0.01)).toBe(true);
      for (const r of roads)
        expect(nearestOnPolyline(water.center, r.points).dist).toBeGreaterThan(water.radius + r.width / 2);
      expect(water.use).toBe(water.kind === "pond" ? "service" : "domestic");
    }
  });

  it("is deterministic for the same document and fabric", () => {
    expect(buildBlockFabric(city).aerialLandmarks).toEqual(fabric.aerialLandmarks);
  });

  it("clears houses, alleys and fields from every footprint", () => {
    const footprints = aerialLandmarkFootprints(fabric.aerialLandmarks!);
    for (const f of footprints) {
      expect(fabric.buildings.some(b => polygonOverlaps(b.polygon, f))).toBe(false);
      expect(fabric.farms.some(farm => polygonOverlaps(farm.polygon, f))).toBe(false);
    }
    // An alley may end on the precinct wall itself, but never inside it.
    for (const m of fabric.aerialLandmarks!.monasteries) {
      const inner = shrinkPolygon(m.precinct, [0.6]);
      expect(inner.length).toBeGreaterThan(2);
      expect(fabric.lanes.some(l => l.points.some(p => pointInPolygon(p, inner)))).toBe(false);
    }
  });

  it("keeps precincts and yards off streets and water", () => {
    const roads = roadPolylines(city);
    const plan = fabric.aerialLandmarks!;
    for (const polygon of [...plan.monasteries.map(m => m.precinct), ...plan.tanneries.map(t => t.yard)])
      for (const road of roads)
        for (const p of polygon) expect(nearestOnPolyline(p, road.points).dist).toBeGreaterThan(road.width / 2);
    const river = city.featureGroups.find(g => g.kind === "river")!;
    const riverPoints = river.kind === "river" ? river.vertices.map(id => city.mesh.vertices[id].point) : [];
    for (const m of plan.monasteries)
      for (const p of m.precinct)
        expect(nearestOnPolyline(p, riverPoints).dist).toBeGreaterThan(river.style.widthMeters / 2);
  });

  it("puts friaries near a gate inside the walls and abbeys outside", () => {
    const gates = city.gates.map(g => city.mesh.vertices[g.vertexId].point);
    for (const m of fabric.aerialLandmarks!.monasteries) {
      const c = centre(m.precinct);
      if (m.kind === "friary") {
        expect(pointInPolygon(c, ring)).toBe(true);
        expect(Math.min(...gates.map(g => Math.hypot(g[0] - c[0], g[1] - c[1])))).toBeLessThan(270);
      } else expect(pointInPolygon(c, ring)).toBe(false);
    }
  });

  it("turns every mill into the recorded wind without moving them", () => {
    const input = {
      buildings: fabric.buildings,
      lanes: fabric.lanes,
      farms: fabric.farms.map(f => f.polygon),
      reserved: []
    };
    const doc = { ...city };
    const seeded = buildAerialLandmarkPlan(doc, input, "wind-facing");
    expect(prevailingWindKey(doc)).toBe("");
    doc.prevailingWindDeg = 90;
    const turned = buildAerialLandmarkPlan(doc, input, "wind-facing");
    expect(prevailingWindKey(doc)).toBe("90");
    expect(seeded.windmills.length).toBeGreaterThan(0);
    expect(turned.windmills).toHaveLength(seeded.windmills.length);
    expect(turned).not.toBe(seeded);
    for (let i = 0; i < turned.windmills.length; i++) {
      expect(turned.windmills[i].facing).toBeCloseTo(Math.PI);
      expect(turned.windmills[i].center).toEqual(seeded.windmills[i].center);
      expect(turned.windmills[i].sailAngle).toBe(seeded.windmills[i].sailAngle);
      expect(turned.windmills[i].kind).toBe(seeded.windmills[i].kind);
    }
  });

  it("sets windmills and the gallows outside the walls", () => {
    const plan = fabric.aerialLandmarks!;
    for (const w of plan.windmills) {
      expect(pointInPolygon(w.center, ring)).toBe(false);
      // One prevailing wind turns every mill the same way.
      expect(w.facing).toBe(plan.windmills[0].facing);
    }
    const gallows = plan.gallows[0];
    expect(pointInPolygon(gallows.center, ring)).toBe(false);
    expect(nearestOnPolyline(gallows.center, [...ring, ring[0]]).dist).toBeGreaterThan(120);
  });

  it("builds barbicans on the outer side of an external-road gate", () => {
    for (const b of fabric.aerialLandmarks!.barbicans) {
      const gate = city.gates.find(g => g.id === b.gateId)!;
      const at = city.mesh.vertices[gate.vertexId].point;
      const c = centre(b.court);
      expect(pointInPolygon(c, ring)).toBe(false);
      expect(Math.hypot(c[0] - at[0], c[1] - at[1])).toBeLessThan(40);
      expect(b.frontTowers).toHaveLength(2);
    }
  });

  it("puts the tanners' yard downstream of town when there are no downstream water users", () => {
    const river = city.featureGroups.find(g => g.kind === "river");
    if (river?.kind !== "river") throw new Error("no river");
    const points = river.vertices.map(id => city.mesh.vertices[id].point);
    const exit = downstreamTownExit(points, river.style.widthMeters, ring);
    const plan = buildAerialLandmarkPlan(
      city,
      {
        buildings: fabric.buildings,
        lanes: fabric.lanes,
        farms: fabric.farms.map(f => f.polygon),
        reserved: []
      },
      "no-water-users"
    );
    const yard = plan.tanneries[0];
    expect(yard).toBeDefined();
    for (const p of yard.yard) expect(riverStation(p, points)).toBeGreaterThan(exit);
    expect(polygonOverlaps(yard.yard, ring)).toBe(false);
    expect(nearestOnPolyline(centre(yard.yard), points).dist).toBeLessThan(river.style.widthMeters / 2 + 25);
    expect(yard.pits.length).toBeGreaterThan(20);
  });

  it("places a downstream yard when the river is separated from the town boundary", () => {
    const seed = "tannery-audit-1";
    const grid = createGridDocument({ size: "medium", grid: "evolution", seed });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = ["meander"];
    const city = generateCityOnDocument(grid, settings, seed)!;
    const fabric = buildBlockFabric(city);
    const circuit = city.defenseCircuits?.find(c => c.scope === "town");
    const town = circuit
      ? circuitRing(city, circuit)
      : convexHull(
          Object.values(city.mesh.faces)
            .filter(f => f.properties.water === "land" && f.properties.settlement === "core")
            .flatMap(f => facePoints(city.mesh, f))
        );
    const [yard] = fabric.aerialLandmarks!.tanneries;
    expect(yard).toBeDefined();
    const river = flowingRivers(city).find(r => r.id === yard.riverId)!;
    // The former contact-only rule finds no exit and silently omits this yard.
    expect(downstreamTownExit(river.points, river.widthMeters, town)).toBe(-1);
    const townEnd = Math.max(...town.map(p => riverStation(p, river.points)));
    expect(polygonOverlaps(yard.yard, town)).toBe(false);
    for (const p of yard.yard) expect(riverStation(p, river.points)).toBeGreaterThan(townEnd);
  }, 60000);

  it("moves a tannery downstream and away from a mill or a pier at its former site", () => {
    const input = {
      buildings: fabric.buildings,
      lanes: fabric.lanes,
      farms: fabric.farms.map(f => f.polygon),
      reserved: []
    };
    const initial = buildAerialLandmarkPlan(city, input, "water-user-clearance");
    const old = initial.tanneries[0];
    expect(old).toBeDefined();
    const river = flowingRivers(city).find(r => r.id === old.riverId)!;
    for (const riverId of [old.riverId, undefined]) {
      const revised = buildAerialLandmarkPlan(
        city,
        {
          ...input,
          waterUsers: [{ riverId, polygon: old.yard }]
        },
        "water-user-clearance"
      );
      const yard = revised.tanneries[0];
      expect(yard).toBeDefined();
      expect(polygonGap(yard.yard, old.yard)).toBeGreaterThanOrEqual(TANNERY_WATER_USER_CLEARANCE_METERS);
      const end = Math.max(...old.yard.map(p => riverStation(p, river.points)));
      for (const p of yard.yard)
        expect(riverStation(p, river.points) - end).toBeGreaterThanOrEqual(TANNERY_WATER_USER_CLEARANCE_METERS);
    }
  });

  it("follows the technology of the historical period", () => {
    const input = {
      buildings: fabric.buildings,
      lanes: fabric.lanes,
      farms: fabric.farms.map(f => f.polygon),
      reserved: []
    };
    const early = buildAerialLandmarkPlan({ ...city, historicalPeriod: "earlyMedieval" }, input);
    expect(early.windmills).toHaveLength(0);
    expect(early.barbicans).toHaveLength(0);
    expect(early.monasteries.length).toBeGreaterThan(0);
    const antique = buildAerialLandmarkPlan({ ...city, historicalPeriod: "classicalAntiquity" }, input);
    expect(antique.monasteries).toHaveLength(0);
    const high = buildAerialLandmarkPlan({ ...city, historicalPeriod: "highMedieval" }, input);
    expect(high.windmills.every(w => w.kind === "post")).toBe(true);
  });

  it("renders pickable landmark groups", () => {
    const half = city.frame.extentMeters / 2;
    const svg = renderEditorSvg(
      { ...city, appearance: "town" },
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1
    );
    expect(svg.querySelectorAll(".ce-domestic-water[data-pick]")).toHaveLength(
      fabric.aerialLandmarks!.domesticWater.length
    );
    expect(svg.querySelectorAll(".ce-tannery[data-pick]")).toHaveLength(fabric.aerialLandmarks!.tanneries.length);
    for (const kind of ["monastery", "windmill", "barbican", "gallows"]) {
      const node = svg.querySelector(`.ce-${kind}[data-pick]`);
      expect(node, kind).not.toBeNull();
      expect(JSON.parse(decodeURIComponent(node!.getAttribute("data-pick")!)).kind).toBe(kind);
    }
  }, 60000);

  it("draws guild halls and yards for chapters with no craftsmen", () => {
    const withGuilds = {
      ...city,
      siteEconomy: {
        version: 1 as const,
        year: 1348,
        commerce: {
          rank: 0,
          marketCenter: false,
          merchantHouse: null,
          mint: false,
          caravanArrivalRank: 0
        },
        guilds: [
          {
            domain: "textiles" as const,
            status: "chapter" as const,
            practitioners: 0,
            prestige: 0.91,
            foundedYear: 1240
          },
          { domain: "masonry" as const, status: "chapter" as const, practitioners: 0, prestige: 0.2, foundedYear: 1244 }
        ],
        storage: [],
        facilities: [],
        tradePartners: []
      }
    };
    const built = buildBlockFabric(withGuilds, new FabricCache());
    const halls = built.aerialLandmarks?.guildHalls ?? [];
    const yards = built.aerialLandmarks?.guildYards ?? [];
    expect(halls.some(hall => hall.domain === "textiles" && hall.practitioners === 0)).toBe(true);
    expect(halls.some(hall => hall.domain === "masonry" && hall.practitioners === 0)).toBe(true);
    expect(yards.some(yard => yard.kind === "bleachingField" && yard.practitioners === 0)).toBe(true);
    expect(yards.some(yard => yard.kind === "stoneYard" || yard.kind === "limeKiln")).toBe(true);
    const half = withGuilds.frame.extentMeters / 2;
    const svg = renderEditorSvg(
      { ...withGuilds, appearance: "town" },
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1
    );
    expect(svg.querySelectorAll(".ce-guild-hall[data-pick]")).toHaveLength(halls.length);
    expect(decodeURIComponent(svg.querySelector(".ce-guild-hall[data-pick]")!.getAttribute("data-pick")!)).toContain(
      "職人なし"
    );
  }, 60000);

  it("draws a granary inside the town and a livestock market outside it", () => {
    const withStorage = {
      ...city,
      siteEconomy: {
        version: 1 as const,
        year: 1350,
        commerce: {
          rank: 0.4,
          marketCenter: true,
          merchantHouse: null,
          mint: false,
          caravanArrivalRank: 0.4
        },
        guilds: [],
        storage: [
          {
            form: "granary" as const,
            areaM2: 500,
            mainGoods: ["Maize"],
            inflowAzimuthDeg: null,
            waterborne: false
          },
          {
            form: "livestockPen" as const,
            areaM2: 280,
            mainGoods: ["Cattle"],
            inflowAzimuthDeg: 180,
            waterborne: false
          },
          {
            form: "cellar" as const,
            areaM2: 400,
            mainGoods: ["Wine"],
            inflowAzimuthDeg: null,
            waterborne: false
          }
        ],
        facilities: [],
        tradePartners: []
      }
    };
    const built = buildBlockFabric(withStorage, new FabricCache());
    const yards = built.aerialLandmarks?.storageYards ?? [];
    const granary = yards.find(yard => yard.form === "granary");
    const livestock = yards.find(yard => yard.form === "livestockPen");
    expect(granary?.outside).toBe(false);
    expect(granary?.mainGoods).toEqual(["Maize"]);
    expect(livestock?.outside).toBe(true);
    expect(yards.some(yard => yard.form === "cellar")).toBe(false);
    const circuit = withStorage.defenseCircuits?.find(item => item.scope === "town");
    const ring = circuit ? circuitRing(withStorage, circuit) : [];
    expect(ring.length).toBeGreaterThanOrEqual(3);
    if (granary) expect(pointInPolygon(centre(granary.polygon), ring)).toBe(true);
    if (livestock) expect(pointInPolygon(centre(livestock.polygon), ring)).toBe(false);
    const half = withStorage.frame.extentMeters / 2;
    const svg = renderEditorSvg(
      { ...withStorage, appearance: "town" },
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1
    );
    expect(svg.querySelectorAll(".ce-storage-yard[data-pick]")).toHaveLength(yards.length);
    expect(
      decodeURIComponent(svg.querySelector(".ce-storage-yard--granary[data-pick]")!.getAttribute("data-pick")!)
    ).toContain("穀倉");
  }, 60000);

  it("puts the wayside inn and caravanserai outside the busiest gate and cobbles that road", () => {
    const exits = externalGateRoads(city);
    expect(exits.length).toBeGreaterThan(1);
    const busy = exits[0];
    const quiet = exits[1];
    const withInns: CityDocument = {
      ...city,
      featureGroups: city.featureGroups.map(group => {
        if (group.kind !== "road") return group;
        if (group.id === busy.group.id) return { ...group, sourceRoad: { index: 0, routeId: 10 } };
        if (group.id === quiet.group.id) return { ...group, sourceRoad: { index: 1, routeId: 11 } };
        return group;
      }),
      fabric: city.fabric && {
        ...city.fabric,
        generation: city.fabric.generation && {
          ...city.fabric.generation,
          settings: {
            ...city.fabric.generation.settings,
            descriptor: {
              roads: [
                {
                  routeId: 10,
                  group: "roads",
                  entryAzimuthDeg: 0,
                  reachesEdge: true,
                  path: [
                    [0, 0],
                    [1, 0]
                  ],
                  nextBurg: null,
                  traffic: 18,
                  trafficRank: 0.91
                },
                {
                  routeId: 11,
                  group: "trails",
                  entryAzimuthDeg: 90,
                  reachesEdge: true,
                  path: [
                    [0, 0],
                    [0, 1]
                  ],
                  nextBurg: null,
                  traffic: 2,
                  trafficRank: 0.1
                }
              ]
            } as BurgSiteDescriptor
          }
        }
      },
      siteEconomy: {
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
      }
    };
    const built = buildBlockFabric(withInns, new FabricCache());
    const inns = built.aerialLandmarks?.gateInns ?? [];
    const caravan = inns.find(inn => inn.kind === "caravanserai");
    const wayside = inns.find(inn => inn.kind === "inn");
    expect(caravan).toBeDefined();
    expect(wayside).toBeDefined();
    expect(Math.abs(polygonArea(caravan!.court))).toBeCloseTo(courtAreaM2(36), 0);
    expect(Math.abs(polygonArea(wayside!.court))).toBeCloseTo(courtAreaM2(4), 0);
    for (const inn of inns) expect(pointInPolygon(centre(inn.footprint), ring)).toBe(false);
    const pointsOf = (id: string) => {
      const group = withInns.featureGroups.find(group => group.id === id);
      return group && group.kind === "road"
        ? featureGroupVertices(withInns, group).map(vertex => withInns.mesh.vertices[vertex].point)
        : [];
    };
    const busyPoints = pointsOf(busy.group.id);
    const quietPoints = pointsOf(quiet.group.id);
    expect(nearestOnPolyline(centre(caravan!.footprint), busyPoints).dist).toBeLessThan(
      nearestOnPolyline(centre(caravan!.footprint), quietPoints).dist
    );
    expect(innClearsRoad(caravan!, busyPoints, 1)).toBe(true);
    const half = withInns.frame.extentMeters / 2;
    const svg = renderEditorSvg(
      { ...withInns, appearance: "town" },
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1
    );
    expect(svg.querySelectorAll(".ce-gate-inn[data-pick]")).toHaveLength(inns.length);
    expect(decodeURIComponent(svg.querySelector(".ce-gate-inn--inn")!.getAttribute("data-pick")!)).toContain("街道宿");
    expect(decodeURIComponent(svg.querySelector(".ce-gate-inn--caravanserai")!.getAttribute("data-pick")!)).toContain(
      "隊商宿"
    );
    const cobble = svg.querySelector(".ce-road--cobble");
    const busyWidth = withInns.featureGroups.find(group => group.kind === "road" && group.id === busy.group.id);
    expect(cobble?.getAttribute("stroke-width")).toBe(
      String((busyWidth?.kind === "road" ? busyWidth.style.widthMeters : 0) * COBBLE_WIDTH_SCALE)
    );
    const plain = renderEditorSvg(
      { ...city, appearance: "town" },
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1
    );
    expect(plain.querySelector(".ce-road--cobble")).toBeNull();
    expect(plain.querySelector(".ce-gate-inn")).toBeNull();
  }, 60000);
});

describe("FMG-linked rivers (riverFlows)", () => {
  it("places watermills and a town-side tanners' yard on the surveyed bank", async () => {
    const { parseIncomingPayload } = await import("../../io/incomingCity");
    const { cityEditorDocument, cityEditorSettings } = await import("../housingReport");
    const { hitsSurveyedWater } = await import("./watermillFabric");
    const inputs = (await import("../fixtures/vilealand-fmg-handoff-20261004.json")).default as Record<
      string,
      { share_json: string }
    >;
    const share = parseIncomingPayload(inputs["224"].share_json)!;
    const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {})!;
    expect(city.featureGroups.some(g => g.kind === "river")).toBe(false);
    expect(city.riverFlows?.length).toBeGreaterThan(0);
    const fabric = buildBlockFabric(city);
    const mills = fabric.watermills!.mills;
    expect(mills.length).toBeGreaterThan(0);
    for (const mill of mills) expect(hitsSurveyedWater(city, mill.millhousePolygon)).toBe(false);
    const waterPoints = fabric.aerialLandmarks!.domesticWater;
    expect(waterPoints.length).toBeGreaterThan(0);
    for (const water of waterPoints) expect(hitsSurveyedWater(city, water.footprint)).toBe(false);
    const [yard] = fabric.aerialLandmarks!.tanneries;
    expect(yard).toBeDefined();
    expect(hitsSurveyedWater(city, yard.yard)).toBe(false);
    const users = [
      ...mills.map(m => ({ riverId: m.riverId, polygon: m.millhousePolygon })),
      ...(fabric.harbor?.spaces.map(s => ({ riverId: undefined, polygon: s.polygon })) ?? []),
      ...(fabric.harbor?.piers.map(p => ({ riverId: undefined, polygon: p.polygon })) ?? [])
    ];
    for (const user of users) {
      expect(polygonGap(yard.yard, user.polygon)).toBeGreaterThanOrEqual(TANNERY_WATER_USER_CLEARANCE_METERS);
      if (user.riverId === yard.riverId) {
        const river = flowingRivers(city).find(r => r.id === yard.riverId)!;
        const end = Math.max(...user.polygon.map(p => riverStation(p, river.points)));
        for (const p of yard.yard)
          expect(riverStation(p, river.points) - end).toBeGreaterThanOrEqual(TANNERY_WATER_USER_CLEARANCE_METERS);
      }
    }
    const circuit = city.defenseCircuits?.find(c => c.scope === "town");
    const ring = circuit
      ? circuitRing(city, circuit)
      : convexHull(
          Object.values(city.mesh.faces)
            .filter(f => f.properties.water === "land" && f.properties.settlement === "core")
            .flatMap(f => facePoints(city.mesh, f))
        );
    const river = flowingRivers(city).find(r => r.id === yard.riverId)!;
    // Regression: this sparse FMG centreline used to put the yard inside the built-up core,
    // roughly 148 metres upstream of its downstream bank exit.
    const exit = downstreamTownExit(river.points, river.widthMeters, ring);
    expect(exit).toBeGreaterThan(0);
    expect(polygonOverlaps(yard.yard, ring)).toBe(false);
    for (const p of yard.yard) expect(riverStation(p, river.points)).toBeGreaterThan(exit);

    // No downstream room: omit the yard rather than falling back upstream.
    const clipped = {
      ...city,
      riverFlows: city.riverFlows!.map(flow => ({ ...flow, points: flow.points.slice(0, 2) }))
    };
    const plan = buildAerialLandmarkPlan(clipped, {
      buildings: fabric.buildings,
      lanes: fabric.lanes,
      farms: fabric.farms.map(f => f.polygon),
      reserved: []
    });
    expect(plan.tanneries).toHaveLength(0);
    // Same bank as the town: the straight line from the yard to the town centre stays dry.
    const c = centre(yard.yard);
    const steps = 20;
    const line = Array.from({ length: steps + 1 }, (_, i): Point => [c[0] * (1 - i / steps), c[1] * (1 - i / steps)]);
    expect(line.some(p => hitsSurveyedWater(city, [p, [p[0] + 0.5, p[1]], [p[0] + 0.5, p[1] + 0.5]]))).toBe(false);
  }, 120000);
});
