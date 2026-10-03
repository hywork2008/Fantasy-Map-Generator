import { describe, expect, it } from "vitest";
import { shareFromDescriptor } from "../io/incomingCity";
import { serializeCitySvg } from "../render/svg";
import { createGridDocument } from "./document";
import { featureGroupVertices } from "./features";
import sites from "./fixtures/ky-cuong-river-ports-20261003.json";
import { polygonOverlaps } from "./fortifications";
import { externalRoadLabels } from "./gen/approachBeyond";
import { buildBlockFabric } from "./gen/blockInfill";
import { nearestOnPolyline, pointInPolygon } from "./gen/geom";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { siteToGeography } from "./gen/site/siteInput";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { validate } from "./mesh";
import { lineHitsWater, polygonHitsWater, waterPolygons } from "./waterGeometry";

describe("Ky Cuong river ports 3, 8 and 33", () => {
  it.each(sites as unknown as BurgSiteDescriptor[])(
    "generates $burg.id ($burg.name), retaining all imported roads and the river harbour",
    descriptor => {
      const share = shareFromDescriptor(descriptor);
      const site = share.descriptor!;
      const document = createGridDocument({
        size: share.size,
        grid: share.grid,
        seed: share.gridSeed ?? share.seed,
        patchParams: share.patchParams,
        measureBlockSize: share.measureBlockSize === true,
        extentMeters: site.frame.extentMeters,
        cityRadiusMeters: site.frame.cityRadiusMeters
      });
      const failures: string[] = [];
      const city = generateCityOnDocument(
        document,
        { ...defaultGenerationSettings(), buildingPattern: "legacy", ...share.settings, descriptor: site },
        share.seed,
        sample => {
          if (sample.failure) failures.push(sample.failure.reason);
        }
      );
      expect(city, failures.join(", ")).not.toBeNull();
      if (!city) return;
      expect(validate(city)).toEqual([]);
      expect(city.waterAreas?.some(a => a.kind === "river")).toBe(true);
      expect(city.waterAreas?.some(a => pointInPolygon([0, 0], a.polygon))).toBe(false);
      expect(city.elements.some(e => e.kind === "harbor")).toBe(true);
      const expected = site.roads.flatMap((r, index) =>
        r.group !== "searoutes" && r.path.length >= 2 ? [{ index, routeId: r.routeId }] : []
      );
      const actual = city.featureGroups.flatMap(g =>
        g.kind === "road" && g.sourceRoad ? [{ index: g.sourceRoad.index, routeId: g.sourceRoad.routeId }] : []
      );
      expect(actual.sort((a, b) => a.index - b.index)).toEqual(expected);
      const entrances = siteToGeography(site, true).importedRoads!;
      for (const group of city.featureGroups) {
        if (group.kind !== "road" || !group.sourceRoad) continue;
        const entrance = entrances.find(r => r.sourceIndex === group.sourceRoad!.index)!;
        const points = featureGroupVertices(city, group).map(id => city.mesh.vertices[id].point);
        expect(lineHitsWater(points, waterPolygons(city))).toBe(false);
        if (entrance.riverLanding) expect(group.sourceRoad.terminal).toBe("riverLanding");
      }
      const geo = siteToGeography(site, true);
      const shoreline = geo.channels![0].shoreline;
      const first = shoreline[0],
        last = shoreline.at(-1)!;
      const baselineLength = Math.hypot(last[0] - first[0], last[1] - first[1]);
      expect(
        Math.max(
          ...shoreline.map(
            p =>
              Math.abs((last[0] - first[0]) * (p[1] - first[1]) - (last[1] - first[1]) * (p[0] - first[0])) /
              baselineLength
          )
        )
      ).toBeGreaterThan(5);
      for (const cemetery of city.cemeteries ?? [])
        expect(polygonHitsWater(cemetery.boundary, waterPolygons(city))).toBe(false);
      const fabric = buildBlockFabric(city);
      const quays = fabric.openSpaces?.filter(s => s.kind === "quay") ?? [];
      expect(quays.length).toBeGreaterThan(0);
      for (const quay of quays) {
        expect(polygonHitsWater(quay.polygon, waterPolygons(city))).toBe(false);
        expect(fabric.buildings.some(b => polygonOverlaps(b.polygon, quay.polygon))).toBe(false);
      }
      const connected = new Set(city.riverConnections?.map(c => c.sourceIndex));
      for (const connection of city.riverConnections ?? []) {
        expect(lineHitsWater(connection.farRoad, waterPolygons(city))).toBe(false);
        expect(Math.max(...connection.farRoad.at(-1)!.map(Math.abs))).toBeCloseTo(city.frame.extentMeters / 2, 0);
      }
      if (site.burg.id === 8) expect(city.riverConnections?.length).toBeGreaterThan(0);
      const landingIds = city.featureGroups
        .filter(
          g => g.kind === "road" && g.sourceRoad?.terminal === "riverLanding" && !connected.has(g.sourceRoad.index)
        )
        .map(g => g.id);
      expect(
        externalRoadLabels(city)
          .flatMap(exit => exit.roads)
          .some(r => landingIds.includes(r.group.id))
      ).toBe(false);
      const svg = new DOMParser().parseFromString(serializeCitySvg(city), "text/html");
      for (const id of landingIds) expect(svg.querySelector(`.ce-approach-beyond[data-groups~="${id}"]`)).toBeNull();
      expect(svg.querySelectorAll(".ce-river-connection-road").length).toBeGreaterThanOrEqual(
        (city.riverConnections?.length ?? 0) * 2
      );
      if (site.burg.id === 8) {
        expect(city.riverConnections![0].crossing).toMatchObject({ depthMeters: 1.94, kind: "fixedBridge" });
        expect(svg.querySelector(".ce-bridge-deck")).not.toBeNull();
        const south = [...svg.querySelectorAll(".ce-approach-beyond")].find(
          e => Number(e.getAttribute("y")) > city.frame.extentMeters * 0.4
        );
        expect(south).toBeDefined();
      }
      const piers = [...svg.querySelectorAll(".ce-pier")];
      expect(piers.length).toBeGreaterThan(0);
      for (const pier of piers) {
        const coords = pier
          .getAttribute("d")!
          .match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)!
          .map(Number);
        const bank: [number, number] = [(coords[0] + coords[6]) / 2, -(coords[1] + coords[7]) / 2];
        const tip: [number, number] = [(coords[2] + coords[4]) / 2, -(coords[3] + coords[5]) / 2];
        const areas = city.waterAreas!.filter(a => a.kind === "river");
        expect(Math.min(...areas.map(a => nearestOnPolyline(bank, [...a.polygon, a.polygon[0]]).dist))).toBeLessThan(
          0.1
        );
        expect(areas.some(a => pointInPolygon(tip, a.polygon))).toBe(true);
      }
    }
  );
});
