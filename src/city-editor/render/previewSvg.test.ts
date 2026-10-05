import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../core/document";
import { renderCityPreviewSvg } from "./previewSvg";

vi.mock("../core/gen/blockInfill", () => ({
  buildBlockFabric: vi.fn(() => {
    throw new Error("Detailed fabric called");
  })
}));
vi.mock("../core/gen/buildingLots", () => ({
  buildCityBuildings: vi.fn(() => {
    throw new Error("Detailed lots called");
  })
}));
vi.mock("../core/gen/parkFabric", () => ({
  buildParkLawns: vi.fn(() => {
    throw new Error("Detailed parks called");
  })
}));
vi.mock("../core/gen/watermillFabric", () => ({
  buildWatermillPlan: vi.fn(() => {
    throw new Error("Detailed watermills called");
  })
}));

describe("structure-only city preview", () => {
  it.each(["legacy", "medieval"] as const)(
    "skips all detailed fabric for %s and leaves the document intact",
    pattern => {
      const city = createDocument("preview", 400);
      city.appearance = "town";
      city.buildingPattern = pattern;
      for (const face of Object.values(city.mesh.faces))
        Object.assign(face.properties, {
          water: "land",
          ward: "craftsmen",
          buildable: true,
          settlement: "core"
        });
      const original = JSON.stringify(city);
      const svg = renderCityPreviewSvg(city);
      expect(svg.getAttribute("data-render-quality")).toBe("preview");
      expect(svg.querySelectorAll(".ce-building")).toHaveLength(0);
      expect(svg.querySelectorAll("[data-face]").length).toBeGreaterThan(0);
      const symbols = [...svg.querySelectorAll("[data-preview-block]")];
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols.length).toBeLessThanOrEqual(300);
      for (const face of Object.values(city.mesh.faces))
        expect(symbols.filter(s => s.getAttribute("data-preview-block") === face.id).length).toBeLessThanOrEqual(3);
      expect(renderCityPreviewSvg(city).outerHTML).toBe(svg.outerHTML);
      expect(JSON.stringify(city)).toBe(original);
    }
  );
});
