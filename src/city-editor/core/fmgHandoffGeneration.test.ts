import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { featureGroupVertices } from "./features";
import ablos from "./fixtures/ablos-road-gap-20261012.json";
import inputs from "./fixtures/vilealand-fmg-handoff-20261004.json";
import { validateFortifications } from "./fortifications";
import { frameRoadAttachedToTown } from "./frameRoadConnection";
import { polygonArea } from "./gen/geom";
import { importedRoadsForSite } from "./gen/site/importedRoads";
import { countExternalApproachRoads, generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { validate } from "./mesh";
import { explainGeneratedCrossingFailures } from "./passages";
import { lineHitsDocumentWater } from "./waterGeometry";

it("joins Ablos route 21 to v391 in the rendered map without crossing water", () => {
  const share = parseIncomingPayload(JSON.stringify(ablos))!;
  const samples: number[] = [];
  const checked: number[] = [];
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, sample => {
    samples.push(...(sample.roadConnectionIssues ?? []).map(issue => issue.routeId));
    if (sample.phase === "road-connection-validation") checked.push(sample.counts?.checked ?? -1);
  });
  expect(city).toBeTruthy();
  expect(samples).toEqual([]);
  expect(checked).toEqual([3]);
  expect(city!.featureGroups.filter(group => group.kind === "road" && group.sourceRoad)).toHaveLength(3);
  const leg = city!.frameRoads!.find(item => item.routeId === 21)!;
  const street = city!.featureGroups.find(
    group => group.kind === "road" && group.sourceRoad?.index === leg.sourceIndex
  )!;
  const streetEnd = city!.mesh.vertices[featureGroupVertices(city!, street)[0]].point;
  expect(streetEnd).toEqual(city!.mesh.vertices.v391.point);
  expect(leg.pieces[0].points[0]).toEqual(streetEnd);
  expect(frameRoadAttachedToTown(city!, leg)).toBe(true);
  expect(city!.sceneRegions?.connectors.map(connector => connector.status)).toEqual(["connected", "connected"]);
  expect(lineHitsDocumentWater(city!, leg.pieces[0].points.slice(0, 2), 3.5, true)).toBe(false);
  const svg = renderStandaloneCitySvg(city!);
  const drawn = svg.querySelector<SVGPathElement>('.ce-frame-road[data-route-id="21"]');
  expect(drawn?.getAttribute("d")).toContain(`M${streetEnd[0]} ${-streetEnd[1]}`);
});

// Exact handoffs exported from Vilealand 2026-10-04-15-32.fmg, without
// modifying roads, water, seed, population or the castle requirement.
describe("Vilealand FMG handoff regression", () => {
  it("finishes every frame-road attachment in a previously stranded city", () => {
    const share = parseIncomingPayload(inputs["320"].share_json)!;
    const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {});
    expect(city).toBeTruthy();
    expect(city!.frameRoads?.every(leg => frameRoadAttachedToTown(city!, leg))).toBe(true);
  });

  it("keeps a valid city when a far-shore FMG entrance has no safe connection", () => {
    const share = parseIncomingPayload(inputs["224"].share_json)!;
    const issues: number[] = [];
    const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, sample => {
      issues.push(...(sample.roadConnectionIssues ?? []).map(issue => issue.sourceIndex));
    });
    expect(city).toBeTruthy();
    expect(issues.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(inputs))(
    "generates burg %s with every original entrance",
    (_id, row) => {
      const share = parseIncomingPayload(row.share_json)!;
      const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {});
      expect(city).toBeTruthy();
      if (!city) return;
      const expected = importedRoadsForSite(share.descriptor!)
        .map(road => road.sourceIndex)
        .sort();
      const actual = city.featureGroups
        .filter(g => g.kind === "road" && g.sourceRoad)
        .map(g => g.sourceRoad!.index)
        .sort();
      expect(actual).toEqual(expected);
      expect(countExternalApproachRoads(city)).toBe(expected.length);
      expect(validate(city)).toEqual([]);
      expect(validateFortifications(city)).toEqual([]);
      expect(explainGeneratedCrossingFailures(city)).toEqual([]);
      for (const castle of city.castles ?? [])
        for (const part of castle.parts) expect(Math.abs(polygonArea(part.footprint))).toBeGreaterThanOrEqual(20);
      if (row.burg_id === "304") {
        expect(city.castles).toHaveLength(1);
        expect(city.featureGroups.some(g => g.kind === "road" && g.id === `${city.castles![0].id}:approach`)).toBe(
          true
        );
      }
    },
    60000
  );
});
