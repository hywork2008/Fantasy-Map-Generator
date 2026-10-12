import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bridgeSkewDegrees } from "../../utils/bridgeSkewPolicy";
import { parseIncomingPayload } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { bridgeDecks, documentBridgeSkewLimit } from "./bridgeDeck";
import input from "./fixtures/gothengsfeld-20261012.json";
import { castleWallIds, wallRunsOutsideGates } from "./fortifications";
import { frameRoadConnectedToTown } from "./frameRoadConnection";
import { nearestOnPolyline, segmentSegmentHit } from "./gen/geom";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { validate } from "./mesh";
import { gateCrossingFrame, validGeneratedCrossings } from "./passages";
import { regionalRoadThroughGate } from "./regionalRoadGates";
import { lineHitsWater, waterPolygons } from "./waterGeometry";

describe("Gothengsfeld surveyed river curtain", () => {
  it("keeps a continuous far-bank arc and ends the curtain at the surveyed bank", () => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const document = cityEditorDocument(value);
    const settings = cityEditorSettings(value);
    const city = generateCityOnDocument(document, settings, value.seed)!;
    expect(city).not.toBeNull();
    expect(validate(city)).toEqual([]);
    expect(validGeneratedCrossings(city)).toBe(true);
    const castles = castleWallIds(city);
    const water = waterPolygons(city);
    const degree = new Map<string, number>();
    for (const group of city.featureGroups) {
      if (group.kind !== "wall") continue;
      for (const ref of group.segments) {
        const edge = city.mesh.edges[ref.edgeId];
        for (const id of [edge.a, edge.b]) degree.set(id, (degree.get(id) ?? 0) + 1);
        if (!castles.has(group.id))
          expect(lineHitsWater([city.mesh.vertices[edge.a].point, city.mesh.vertices[edge.b].point], water)).toBe(
            false
          );
      }
    }
    const ends = [...degree].filter(([, count]) => count === 1).map(([id]) => city.mesh.vertices[id].point);
    expect(ends).toHaveLength(4);
    for (const end of ends)
      expect(Math.min(...water.map(poly => nearestOnPolyline(end, [...poly, poly[0]]).dist))).toBeLessThan(1);
    for (const road of city.frameRoads ?? []) expect(frameRoadConnectedToTown(city, road)).toBe(true);
    const regionalGates = city.gates.filter(g => g.id.startsWith("gc:regional-gate-"));
    expect(regionalGates).toHaveLength(1);
    for (const gate of regionalGates) {
      expect(regionalRoadThroughGate(city, gate.vertexId)).toHaveLength(2);
      expect(gateCrossingFrame(city, gate.vertexId)?.roads).toHaveLength(2);
    }
    // Check the actual imported road geometry against the drawn wall opening,
    // independently of the mesh's road edge memberships.
    for (const leg of city.frameRoads ?? [])
      for (const piece of leg.pieces.filter(p => p.kind === "road"))
        for (let i = 1; i < piece.points.length; i++)
          for (const group of city.featureGroups.filter(g => g.kind === "wall"))
            for (const ref of group.kind === "wall" ? group.segments : []) {
              const edge = city.mesh.edges[ref.edgeId];
              const line = [city.mesh.vertices[edge.a].point, city.mesh.vertices[edge.b].point];
              for (const run of wallRunsOutsideGates(city, line))
                expect(segmentSegmentHit(piece.points[i - 1], piece.points[i], run[0], run[1])).toBeNull();
            }
    expect(city.importedFixedCrossings?.crossings).toEqual(value.descriptor!.fixedCrossings!.crossings);
    for (const crossing of city.importedFixedCrossings!.crossings)
      expect(bridgeSkewDegrees(crossing.normal, crossing.tangent)).toBeLessThanOrEqual(documentBridgeSkewLimit(city));
    for (const deck of bridgeDecks(city)) expect(deck.skewDegrees).toBeLessThanOrEqual(documentBridgeSkewLimit(city));
    if (process.env.CE_GOTHENGSFELD_EXPORT) {
      writeFileSync(process.env.CE_GOTHENGSFELD_EXPORT, renderStandaloneCitySvg(city).outerHTML);
      writeFileSync(`${process.env.CE_GOTHENGSFELD_EXPORT}.json`, JSON.stringify(city));
    }
  });
});
