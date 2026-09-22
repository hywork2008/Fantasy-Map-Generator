import { describe, expect, it } from "vitest";
import { featureGroupVertices } from "./features";
import fixture from "./fixtures/river-gates-20260923.json";
import { defaultGenerationSettings, generateCityAttempt, generateStageOnDocument, generateWardStep } from "./generate";
import { faceVertices, validate } from "./mesh";
import { explainGeneratedCrossingFailures, kindEdgeIds, vertexHasCrossing } from "./passages";
import type { CityDocument } from "./types";

describe("river-side gate preservation", () => {
  const cases = [
    { coast: "none", river: "meander", seed: fixture.generationSeed },
    ...(["none", "straight", "bay", "cape"] as const).flatMap(coast =>
      [fixture.generationSeed, "gates-a", "gates-b"].map(seed => ({
        coast,
        river: coast === "none" ? ("through" as const) : ("toCoast" as const),
        seed
      }))
    )
  ] as const;
  for (const { coast, river, seed } of cases) {
    it(`${coast}/${river}/${seed}: keeps stage-four gates connected to the plaza and frame through completion`, () => {
      const input = fixture as CityDocument;
      const settings = defaultGenerationSettings();
      settings.layout = "classic";
      settings.config.coast = coast;
      settings.config.features.port = coast !== "none";
      settings.config.rivers = [river];
      const walls = generateStageOnDocument(input, settings, seed, 4)!;
      expect(walls).not.toBeNull();
      expect(walls.gates.length).toBeGreaterThan(0);
      const riverVertices = new Set(
        [...kindEdgeIds(walls, "river")].flatMap(id => [walls.mesh.edges[id].a, walls.mesh.edges[id].b])
      );
      for (const gate of walls.gates) expect(riverVertices.has(gate.vertexId)).toBe(false);
      const wards = generateStageOnDocument(input, settings, seed, 6)!;
      const complete = generateCityAttempt(input, settings, seed)!;
      for (const city of [wards, complete]) {
        expect(city).not.toBeNull();
        expect(city.gates).toEqual(walls.gates);
        expect(validate(city)).toEqual([]);
        expect(explainGeneratedCrossingFailures(city)).toEqual([]);
        const plaza = city.elements.find(e => e.kind === "plaza")!;
        const targets = new Set(plaza.faceIds.flatMap(id => faceVertices(city.mesh, city.mesh.faces[id])));
        const adjacency = new Map<string, Set<string>>();
        for (const id of kindEdgeIds(city, "road")) {
          const edge = city.mesh.edges[id];
          for (const [a, b] of [
            [edge.a, edge.b],
            [edge.b, edge.a]
          ]) {
            if (!adjacency.has(a)) adjacency.set(a, new Set());
            adjacency.get(a)!.add(b);
          }
        }
        for (const gate of city.gates) {
          expect(vertexHasCrossing(city, gate.vertexId, "wall", "road")).toBe(true);
          const seen = new Set([gate.vertexId]);
          const queue = [gate.vertexId];
          for (const vertex of queue)
            for (const other of adjacency.get(vertex) ?? []) {
              if (!seen.has(other)) {
                seen.add(other);
                queue.push(other);
              }
            }
          expect(
            [...targets].some(id => seen.has(id)),
            `${gate.vertexId} reaches plaza`
          ).toBe(true);
          expect(
            queue.some(id => city.mesh.vertices[id].point.some(v => Math.abs(v) >= city.frame.extentMeters / 2 - 1)),
            `${gate.vertexId} reaches frame`
          ).toBe(true);
          expect(
            city.featureGroups.filter(g => g.kind === "road" && featureGroupVertices(city, g).includes(gate.vertexId))
              .length
          ).toBeGreaterThanOrEqual(2);
        }
      }
    });
  }
});

it("keeps ward-step roads stable and invalidates the preview after settings edits", () => {
  const input = structuredClone(fixture) as CityDocument;
  const settings = defaultGenerationSettings();
  settings.layout = "classic";
  settings.config.rivers = ["through"];
  const seed = input.generationSeed!;
  const first = generateWardStep(input, settings, seed, 0);
  expect(first.document).not.toBeNull();
  const expected = structuredClone(first.document!);
  first.document!.gates.length = 0;
  const replay = generateWardStep(input, settings, seed, 0);
  expect(replay.document).toEqual(expected);
  const later = generateWardStep(input, settings, seed, first.total - 1);
  expect(later.document!.gates).toEqual(expected.gates);
  expect(later.document!.featureGroups).toEqual(expected.featureGroups);
  settings.config.features.walls = false;
  const unwalled = generateWardStep(input, settings, seed, 0);
  expect(unwalled.document).not.toBeNull();
  expect(unwalled.document!.gates).toEqual([]);
});
