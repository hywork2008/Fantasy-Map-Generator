import { describe, expect, it } from "vitest";
import { getBurialCulturePreset } from "../../../data/burialCultures";
import { burialPresetsFor, getTradition } from "../../../data/civilizationTraditions";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { parseDocument, serializeDocument } from "../../services/io/documentCodec";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import { copyLegacyCity } from "../../services/io/vector/legacyCopy";
import { layoutCemetery } from "../cemeteryLayout";
import { legacyLandscapeFixture } from "./fixtures/legacyLandscape";
import { treeCrown } from "./geometry/landscape";
import { regionArea, regionBoolean } from "./geometry/regions";
import { rebuildVectorLandscape, regenerateVectorLandscape } from "./landscape";

const area = (doc: ReturnType<typeof copyLegacyCity>["document"]) =>
  doc.environment!.landscape!.forest.regionIds.reduce((n, id) => n + regionArea(doc.regions[id]), 0);

describe("native landscape regeneration", () => {
  it("regenerates without the archive, restores farmland and keeps deterministic density subsets and canopy holes", () => {
    const source = legacyLandscapeFixture();
    expect(parseDocument(serializeDocument(source))).not.toBeNull();
    const copy = copyLegacyCity(source);
    expect(
      copy.document.environment?.landscape,
      JSON.stringify(copy.report.filter(r => r.category === "landscape-plan"))
    ).toBeDefined();
    const original = parseVectorDocument(serializeVectorDocument(copy.document))!;
    delete original.legacyCopy;
    const before = JSON.stringify(original),
      dense = regenerateVectorLandscape(original),
      plan = dense.environment!.landscape!;
    expect(area(dense)).toBeCloseTo(3200, 4);
    const woods = plan.trees.filter(t => t.ownerId === "landscape:forest");
    expect(woods.length).toBeGreaterThan(0);
    const sparse = regenerateVectorLandscape(dense, { forest: { version: 1, mode: "farmland", density: "sparse" } });
    const sparseTrees = sparse.environment!.landscape!.trees.filter(t => t.ownerId === "landscape:forest");
    expect(sparseTrees.length).toBeLessThan(woods.length);
    expect(sparseTrees.every(t => woods.some(w => w.id === t.id && w.species === t.species))).toBe(true);
    const repeat = regenerateVectorLandscape(dense);
    expect(repeat.environment!.landscape).toEqual(plan);
    expect(JSON.stringify(original)).toBe(before);
    const off = regenerateVectorLandscape(dense, { forest: { version: 1, mode: "legacy", density: "dense" } });
    expect(area(off)).toBe(0);
    expect(
      off.environment!.landscape!.forest.farmRegionIds.reduce((n, id) => n + regionArea(off.regions[id]), 0)
    ).toBeCloseTo(3600, 4);
    for (const tree of woods)
      expect(
        regionBoolean(
          [treeCrown(tree)],
          plan.forest.regionIds.map(id => dense.regions[id]),
          "difference"
        ).reduce((n, p) => n + regionArea(p), 0)
      ).toBeLessThan(1e-5);
    const cold = regenerateVectorLandscape(dense, {
      climate: { biome: { id: 99, key: "glacier", name: "Ice", color: "#ffffff" }, temperatureC: -20 }
    });
    expect(cold.environment!.landscape!.trees).toHaveLength(0);
    expect(area(cold)).toBe(0);
    const warm = regenerateVectorLandscape(cold, { climate: { biome: plan.context.biome, temperatureC: 12 } });
    expect(area(warm)).toBeCloseTo(3200, 4);
    expect(warm.environment!.landscape!.trees).toEqual(plan.trees);
    expect(parseVectorDocument(serializeVectorDocument(warm))).toEqual(warm);
    const data = vectorRenderData(warm),
      scene = createVectorScene(data);
    expect(data.surfaces.filter(s => s.pieceRole === "landscape-tree")).toHaveLength(plan.trees.length);
    const trees = scene.group.children.find(n => n.name === "vector-landscape-trees")!;
    expect(trees).toBeDefined();
    expect(trees.children.length).toBeGreaterThan(0);
    expect(data.landscapeTrees?.map(t => t.species)).toEqual(plan.trees.map(t => t.species));
    scene.dispose();
  });

  it("clips automatic field rows around woodland while preserving a locked field", () => {
    const doc = copyLegacyCity(legacyLandscapeFixture()).document;
    doc.environment!.landscape!.farmSources = [
      {
        id: "landscape:farm:fixed",
        polygon: {
          outer: [
            [-30, -30],
            [30, -30],
            [30, 30],
            [-30, 30]
          ],
          holes: []
        },
        locked: false,
        rows: [
          [
            [-30, 0],
            [30, 0]
          ]
        ],
        kind: "open-field",
        cropState: "winter-crop"
      }
    ];
    rebuildVectorLandscape(doc);
    const farms = doc.environment!.landscape!.farms;
    expect(farms.reduce((n, f) => n + regionArea(f.polygon), 0)).toBeCloseTo(400, 4);
    expect(farms.flatMap(f => f.rows)).toEqual([
      [
        [-10, 0],
        [10, 0]
      ]
    ]);
    expect(farms.every(f => f.cropState === "winter-crop")).toBe(true);
    doc.environment!.landscape!.farmSources[0].locked = true;
    const locked = regenerateVectorLandscape(doc);
    expect(area(locked)).toBe(0);
    expect(locked.environment!.landscape!.farms[0].rows).toEqual([
      [
        [-30, 0],
        [30, 0]
      ]
    ]);
  });

  it("applies the local faith with the shared cultural layout while preserving locked plans", () => {
    const source = legacyLandscapeFixture(),
      doc = copyLegacyCity(source).document;
    doc.environment!.landscape!.context.biome!.name = "Independent native biome";
    expect(source.biome!.name).toBe("Central forest");
    const preset = burialPresetsFor("sunni", doc.context.historicalPeriod, getTradition("latinWest"))[0];
    const changed = regenerateVectorLandscape(doc, { useCivilization: true }),
      c = changed.environment!.landscape!.cemeteries[0];
    expect(c.burialProfile?.id).toBe(preset);
    expect(c.parts).not.toEqual(source.cemeteries![0].parts);
    const reference = layoutCemetery(source, {
      ...source.cemeteries![0],
      burialProfile: getBurialCulturePreset(preset)
    })!;
    expect(c.parts).toEqual(reference.parts);
    expect(c.accesses).toEqual(reference.accesses);
    expect(c.trees).toEqual(reference.trees);
    const locked = structuredClone(doc);
    locked.environment!.landscape!.cemeteries[0].locked = true;
    const lockedBefore = structuredClone(locked.environment!.landscape!.cemeteries[0]);
    expect(regenerateVectorLandscape(locked, { useCivilization: true }).environment!.landscape!.cemeteries[0]).toEqual(
      lockedBefore
    );
    const invalid = structuredClone(doc);
    invalid.environment!.landscape!.trees[0].ownerId = "missing-owner";
    expect(parseVectorDocument(JSON.stringify(invalid))).toBeNull();
    invalid.environment!.landscape!.trees[0] = structuredClone(doc.environment!.landscape!.trees[0]);
    invalid.environment!.landscape!.forest.regionIds = ["missing-region"];
    expect(parseVectorDocument(JSON.stringify(invalid))).toBeNull();
  });
});
