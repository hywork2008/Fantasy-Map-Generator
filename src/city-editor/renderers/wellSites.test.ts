import { expect, it } from "vitest";
import type { DistrictFabric } from "../generators/blockInfill";
import type { CityDocument } from "../types/document";
import { collectWellSites } from "./wellSites";

it("uses SVG well sites, excludes other water points and avoids duplicate plaza wells", () => {
  const city = {
    elements: [
      { id: "plaza", kind: "plaza", point: [10, 20] },
      { id: "tree", kind: "tree", point: [0, 0] }
    ]
  } as CityDocument;
  const fabric = {
    aerialLandmarks: {
      domesticWater: [
        { id: "well", kind: "well", center: [10, 20] },
        { id: "neighborhood", kind: "well", center: [50, 60] },
        ...["cistern", "spring", "pond"].map(kind => ({ id: kind, kind, center: [80, 90] }))
      ],
      monasteries: [{ id: "abbey", kind: "abbey", well: [100, 110] }]
    }
  } as DistrictFabric;
  expect(collectWellSites(city, fabric)).toEqual([
    { id: "well", point: [10, 20] },
    { id: "neighborhood", point: [50, 60] }
  ]);
  expect(collectWellSites(city, {} as DistrictFabric)).toEqual([{ id: "plaza", point: [10, 20], kind: "publicBasin" }]);
});

it("uses the collision-checked basin location and never adds an extra center well", () => {
  const city = { elements: [{ id: "plaza", kind: "plaza", point: [0, 0] }] } as CityDocument;
  const fabric = {
    aerialLandmarks: { domesticWater: [{ id: "basin", kind: "publicBasin", center: [5, 0] }], monasteries: [] }
  } as unknown as DistrictFabric;
  expect(collectWellSites(city, fabric)).toEqual([{ id: "basin", point: [5, 0], kind: "publicBasin" }]);
  fabric.aerialLandmarks!.domesticWater = [];
  expect(collectWellSites(city, fabric)).toEqual([]);
});

it("lets all monasteries own their courtyard well without duplicating it at terrain height", () => {
  const city = { elements: [] } as unknown as CityDocument;
  const fabric = {
    aerialLandmarks: {
      monasteries: [
        { id: "friary", kind: "friary", well: [10, 20] },
        { id: "abbey", kind: "abbey", well: [40, 50] },
        { id: "orthodox", kind: "orthodoxMonastery", well: [70, 80] }
      ],
      domesticWater: []
    }
  } as unknown as DistrictFabric;
  expect(collectWellSites(city, fabric)).toEqual([]);
});
