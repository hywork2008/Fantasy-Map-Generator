import { expect, it } from "vitest";
import input from "../data/fixtures/road-overlap-1sxzofc-20261019.json";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import type { CityDocument } from "../types/document";
import { generateCityOnDocument } from "./generation/generateCity";
import { faceVertices, validate } from "./mesh";
import { roadPathVertices } from "./roadNetwork";

function duplicateStreetEdges(city: CityDocument): string[] {
  const owners = new Map<string, string[]>();
  const streets = new Set(
    city.featureGroups
      .filter(
        group =>
          group.kind === "road" &&
          /^gc:(road|street|riverRoad|ring-road)-/.test(group.id) &&
          !group.locked &&
          !group.sourceRoad &&
          !group.beyond &&
          !group.crossing
      )
      .map(group => group.id)
  );
  for (const group of city.featureGroups)
    if (group.kind === "road")
      for (const ref of group.segments) {
        if (!owners.has(ref.edgeId)) owners.set(ref.edgeId, []);
        owners.get(ref.edgeId)!.push(group.id);
      }
  return [...owners]
    .filter(([, ids]) => ids.length > 1 && ids.some(id => streets.has(id)))
    .map(([edge, ids]) => `${edge}: ${ids.join(", ")}`);
}

it.each(["1sxzofc", "fresh-road-ownership"])(
  "stores no duplicated street edges and preserves plaza access for seed %s",
  seed => {
    const share = parseIncomingPayload(JSON.stringify(input))!;
    expect(share).not.toBeNull();
    const request = seed === share.seed ? share : { ...share, input: undefined, gridSeed: "fresh-road-grid" };
    const city = generateCityOnDocument(cityEditorDocument(request), cityEditorSettings(request), seed)!;
    expect(city).not.toBeNull();
    expect(duplicateStreetEdges(city)).toEqual([]);
    if (seed !== share.seed) {
      expect(validate(city)).toEqual([]);
      return;
    }
    const road5 = city.featureGroups.find(g => g.id === "gc:road-5")!;
    const road6 = city.featureGroups.find(g => g.id === "gc:road-6")!;
    expect(road5?.kind).toBe("road");
    expect(road6?.kind).toBe("road");
    if (road5.kind !== "road" || road6.kind !== "road") return;
    const edges5 = new Set(road5.segments.map(ref => ref.edgeId));
    expect(road6.segments.filter(ref => edges5.has(ref.edgeId))).toEqual([]);
    const nodes5 = roadPathVertices(city.mesh, road5.segments);
    const nodes6 = roadPathVertices(city.mesh, road6.segments);
    expect(nodes5).toContain(nodes6.at(-1));
    expect(nodes6[0]).toBe(city.gates.find(g => g.id === "gc:gate-2")!.vertexId);
    const plaza = new Set(
      city.elements
        .filter(e => e.kind === "plaza")
        .flatMap(e => e.faceIds.flatMap(id => faceVertices(city.mesh, city.mesh.faces[id])))
    );
    const adjacency = new Map<string, Set<string>>();
    for (const group of city.featureGroups)
      if (group.kind === "road")
        for (const ref of group.segments) {
          const edge = city.mesh.edges[ref.edgeId];
          for (const [a, b] of [
            [edge.a, edge.b],
            [edge.b, edge.a]
          ]) {
            if (!adjacency.has(a)) adjacency.set(a, new Set());
            adjacency.get(a)!.add(b);
          }
        }
    // Access goes through the existing bridge and road fragments. No single
    // group has to repeat the whole walk from this gate to the plaza.
    const queue = [nodes6[0]],
      reachable = new Set(queue);
    for (const id of queue)
      for (const next of adjacency.get(id) ?? [])
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
    expect([...plaza].some(id => reachable.has(id))).toBe(true);
    expect(validate(city)).toEqual([]);
  }
);
