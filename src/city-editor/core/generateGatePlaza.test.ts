import { expect, it } from "vitest";
import fixture from "./fixtures/gate-plaza-20261002.json";
import { polygonCentroid } from "./gen/geom";
import { defaultGenerationSettings, generateCityAttempt } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import { meshFromCells, validate } from "./mesh";
import { vertexHasCrossing } from "./passages";
import type { CityDocument, Point } from "./types";

it("connects a gate to another polygonal plaza corner when the nearest corner is blocked by a temple", () => {
  // The supplied failure SVG retains split-face geometry, not the original
  // grid seed. Rebuilding that geometry also reproduces its gate-routing failure.
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
  const before = structuredClone(source);
  const failures: GenerationDebugPreview[] = [];
  // Written when the default layout was "auto" (seed l1nr46 rolls the polygonal
  // circulade plaza, which reserves no faces); pin it.
  const settings = defaultGenerationSettings();
  settings.layout = "circulade";
  const city = generateCityAttempt(
    source,
    settings,
    "l1nr46",
    () => {},
    1,
    p => failures.push(p)
  );
  expect(failures.map(p => p.sample.failure?.reason)).toEqual([]);
  expect(city).not.toBeNull();
  expect(city!.elements.some(e => e.kind === "temple")).toBe(true);
  expect(city!.elements.find(e => e.kind === "plaza")!.faceIds).toEqual([]);
  expect(city!.gates.some(g => g.id === "gc:gate-1")).toBe(true);
  for (const gate of city!.gates) expect(vertexHasCrossing(city!, gate.vertexId, "wall", "road")).toBe(true);
  expect(validate(city!)).toEqual([]);
  expect(source).toEqual(before);
});
