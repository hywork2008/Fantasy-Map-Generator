import { describe, expect, it } from "vitest";
import { createGridDocument } from "../core/document";
import type { BurgSiteBiome } from "../core/gen/site/burgSiteDescriptor";
import {
  getLandscapeGroundColor,
  getLandscapeSuburbFaceColor,
  renderLandscapeLayer,
  resolveLandscapeTheme
} from "./landscape";

describe("landscape module", () => {
  describe("resolveLandscapeTheme", () => {
    it("returns default theme when biome is omitted", () => {
      const theme = resolveLandscapeTheme(undefined);
      expect(theme.category).toBe("grassland");
      expect(theme.groundFill).toBe("#d5cfbf");
    });

    it("maps hotDesert and coldDesert to desert theme", () => {
      const hot: BurgSiteBiome = { id: 1, key: "hotDesert", name: "Hot desert", color: "#fbe79f" };
      const cold: BurgSiteBiome = { id: 2, key: "coldDesert", name: "Cold desert", color: "#b5b887" };
      expect(resolveLandscapeTheme(hot).category).toBe("desert");
      expect(resolveLandscapeTheme(cold).category).toBe("desert");
    });

    it("maps taiga and temperateConiferousForest to conifer theme", () => {
      const taiga: BurgSiteBiome = { id: 9, key: "taiga", name: "Taiga", color: "#4b6b32" };
      expect(resolveLandscapeTheme(taiga).category).toBe("conifer");
    });

    it("maps tropical rainforest and seasonal forest to tropical theme", () => {
      const rain: BurgSiteBiome = { id: 7, key: "tropicalRainforest", name: "Tropical rainforest", color: "#7dcb35" };
      expect(resolveLandscapeTheme(rain).category).toBe("tropical");
    });

    it("maps temperateDeciduousForest and temperateRainforest to forest theme", () => {
      const deciduous: BurgSiteBiome = {
        id: 6,
        key: "temperateDeciduousForest",
        name: "Temperate deciduous forest",
        color: "#29bc56"
      };
      const rainforest: BurgSiteBiome = {
        id: 8,
        key: "temperateRainforest",
        name: "Temperate rainforest",
        color: "#409c43",
        tags: ["forest"]
      };
      expect(resolveLandscapeTheme(deciduous).category).toBe("forest");
      expect(resolveLandscapeTheme(rainforest).category).toBe("forest");
    });

    it("maps savanna and tropicalDryForest to savanna theme", () => {
      const sav: BurgSiteBiome = { id: 3, key: "savanna", name: "Savanna", color: "#d2d082" };
      const dryForest: BurgSiteBiome = {
        id: 24,
        key: "tropicalDryForest",
        name: "Tropical dry forest & thorn woodland",
        color: "#a3a34a",
        tags: ["forest", "dry", "tropical"]
      };
      expect(resolveLandscapeTheme(sav).category).toBe("savanna");
      expect(resolveLandscapeTheme(dryForest).category).toBe("savanna");
    });
  });

  describe("getLandscapeGroundColor & getLandscapeSuburbFaceColor", () => {
    it("returns editor canvas neutral color when appearance is not town", () => {
      const doc = createGridDocument({ size: "tiny" });
      doc.appearance = undefined;
      expect(getLandscapeGroundColor(doc)).toBe("#e1dfd4");
      expect(getLandscapeSuburbFaceColor(doc)).toBe("#e1dfd4");
    });

    it("returns biome-specific ground color when appearance is town", () => {
      const doc = createGridDocument({ size: "tiny" });
      doc.appearance = "town";
      doc.biome = { id: 1, key: "hotDesert", name: "Hot desert", color: "#fbe79f" };
      expect(getLandscapeGroundColor(doc)).toBe("#e8ddba");

      doc.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };
      expect(getLandscapeGroundColor(doc)).toBe("#c2d4ac");
    });
  });

  describe("renderLandscapeLayer", () => {
    it("returns an empty group when town is false", () => {
      const doc = createGridDocument({ size: "small" });
      doc.appearance = undefined;
      const layer = renderLandscapeLayer(doc, false);
      expect(layer.children.length).toBe(0);
    });

    it("generates forest landscape elements in suburbs for forest biome", () => {
      const doc = createGridDocument({ size: "small" });
      doc.appearance = "town";
      doc.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };

      const layer = renderLandscapeLayer(doc, true, "detailed");
      expect(layer.children.length).toBeGreaterThan(0);
      const treeElements = layer.querySelectorAll(".ce-landscape-tree");
      expect(treeElements.length).toBeGreaterThan(0);
    });

    it("generates desert landscape elements (dunes/cactus/rocks) for desert biome", () => {
      const doc = createGridDocument({ size: "small" });
      doc.appearance = "town";
      doc.biome = { id: 1, key: "hotDesert", name: "Hot desert", color: "#fbe79f" };

      const layer = renderLandscapeLayer(doc, true, "detailed");
      expect(layer.children.length).toBeGreaterThan(0);
      const desertFeatures = layer.querySelectorAll(
        ".ce-landscape-feature--dune, .ce-landscape-feature--cactus, .ce-landscape-feature--rock"
      );
      expect(desertFeatures.length).toBeGreaterThan(0);
    });

    it("generates conifer landscape elements for taiga biome", () => {
      const doc = createGridDocument({ size: "small" });
      doc.appearance = "town";
      doc.biome = { id: 9, key: "taiga", name: "Taiga", color: "#4b6b32" };

      const layer = renderLandscapeLayer(doc, true, "detailed");
      expect(layer.children.length).toBeGreaterThan(0);
      const conifers = layer.querySelectorAll(".ce-landscape-tree--conifer");
      expect(conifers.length).toBeGreaterThan(0);
    });

    it("reduces density when render quality is minimal", () => {
      const doc = createGridDocument({ size: "small" });
      doc.appearance = "town";
      doc.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };

      const detailedLayer = renderLandscapeLayer(doc, true, "detailed");
      const minimalLayer = renderLandscapeLayer(doc, true, "minimal");
      expect(minimalLayer.children.length).toBeLessThan(detailedLayer.children.length);
    });
  });
});
