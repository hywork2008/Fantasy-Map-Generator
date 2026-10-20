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
      monasteries: [{ id: "abbey", well: [100, 110] }]
    }
  } as DistrictFabric;
  expect(collectWellSites(city, fabric)).toEqual([
    { id: "well", point: [10, 20] },
    { id: "neighborhood", point: [50, 60] },
    { id: "abbey:well", point: [100, 110] }
  ]);
  expect(collectWellSites(city, {} as DistrictFabric)).toEqual([{ id: "plaza", point: [10, 20] }]);
});
