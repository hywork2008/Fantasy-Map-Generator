import { describe, expect, it } from "vitest";
import { documentBridgeSkewLimit } from "../bridgeDeck";
import { createSizedDocument } from "../document";
import { featureGroupVertices } from "../features";
import { countExternalApproachRoads, defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { facePoints, validate } from "../mesh";
import { kindEdgeIds, vertexHasCrossing } from "../passages";
import { bridgeSkewDegrees } from "./bridgeSkewTestSupport";
import { buildCityBuildings } from "./buildingLots";
import { pointInPolygon, polygonArea, segmentSegmentHit } from "./geom";
import { minExternalRoadsForExtent } from "./settlementExtent";

// Split from completeCity.test.ts: the coast × seed matrix runs in parallel with it.
describe("complete editable city — coast matrix", () => {
  const base = createSizedDocument("small", "preview");
  for (const coast of ["none", "straight", "bay", "cape"] as const) {
    for (const seed of ["reference-town", "complete-b", "complete-c"]) {
      it(`${coast}, ${seed}: buildings stay on land, routes remain on distinct mesh edges`, () => {
        const settings = defaultGenerationSettings();
        settings.config.coast = coast;
        settings.config.rivers = coast === "none" ? ["through"] : ["toCoast"];
        settings.config.features.port = coast !== "none";
        const city = generateCityOnDocument(base, settings, seed)!;
        expect(city).not.toBeNull();
        expect(validate(city)).toEqual([]);
        expect(city.frame).toEqual(base.frame);
        expect(countExternalApproachRoads(city)).toBeGreaterThanOrEqual(
          minExternalRoadsForExtent(city.frame.extentMeters)
        );
        const rivers = kindEdgeIds(city, "river");
        const walls = kindEdgeIds(city, "wall");
        const wallVertices = new Set([...walls].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));
        for (const gate of city.gates)
          expect(vertexHasCrossing(city, gate.vertexId, "wall", "road"), gate.vertexId).toBe(true);
        const gateVertices = new Set(city.gates.map(gate => gate.vertexId));
        for (const road of city.featureGroups.filter(
          group => group.kind === "road" && group.id.startsWith("gc:road-")
        )) {
          const vertices = featureGroupVertices(city, road);
          for (const endpoint of [vertices[0], vertices.at(-1)!]) {
            if (wallVertices.has(endpoint)) expect(gateVertices.has(endpoint), `${road.id} at ${endpoint}`).toBe(true);
          }
        }
        for (const id of walls) expect(rivers.has(id), `shared wall/river ${id}`).toBe(false);
        const riverVertices = new Set([...rivers].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));
        for (const id of wallVertices)
          if (riverVertices.has(id)) expect(vertexHasCrossing(city, id, "wall", "river"), id).toBe(true);
        if (coast === "none") expect(city.featureGroups.some(g => g.id.startsWith("gc:bridge-"))).toBe(true);
        for (const bridge of city.featureGroups.filter(g => g.id.startsWith("gc:bridge-"))) {
          const ids = featureGroupVertices(city, bridge);
          expect(ids).toHaveLength(3);
          expect(vertexHasCrossing(city, ids[1], "river", "road"), bridge.id).toBe(true);
          const skew = bridgeSkewDegrees(city, ids[0], ids[1], ids[2]);
          // The era's allowance comes from bridgeSkewPolicy (AGENTS.md); never exceed it.
          if (skew !== null) expect(skew, bridge.id).toBeLessThanOrEqual(documentBridgeSkewLimit(city));
        }
        for (const id of kindEdgeIds(city, "road")) {
          expect(rivers.has(id) || walls.has(id)).toBe(false);
          const edge = city.mesh.edges[id];
          for (const fid of [edge.leftFace, edge.rightFace])
            if (fid) expect(city.mesh.faces[fid].properties.water).toBe("land");
        }
        const buildings = buildCityBuildings(city);
        expect(buildings.length).toBeGreaterThan(100);
        for (const building of buildings) {
          const face = city.mesh.faces[building.faceId];
          expect(face.properties.water).toBe("land");
          expect(face.properties.buildable).toBe(true);
          expect(Math.abs(polygonArea(building.polygon))).toBeGreaterThan(1);
          const polygon = facePoints(city.mesh, face);
          for (const point of building.polygon) expect(pointInPolygon(point, polygon)).toBe(true);
        }
        for (const face of Object.values(city.mesh.faces)) {
          const p = facePoints(city.mesh, face);
          for (let i = 0; i < p.length; i++)
            for (let j = i + 2; j < p.length; j++) {
              if (i === 0 && j === p.length - 1) continue;
              expect(segmentSegmentHit(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]), face.id).toBeNull();
            }
        }
      });
    }
  }
});
