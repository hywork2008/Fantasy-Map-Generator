import { describe, expect, it } from "vitest";
import type { DistrictFabric } from "../generators/blockInfill.types";
import { createDocument, createGridDocument } from "../generators/document";
import { forestContains, forestRegions } from "../generators/forestGeometry";
import { withForestSettings } from "../generators/forestLandCover";
import { buildForestPlan, cachedForestPlan } from "../generators/forestPlan";
import { polygonCentroid } from "../generators/geom";
import { meshFromCells } from "../generators/mesh";
import type { ForestPlan } from "../types/contracts/forest";
import type { Point } from "../types/document";
import { renderEditorSvg } from "./editorSvg";
import { FOREST_SVG_ELEMENT_LIMIT, renderForestLayer, updateForestScale } from "./forestSvg";
import { renderLandscapeLayer } from "./landscape";
import { landscapeTreeSpecies } from "./landscapeTreeSpecies";
import { renderStandaloneCitySvg, serializeCitySvg } from "./standaloneSvg";

const settings = { version: 1, mode: "farmland", density: "standard" } as const;
const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const fabric = (): DistrictFabric => ({ buildings: [], farms: [], lanes: [], entrances: new Map() });
function plan(size = 200): ForestPlan {
  const polygon = rect(-size / 2, -size / 2, size, size);
  const regions = forestRegions([{ faceId: "f0", polygon }]);
  regions[0].holes = [rect(-size / 8, -size / 8, size / 4, size / 4).reverse()];
  regions[0].areaM2 = (size * size * 15) / 16;
  return { regions, areaM2: regions[0].areaM2, forestFaceIds: ["f0"], protectedFarmAreaM2: 0, protectedFarmCount: 0 };
}
function city() {
  const doc = withForestSettings(createDocument("forest-svg", 600), settings);
  doc.generationSeed = "forest-svg";
  doc.appearance = "town";
  doc.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };
  const polys = [rect(-150, -150, 150, 300), rect(0, -150, 150, 300)];
  doc.mesh = meshFromCells(
    polys.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: true
    }))
  );
  for (const face of Object.values(doc.mesh.faces))
    Object.assign(face.properties, { water: "land", ward: "farm", settlement: "outskirts", elevation: 1 });
  doc.featureGroups = [];
  doc.gates = [];
  doc.elements = [];
  return doc;
}

