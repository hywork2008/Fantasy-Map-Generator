import { expect, it } from "vitest";
import { type ModelFacets, modelFacetErrors } from "./modelFacets";

const tank: ModelFacets = {
  kind: "weapon",
  periods: ["petroleumEra"],
  years: [1916, 1918],
  regions: ["european"],
  uses: ["military"]
};

it("accepts a well-formed facet set and names each malformed field", () => {
  expect(modelFacetErrors(tank)).toEqual([]);
  expect(
    modelFacetErrors({
      ...tank,
      periods: ["petroleumEra", "steamEra"],
      years: [1918, 1916],
      regions: ["any", "european"],
      uses: ["Military"]
    })
  ).toEqual([
    "periods must be unique and oldest first",
    "years must be an ordered integer range",
    '"any" cannot be combined with regions',
    "use tag Military is not kebab-case"
  ]);
  expect(modelFacetErrors({ ...tank, periods: [], regions: [] })).toEqual(["periods is empty", "regions is empty"]);
});
