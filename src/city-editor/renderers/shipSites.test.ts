import { expect, it } from "vitest";
import type { CityDocument } from "../types/document";
import { collectShipSites } from "./shipSites";

it("matches SVG visibility and defaults, keeping manually placed ships but hiding ships of deleted harbors", () => {
  const city = {
    mesh: { faces: {}, edges: {}, vertices: {} },
    elements: [
      { id: "moored", kind: "ship", point: [10, 20], shipType: "large", sizeMeters: 35, rotation: 0.8 },
      { id: "default", kind: "ship", point: [30, 40] },
      { id: "removed-harbor", kind: "ship", point: [0, 0], harborFaceId: "gone" },
      { id: "no-point", kind: "ship" },
      { id: "tree", kind: "tree", point: [1, 2] }
    ]
  } as CityDocument;
  expect(collectShipSites(city)).toEqual([
    { id: "moored", point: [10, 20], type: "large", length: 35, rotation: 0.8 },
    { id: "default", point: [30, 40], type: "small", length: 16, rotation: 0 }
  ]);
  const before = JSON.stringify(collectShipSites(city));
  city.elements[0].rotation = 1.2;
  expect(JSON.stringify(collectShipSites(city))).not.toBe(before);
  city.elements = [];
  expect(collectShipSites(city)).toEqual([]);
});
