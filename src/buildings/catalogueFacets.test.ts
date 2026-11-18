import { expect, it } from "vitest";
import { landmarkFacets, medievalFacets, placeableFacets, recordFacets } from "./catalogueFacets";
import type { LandmarkModel } from "./landmarks/architectureKit";
import type { MedievalModel } from "./medieval/modelKit";
import { modelFacetErrors } from "./modelFacets";
import { PLACEABLE_OBJECTS } from "./placeableObjects";
import type { BuildingRecord } from "./record";

const medieval = import.meta.glob<{ models: MedievalModel[] }>("./medieval/*Models.ts", { eager: true });
const landmarks = import.meta.glob<LandmarkModel>(
  [
    "./landmarks/*.ts",
    "!./landmarks/*.test.ts",
    "!./landmarks/architectureKit.ts",
    "!./landmarks/landmarkTestSupport.ts"
  ],
  { eager: true, import: "model" }
);
const records = import.meta.glob<BuildingRecord>("./catalogue/*.json", { eager: true, import: "default" });

it("gives every registered model valid facets", () => {
  const entries = [
    ...Object.values(medieval).flatMap(m => m.models.map(model => [model.id, medievalFacets(model)] as const)),
    ...Object.values(landmarks).map(model => [model.id, landmarkFacets(model)] as const),
    ...PLACEABLE_OBJECTS.map(object => [object.id, placeableFacets(object)] as const),
    ...Object.values(records).map(record => [record.id, recordFacets(record)] as const)
  ];
  expect(entries.length).toBeGreaterThan(250);
  for (const [id, facets] of entries) expect(modelFacetErrors(facets), id).toEqual([]);
});

it("keeps dedicated trades apart from studies that share their task number", () => {
  const byId = new Map(Object.values(medieval).flatMap(m => m.models.map(model => [model.id, model] as const)));
  expect(medievalFacets(byId.get("trade-workshop.dedicated-horse-mill")!).uses).toEqual(["milling"]);
  expect(medievalFacets(byId.get("trade-workshop.dedicated-cutlery")!).uses).toEqual(["cutlery"]);
  expect(medievalFacets(byId.get("market-cross-stepped")!).kind).toBe("prop");
  expect(medievalFacets(byId.get("trade-workhome.workhome-standard.leatherGoods")!).uses).toContain("leather-goods");
});
