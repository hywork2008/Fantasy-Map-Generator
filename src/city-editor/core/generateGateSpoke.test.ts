import { expect, it } from "vitest";
import fixture from "./fixtures/gate-spoke-20261002.json";
import { polygonCentroid } from "./gen/geom";
import { bramCoreRadiusForCity, bramRoadBanRadiusMeters } from "./gen/polygonalCirculadeLayout";
import { defaultGenerationSettings, generateCityAttempt } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import { meshFromCells } from "./mesh";
import { vertexHasCrossing } from "./passages";
import type { CityDocument, Point } from "./types";

it("connects Bram gates to nearby usable spoke endpoints without entering the reserved core", () => {
  const cells = fixture.polygons.map((polygon, id) => {
    const points = polygon as Point[];
    const center = polygonCentroid(points);
    return { id, polygon: points, site: center, centroid: center, neighbors: [], onBorder: false };
  });
  const source: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 600, cityRadiusMeters: 198, blockSizeMeters: 50 },
    historicalPeriod: "ageOfExploration",
    gridKind: "evolution",
    mesh: meshFromCells(cells),
    featureGroups: [],
    gates: [],
    elements: []
  };
  // Original settings are unavailable. This coherent configuration reproduces
  // two disconnected Bram gates on the supplied geometry before the repair.
  const settings = defaultGenerationSettings();
  settings.config.coast = "straight";
  settings.config.rivers = ["through"];
  settings.config.features = { walls: true, citadel: true, plaza: false, temple: true, port: true, shanty: true };
  const before = structuredClone(source);
  let preview: GenerationDebugPreview | undefined;
  const city = generateCityAttempt(
    source,
    settings,
    "kz6ecv",
    () => {},
    1,
    p => {
      preview = p;
    }
  );
  expect(preview?.sample.failure?.reason).not.toBe("unconnected-gates");
  const routed = city ?? preview!.document;
  expect(routed.layout).toBe("bram");
  const gates = routed.gates.filter(g => !g.ownerCastleId);
  expect(gates).toHaveLength(2);
  for (const gate of gates) expect(vertexHasCrossing(routed, gate.vertexId, "wall", "road")).toBe(true);
  const minimumRadius = bramRoadBanRadiusMeters(bramCoreRadiusForCity(198, true));
  for (const group of routed.featureGroups) {
    if (group.kind !== "road" || !group.id.startsWith("gc:road-")) continue;
    for (const ref of group.segments) {
      const edge = routed.mesh.edges[ref.edgeId];
      for (const id of [edge.a, edge.b])
        expect(Math.hypot(...routed.mesh.vertices[id].point)).toBeGreaterThanOrEqual(minimumRadius);
    }
  }
  expect(source).toEqual(before);
});
