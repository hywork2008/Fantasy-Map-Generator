import { describe, expect, it } from "vitest";
import type { LandmarkModel } from "../buildings/landmarks/architectureKit";
import type { MedievalModel } from "../buildings/medieval/modelKit";
import type { BuildingRecord } from "../buildings/record";
import { catalogueWikipedia, landmarkWikipedia, medievalWikipediaArticle, wikipediaLink } from "./wikipedia";

const medieval = import.meta.glob<{ models: MedievalModel[] }>("../buildings/medieval/*Models.ts", { eager: true });
const records = import.meta.glob<BuildingRecord>("../buildings/catalogue/*.json", { eager: true, import: "default" });
const landmarks = import.meta.glob<LandmarkModel>(
  [
    "../buildings/landmarks/*.ts",
    "!../buildings/landmarks/*.test.ts",
    "!../buildings/landmarks/architectureKit.ts",
    "!../buildings/landmarks/landmarkTestSupport.ts"
  ],
  { eager: true, import: "model" }
);

describe("BV Wikipedia references", () => {
  it("covers every catalogue, landmark and medieval model", () => {
    for (const record of Object.values(records)) expect(catalogueWikipedia[record.id], record.id).toBeTruthy();
    for (const model of Object.values(landmarks)) expect(landmarkWikipedia[model.id], model.id).toBeTruthy();
    for (const { models } of Object.values(medieval)) {
      for (const model of models) expect(medievalWikipediaArticle(model), model.id).toBeTruthy();
    }
  });

  it("opens a readable English article link in a separate tab", () => {
    const link = wikipediaLink("Vézelay Abbey");
    expect(decodeURIComponent(link.href)).toBe("https://en.wikipedia.org/wiki/Vézelay_Abbey");
    expect(link.textContent).toBe("Wikipedia (English): Vézelay Abbey");
    expect(link.target).toBe("_blank");
    expect(link.relList.contains("noopener")).toBe(true);
    expect(link.relList.contains("noreferrer")).toBe(true);
  });
});
