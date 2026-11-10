import { expect, it } from "vitest";
import input from "../data/fixtures/facility-frontage-20261106.json";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import type { Point } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { generateCityOnDocument } from "./generation/generateCity";
import { nearestOnPolyline, segmentSegmentHit } from "./geom";
import { landmarkStreets } from "./landmarkIntegration";
import { buildLandmarkLaneNetwork } from "./landmarkLaneNetwork";
import { transformLandmarkPoint } from "./landmarks";

it("keeps the supplied city's facilities aligned to their serving streets with short entrance spurs", () => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  expect(share).not.toBeNull();
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  expect(city).not.toBeNull();
  const fabric = buildBlockFabric(city);
  const lanes = buildLandmarkLaneNetwork(city, fabric.lanes);
  const rows = (city.landmarks ?? []).map(instance => {
    const asset = city.landmarkAssets!.find(a => a.id === instance.assetId && a.revision === instance.assetRevision)!;
    const access = instance.accesses[0];
    const entrance = asset.entrances.find(e => e.id === access.entranceId)!;
    const normal: Point = [
      entrance.outward[0] * Math.cos(instance.rotation) - entrance.outward[1] * Math.sin(instance.rotation),
      entrance.outward[0] * Math.sin(instance.rotation) + entrance.outward[1] * Math.cos(instance.rotation)
    ];
    const segments: Point[][] =
      access.target.kind === "lane"
        ? lanes.filter(l => l.id === access.target.id).flatMap(l => l.points.slice(1).map((p, i) => [l.points[i], p]))
        : city.featureGroups.flatMap(g =>
            g.kind === "road" && g.id === access.target.id
              ? g.segments.map(s => {
                  const e = city.mesh.edges[s.edgeId];
                  return [city.mesh.vertices[e.a].point, city.mesh.vertices[e.b].point];
                })
              : []
          );
    const angles = segments
      .filter(s => nearestOnPolyline(access.target.point, s).dist < 1e-4)
      .map(
        ([a, b]) =>
          (Math.asin(
            Math.min(
              1,
              Math.abs(normal[0] * (b[0] - a[0]) + normal[1] * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1])
            )
          ) *
            180) /
          Math.PI
      );
    const length = access.points
      .slice(1)
      .reduce((n, p, i) => n + Math.hypot(p[0] - access.points[i][0], p[1] - access.points[i][1]), 0);
    return {
      id: instance.id,
      angle: Math.min(...angles),
      length,
      position: instance.position,
      rotation: instance.rotation,
      access,
      entrance: transformLandmarkPoint(entrance.point, instance)
    };
  });
  let crossings = 0;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].access.points,
        b = rows[j].access.points;
      const hit = segmentSegmentHit(a[0], a.at(-1)!, b[0], b.at(-1)!);
      const reverse = segmentSegmentHit(b[0], b.at(-1)!, a[0], a.at(-1)!);
      if (hit && reverse && hit.t > 1e-5 && hit.t < 1 - 1e-5 && reverse.t > 1e-5 && reverse.t < 1 - 1e-5) crossings++;
    }
  const target = rows.find(r => r.id === "population-facility:workshop:shoemaking:2");
  expect(target).toBeDefined();
  // Later ropeworks, butchery and town-trade models place 235 landmarks on this fixture.
  expect(rows.length).toBeGreaterThanOrEqual(235);
  expect(rows.every(r => r.angle < 0.1)).toBe(true);
  expect(rows.every(r => r.length < 8)).toBe(true);
  expect(crossings).toBe(0);
  const streets = landmarkStreets(city, fabric.lanes).flatMap(s => s.points.slice(1).map((b, i) => [s.points[i], b]));
  for (const row of rows)
    for (const [c, d] of streets) {
      const [a, b] = row.access.points;
      const hit = segmentSegmentHit(a, b, c, d),
        reverse = segmentSegmentHit(c, d, a, b);
      expect(
        hit && reverse && hit.t > 1e-5 && hit.t < 1 - 1e-5 && reverse.t > 1e-5 && reverse.t < 1 - 1e-5
      ).toBeFalsy();
    }
  expect(city.populationReport!.unplacedPopulation).toBe(0);
  expect(parseDocument(serializeDocument(city))?.landmarks).toEqual(city.landmarks);
}, 120000);
