import { expect, it } from "vitest";
import type { CityDocument, CityElement } from "../types/document";
import { canPlaceObject } from "./objectPlacement";

it("rejects an envelope overlapping water even when the anchor is dry, including after scaling and rotating", () => {
  const city = {
    mesh: { faces: {}, vertices: {}, edges: {} },
    featureGroups: [],
    gates: [],
    elements: [],
    waterAreas: [
      {
        kind: "river",
        polygon: [
          [20, -100],
          [30, -100],
          [30, 100],
          [20, 100]
        ]
      }
    ]
  } as unknown as CityDocument;
  const item: CityElement = {
    id: "test",
    kind: "object",
    faceIds: [],
    locked: false,
    point: [0, 0],
    objectType: "trebuchet"
  };
  expect(canPlaceObject(city, item)).toBe(true);
  expect(canPlaceObject(city, { ...item, point: [25, 0] })).toBe(false);
  expect(canPlaceObject(city, { ...item, point: [19, 0] })).toBe(false);
  expect(canPlaceObject(city, { ...item, objectScale: 5 })).toBe(false);
  expect(canPlaceObject(city, { ...item, point: [15, 0], rotation: Math.PI / 2 })).toBe(true);
  expect(canPlaceObject(city, { ...item, point: [15, 0], rotation: 0 })).toBe(false);
  expect(canPlaceObject(city, { ...item, objectType: "missing" })).toBe(false);
});