describe("shared forest SVG", () => {
  it("draws Scots pine woodland candidates as conifers alongside broadleaf trees", () => {
    const doc = city();
    doc.biome!.key = "centralEuropeanGreatForest";
    const layer = renderForestLayer(doc, plan(400), "detailed", 1, { representation: "all-trees" });
    let pines = 0;
    let broadleaves = 0;
    for (const tree of layer.querySelectorAll("use")) {
      const point: Point = [Number(tree.getAttribute("data-world-x")), Number(tree.getAttribute("data-world-y"))];
      const species = landscapeTreeSpecies("garden_parkland", doc, point, "woodland");
      if (species === "scots_pine") {
        expect(tree.getAttribute("href")).toMatch(/-conifer$/);
        pines++;
      } else {
        expect(tree.getAttribute("href")).toMatch(/-leaf$/);
        broadleaves++;
      }
    }
    expect(pines).toBeGreaterThan(0);
    expect(broadleaves).toBeGreaterThan(0);
  });

  it("preserves exact forest area and holes at every quality, with a fill-only minimal layer", () => {
    const doc = city(),
      forest = plan();
    const layers = ["detailed", "light", "minimal"].map(q =>
      renderForestLayer(doc, forest, q as "detailed" | "light" | "minimal")
    );
    expect(new Set(layers.map(layer => layer.querySelector(".ce-forest-surface")!.getAttribute("d"))).size).toBe(1);
    for (const layer of layers) {
      expect(layer.querySelector(".ce-forest-surface")?.getAttribute("fill-rule")).toBe("evenodd");
      expect(Number(layer.getAttribute("data-forest-area-m2"))).toBe(forest.areaM2);
    }
    expect(layers[2].querySelectorAll("*")).toHaveLength(1);
    expect(layers[0].querySelector("clipPath path")?.getAttribute("d")).toBe(
      layers[0].querySelector(".ce-forest-surface")?.getAttribute("d")
    );
    expect(layers[0].querySelector("clipPath path")?.getAttribute("clip-rule")).toBe("evenodd");
    for (const tree of layers[0].querySelectorAll("use")) {
      const point: Point = [Number(tree.getAttribute("data-world-x")), Number(tree.getAttribute("data-world-y"))];
      expect(forestContains(forest.regions[0], point)).toBe(true);
    }
    doc.biome = { id: 9, key: "taiga", name: "Taiga", color: "#4b6b32" };
    const boreal = renderForestLayer(doc, forest);
    expect(
      new Set([...boreal.querySelectorAll("use")].map(tree => tree.getAttribute("href")?.split("-").at(-1))).size
    ).toBe(2);
  });

  it("bounds whole-forest detail and keeps the light trees a stable subset of detailed trees", () => {
    const doc = city(),
      forest = plan(4000);
    const detailed = renderForestLayer(doc, forest, "detailed", 1, { representation: "all-trees" });
    const light = renderForestLayer(doc, forest, "light", 1, { representation: "all-trees" });
    expect(detailed.querySelectorAll("*").length).toBe(FOREST_SVG_ELEMENT_LIMIT.detailed);
    expect(light.querySelectorAll("*").length).toBe(FOREST_SVG_ELEMENT_LIMIT.light);
    const trees = new Map(
      [...detailed.querySelectorAll("use")].map(tree => [
        tree.getAttribute("data-forest-tree"),
        tree.getAttribute("transform")
      ])
    );
    for (const tree of light.querySelectorAll("use"))
      expect(trees.get(tree.getAttribute("data-forest-tree"))).toBe(tree.getAttribute("transform"));
    const edge = renderForestLayer(doc, forest);
    expect(edge.querySelectorAll("[data-forest-edge='false']")).toHaveLength(0);
    expect(detailed.querySelectorAll("[data-forest-edge='false']").length).toBeGreaterThan(0);
  });

  it("does not replant trees on pan or zoom, updates detail without rebuilding, and exports every part", () => {
    const doc = city(),
      forest = plan();
    const first = renderForestLayer(doc, forest);
    expect(renderForestLayer(doc, forest).outerHTML).toBe(first.outerHTML);
    const tree = first.querySelector("use")!,
      surface = first.querySelector(".ce-forest-surface");
    updateForestScale(first, doc.frame.extentMeters, 0.01);
    expect(first.getAttribute("data-forest-detail")).toBe("surface");
    updateForestScale(first, doc.frame.extentMeters, 10);
    expect(first.getAttribute("data-forest-detail")).toBe("full");
    expect(first.querySelector("use")).toBe(tree);
    expect(first.querySelector(".ce-forest-surface")).toBe(surface);
    const exported = renderForestLayer(doc, forest, "detailed", 0.001, { static: true });
    updateForestScale(exported, 100000, 0.00001);
    expect(exported.hasAttribute("data-forest-detail")).toBe(false);
    expect(exported.querySelectorAll("use")).toHaveLength(first.querySelectorAll("use").length);
  });

  it("reuses geometry across view/density changes and invalidates for drawn keep-outs or mesh edits", () => {
    const doc = city(),
      built = fabric(),
      keep = { polygons: [] as Point[][], discs: [] as { center: Point; radius: number }[] };
    const original = cachedForestPlan(doc, built, keep);
    doc.forestSettings = { ...settings, density: "dense" };
    expect(cachedForestPlan(doc, built, keep)).toBe(original);
    keep.discs.push({ center: [0, 0], radius: 15 });
    const excluded = cachedForestPlan(doc, built, keep);
    expect(excluded).not.toBe(original);
    expect(excluded.areaM2).toBeLessThan(original.areaM2);
    expect(excluded.regions.some(region => forestContains(region, [0, 0]))).toBe(false);
    Object.values(doc.mesh.vertices)[0].point = [-149, -149];
    expect(cachedForestPlan(doc, built, keep)).not.toBe(excluded);
  });

  it("keeps legacy scenery outside the forest, including in clearings, without double scattering inside", () => {
    const doc = createGridDocument({ size: "small", grid: "voronoi", seed: "forest-suppression" });
    doc.appearance = "town";
    doc.biome = city().biome;
    const full = plan(1200);
    full.regions[0].holes = [];
    expect(renderLandscapeLayer(doc, true).children.length).toBeGreaterThan(0);
    expect(renderLandscapeLayer(doc, true, "detailed", { polygons: [], discs: [] }, full).children).toHaveLength(0);
    full.regions[0].holes = [rect(-570, -570, 220, 220)];
    expect(
      renderLandscapeLayer(doc, true, "detailed", { polygons: [], discs: [] }, full).children.length
    ).toBeGreaterThan(0);
  });

  it("integrates beneath city features, preserves road holes, and produces self-contained static SVG", () => {
    const doc = city();
    doc.frameRoads = [
      {
        sourceIndex: 0,
        routeId: 1,
        pieces: [
          {
            kind: "road",
            points: [
              [-160, 0],
              [160, 0]
            ]
          }
        ]
      }
    ];
    const svg = renderEditorSvg(doc, "select", selection, "-300 -300 600 600", 1);
    const forest = svg.querySelector(".ce-forest-layer")!;
    expect(forest).not.toBeNull();
    expect(forest.closest(".ce-landscape-layer")).not.toBeNull();
    const geometry = buildForestPlan(doc, fabric());
    expect(geometry.regions.some(region => forestContains(region, [0, 0]))).toBe(false);
    expect(svg.querySelectorAll(".ce-open-field,.ce-farm-shed")).toHaveLength(0);
    const exported = renderStandaloneCitySvg(doc, false, undefined, { representation: "all-trees" });
    expect(exported.querySelector(".ce-forest-layer")?.getAttribute("data-forest-static")).toBe("true");
    expect(exported.querySelector(".ce-forest-layer")?.getAttribute("data-forest-representation")).toBe("all-trees");
    for (const use of exported.querySelectorAll(".ce-forest-layer use")) {
      expect(use.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe(use.getAttribute("href"));
      expect(exported.querySelector(use.getAttribute("href")!)).not.toBeNull();
    }
    expect(serializeCitySvg(doc)).toContain("ce-forest-surface");
    delete doc.forestSettings;
    expect(
      renderEditorSvg(doc, "select", selection, "-300 -300 600 600", 1).querySelector(".ce-forest-layer")
    ).toBeNull();
  });
});

it.each(["marine", "tundra", "glacier", "lavaField"])(
  "ignores stale %s forests in SVG and background tree decoration",
  key => {
    const doc = city();
    doc.biome = { id: 1, key, name: key, color: "grey" };
    const input = plan();
    expect(renderForestLayer(doc, input).children.length).toBe(0);
    expect(renderForestLayer(doc, input).getAttribute("data-forest-area-m2")).toBe("0");
    expect(renderLandscapeLayer(doc, true).querySelector(".ce-landscape-tree")).toBeNull();
    expect(input.areaM2).toBeGreaterThan(0);
  }
);

it("does not turn unknown custom woodland into conifers from its display name", () => {
  const doc = city();
  doc.biome = { id: 1, key: "custom:taiga-party", name: "Taiga party", color: "green", tags: [] };
  const svg = renderForestLayer(doc, plan());
  const trees = [...svg.querySelectorAll("use")];
  expect(trees.length).toBeGreaterThan(0);
  expect(trees.every(tree => tree.getAttribute("href")?.endsWith("-leaf"))).toBe(true);
});
