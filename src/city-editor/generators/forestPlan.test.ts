import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import type { ForestSettings } from "../types/contracts/forest";
import type { CityDocument, Point } from "../types/document";
import { removeBastionedTown } from "./bastionedTown/edit";
import { buildBlockFabric, documentFabricFingerprint } from "./blockInfill";
import type { DistrictFabric } from "./blockInfill.types";
import { createDocument, createGridDocument } from "./document";
import { forestRegions } from "./forestGeometry";
import { enforceForestLandCover, forestLandCover, withForestSettings } from "./forestLandCover";
import { buildForestPlan, cachedForestPlan } from "./forestPlan";
import { generateCityOnDocument } from "./generation/generateCity";
import { generateWardStep } from "./generation/previews";
import { defaultGenerationSettings } from "./generation/settings";
import { pointInPolygon, polygonCentroid } from "./geom";
import { DocumentHistory } from "./history";
import { facePoints, faceVertices, mergeFaces, meshFromCells, splitFace } from "./mesh";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "./ruralFieldOverlay";
import { applyRuralFields } from "./ruralFields";
import { attachSceneRegions } from "./sceneRegions";

const settings: ForestSettings = { version: 1, mode: "farmland", density: "standard" };
const emptyFabric = (): DistrictFabric => ({ buildings: [], farms: [], lanes: [], entrances: new Map() });
function city(): CityDocument {
  const polygons: Point[][] = Array.from({ length: 9 }, (_, i) => {
    const x = (i % 3) * 20 - 30,
      y = Math.floor(i / 3) * 20 - 30;
    return [
      [x, y],
      [x + 20, y],
      [x + 20, y + 20],
      [x, y + 20]
    ];
  });
  const doc = createDocument("forest-test", 100);
  doc.mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  doc.featureGroups = [];
  doc.elements = [];
  doc.gates = [];
  for (const face of Object.values(doc.mesh.faces))
    Object.assign(face.properties, { ward: "farm", settlement: "outskirts", water: "land", elevation: 1 });
  return doc;
}
const contains = (plan: ReturnType<typeof buildForestPlan>, point: Point) =>
  plan.regions.some(
    region => pointInPolygon(point, region.outer) && !region.holes.some(hole => pointInPolygon(point, hole))
  );

describe("forest land ownership and shared geometry", () => {
  it("leaves old documents alone and respects clearings, locks, water and protected uses", () => {
    const doc = city();
    expect(forestLandCover(doc).size).toBe(0);
    const next = withForestSettings(doc, settings);
    next.mesh.faces.f0.properties.locked = true;
    next.mesh.faces.f1.properties.landCoverOverride = "open";
    next.mesh.faces.f2.properties.water = "lake";
    next.mesh.faces.f3.properties.ward = "park";
    next.mesh.faces.f4.properties.ward = "empty";
    expect([...forestLandCover(next)]).toEqual(["f5", "f6", "f7", "f8"]);
    next.forestSettings = { ...settings, mode: "surroundings" };
    expect(forestLandCover(next).has("f4")).toBe(true);
    next.mesh.faces.f4.properties.settlement = "core";
    expect(forestLandCover(next).has("f4")).toBe(false);
    expect(doc.forestSettings).toBeUndefined();
  });

  it("dissolves shared cell edges, retains a clearing hole, and is independent of face order", () => {
    const doc = withForestSettings(city(), settings, { f4: "open" });
    const plan = buildForestPlan(doc, emptyFabric());
    expect(plan.regions).toHaveLength(1);
    expect(plan.regions[0].holes).toHaveLength(1);
    expect(plan.areaM2).toBeCloseTo(3200, 3);
    expect(contains(plan, [0, 0])).toBe(false);
    expect(contains(plan, [-20, 0])).toBe(true);
    const reverse = {
      ...doc,
      mesh: { ...doc.mesh, faces: Object.fromEntries(Object.entries(doc.mesh.faces).reverse()) }
    };
    expect(buildForestPlan(reverse, emptyFabric())).toEqual(plan);
  });

  it("splits T junctions without seams and keeps forests touching at one point separate", () => {
    const rect = (x: number, y: number, w: number, h: number): Point[] => [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ];
    const regions = forestRegions(
      [rect(0, 0, 10, 20), rect(10, 0, 10, 10), rect(10, 10, 10, 10)].map((polygon, i) => ({
        faceId: `f${i}`,
        polygon
      }))
    );
    expect(regions).toHaveLength(1);
    expect(regions[0].outer).toHaveLength(4);
    expect(regions[0].areaM2).toBeCloseTo(400, 3);
    expect(
      forestRegions([rect(0, 0, 10, 10), rect(10, 10, 10, 10)].map((polygon, i) => ({ faceId: `f${i}`, polygon })))
    ).toHaveLength(2);
  });

  it("cuts road, water and building footprints out of the same plan", () => {
    const doc = withForestSettings(city(), settings);
    doc.frameRoads = [
      {
        sourceIndex: 0,
        routeId: 1,
        pieces: [
          {
            kind: "road",
            points: [
              [-40, 0],
              [40, 0]
            ]
          }
        ]
      }
    ];
    doc.waterAreas = [
      {
        kind: "river",
        polygon: [
          [-26, 10],
          [-14, 10],
          [-14, 26],
          [-26, 26]
        ]
      }
    ];
    const fabric = emptyFabric();
    const footprint: Point[] = [
      [14, 10],
      [26, 10],
      [26, 26],
      [14, 26]
    ];
    fabric.buildings = [
      {
        faceId: "f6",
        landmark: false,
        polygon: [
          [-26, -26],
          [-14, -26],
          [-14, -14],
          [-26, -14]
        ]
      }
    ];
    fabric.farms = [{ faceId: "f8", polygon: footprint, rows: [] }];
    doc.mesh.faces.f8.properties.locked = true;
    const plan = buildForestPlan(doc, fabric);
    expect(contains(plan, [0, 0])).toBe(false);
    expect(contains(plan, [-20, 20])).toBe(false);
    expect(contains(plan, [20, 20])).toBe(false);
    expect(contains(plan, [-20, -20])).toBe(false);
    expect(contains(plan, [0, -20])).toBe(true);
    expect(plan.regions.length).toBeGreaterThanOrEqual(2);
    expect(plan.protectedFarmCount).toBe(1);
    expect(plan.protectedFarmAreaM2).toBe(192);
  });

  it("excludes selected farmland before generating plots and preserves locked plots", () => {
    const doc = withForestSettings(city(), settings);
    doc.ruralFieldVersion = 2;
    const fabric = emptyFabric();
    fabric.farms = [{ faceId: "f0", polygon: facePoints(doc.mesh, doc.mesh.faces.f0), rows: [] }];
    doc.mesh.faces.f0.properties.locked = true;
    expect(applyRuralFields(doc, fabric).farms).toEqual(fabric.farms);
    fabric.lanes = [
      {
        faceId: "f0",
        points: [
          [-25, -20],
          [5, -20]
        ],
        widthMeters: 2,
        kind: "farm-track"
      }
    ];
    expect(applyRuralFields(doc, fabric).lanes).toEqual(fabric.lanes);
    expect(enforceForestLandCover(doc, fabric).lanes).toEqual(fabric.lanes);
    expect(contains(buildForestPlan(doc, fabric), [0, -20])).toBe(false);
    doc.mesh.faces.f0.properties.locked = false;
    expect(applyRuralFields(doc, fabric).farms).toHaveLength(0);
  });

  it("rejects stale overlays and filters legacy plots and farm-only tracks at the final boundary", () => {
    const doc = city(),
      oldKey = documentFabricFingerprint(doc);
    const fabric = emptyFabric();
    fabric.farms = [{ faceId: "f0", polygon: facePoints(doc.mesh, doc.mesh.faces.f0), rows: [] }];
    fabric.lanes = [
      {
        faceId: "f0",
        points: [
          [-25, -20],
          [-15, -20]
        ],
        widthMeters: 2,
        kind: "farm-track"
      }
    ];
    storeRuralFieldOverlay(doc, oldKey, fabric);
    doc.forestSettings = settings;
    const newKey = documentFabricFingerprint(doc);
    expect(newKey).not.toBe(oldKey);
    expect(ruralFieldOverlay(doc, newKey)).toBeUndefined();
    expect(enforceForestLandCover(doc, fabric).farms).toHaveLength(0);
    expect(enforceForestLandCover(doc, fabric).lanes).toHaveLength(0);
    // Even an overlay stamped with the current key cannot bring fields back.
    storeRuralFieldOverlay(doc, newKey, fabric);
    expect(buildBlockFabric(doc).farms).toHaveLength(0);
  });
});

describe("forest persistence and editing", () => {
  it("round-trips native v6 and share v4 and rejects invalid or downgraded forest data", () => {
    const doc = withForestSettings(city(), settings, { f4: "open" });
    const restored = parseDocument(serializeDocument(doc))!;
    expect(restored?.forestSettings).toEqual(settings);
    expect(restored?.mesh.faces.f4.properties.landCoverOverride).toBe("open");
    expect(parseDocument(JSON.stringify({ ...doc, version: 5 }))).toBeNull();
    for (const invalid of [
      null,
      { ...settings, version: 2 },
      { ...settings, density: Infinity },
      { ...settings, mode: "invalid" }
    ])
      expect(parseDocument(JSON.stringify({ ...doc, forestSettings: invalid }))).toBeNull();
    const share = buildShare({
      seed: "forest",
      grid: "hex",
      size: "tiny",
      input: doc,
      settings: { ...defaultGenerationSettings(), buildingHeightPolicy: undefined, forestSettings: settings }
    });
    expect(share.version).toBe(4);
    expect(decodeShare(encodeShare(share))?.input?.forestSettings).toEqual(settings);
    expect(decodeShare(encodeShare({ ...share, version: 3 }))).toBeNull();
    const invalidFace = structuredClone(doc);
    Object.assign(invalidFace.mesh.faces.f0.properties, { landCoverOverride: "invalid" });
    expect(parseDocument(JSON.stringify(invalidFace))).toBeNull();
  });

  it("undoes and redoes one edit, invalidates snapshots, and inherits overrides through split and merge", () => {
    const doc = city();
    const history = new DocumentHistory(doc);
    const next = withForestSettings(doc, settings, { f0: "forest", f1: "open" });
    history.commit(next, "Forest");
    const undone = history.undo(next)!;
    expect(undone.forestSettings).toBeUndefined();
    expect(history.redo(undone)?.forestSettings).toEqual(settings);
    const vertices = faceVertices(next.mesh, next.mesh.faces.f0);
    const split = splitFace(next, "f0", vertices[0], vertices[2])!;
    expect(Object.values(split.mesh.faces).filter(face => face.properties.landCoverOverride === "forest")).toHaveLength(
      2
    );
    expect(mergeFaces(next, "f0", "f1")?.mesh.faces.f0.properties.landCoverOverride).toBe("open");
  });

  it("carries settings through actual generation, its recipe, save/load and replay", () => {
    const seed = "forest-f1-generation";
    const input = createGridDocument({ size: "tiny", grid: "evolution", seed });
    const generation = defaultGenerationSettings();
    generation.config.rivers = [];
    generation.forestSettings = settings;
    const generated = generateCityOnDocument(input, generation, seed)!;
    expect(generated).not.toBeNull();
    expect(generated.forestSettings).toEqual(settings);
    expect(generated.fabric?.generation?.settings.forestSettings).toEqual(settings);
    expect(buildBlockFabric(generated).farms).toHaveLength(0);
    expect(parseDocument(serializeDocument(generated))?.forestSettings).toEqual(settings);
    const recipe = generated.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
    expect(replay.forestSettings).toEqual(settings);
    expect([...forestLandCover(replay)]).toEqual([...forestLandCover(generated)]);
    const originalRecipe = JSON.stringify(recipe);
    const changed = withForestSettings(generated, { ...settings, mode: "surroundings" });
    expect(changed.ruralFieldSnapshot).toBeUndefined();
    expect(changed.fabric?.generation?.input.forestSettings?.mode).toBe("surroundings");
    expect(JSON.stringify(recipe)).toBe(originalRecipe);
    expect(parseDocument(serializeDocument(changed))).not.toBeNull();
  });

  it("preserves forest schemas through ward previews, region attachment and standalone fort generation", () => {
    const input = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 20, seed: "fort-grid" });
    const generation = { ...defaultGenerationSettings(), forestSettings: settings };
    const preview = generateWardStep(input, generation, "forest-preview", 0).document!;
    expect(preview).not.toBeNull();
    expect(preview.version).toBe(6);
    const fort = generateCityOnDocument(input, { ...generation, mode: "fort" }, "fort")!;
    expect(fort.version).toBe(6);
    expect(parseDocument(serializeDocument(fort))?.forestSettings).toEqual(settings);
    attachSceneRegions(fort, {
      version: 1,
      sourceRevision: "forest-test",
      roads: [],
      settlements: [],
      coverageBounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }
    });
    expect(fort.version).toBe(6);
    expect(parseDocument(serializeDocument(fort))?.sceneRegions).toEqual(fort.sceneRegions);
  });

  it("round-trips a forested bastioned town and retains the schema when its defenses are removed", () => {
    const input = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "fortress-inland",
      extentMeters: 900,
      cityRadiusMeters: 100
    });
    const generation = defaultGenerationSettings();
    generation.config.rivers = [];
    generation.config.features.walls = true;
    generation.config.features.citadel = false;
    const town = generateCityOnDocument(
      input,
      {
        ...generation,
        forestSettings: settings,
        generationMethod: "skeleton-first",
        wallShape: "bastioned",
        walledAreaShare: 1,
        historicalPeriod: "ageOfExploration",
        townFortification: { kind: "bastioned", outworks: "ravelins", ditch: "dry", streetPlan: "radial" }
      },
      "fortress-inland"
    )!;
    expect(town).not.toBeNull();
    expect(town.version).toBe(6);
    expect(parseDocument(serializeDocument(town))?.bastionedTown).toEqual(town.bastionedTown);
    const removed = removeBastionedTown(town);
    expect(removed.version).toBe(6);
    expect(parseDocument(serializeDocument(removed))?.forestSettings).toEqual(settings);
  });
});

it.each(["marine", "tundra", "glacier", "lavaField"])(
  "keeps %s forest requests reversible without consuming farms",
  key => {
    const doc = withForestSettings(city(), settings);
    const fabric = buildBlockFabric(city());
    const before = JSON.stringify(doc.mesh);
    expect(cachedForestPlan(doc, fabric).areaM2).toBeGreaterThan(0);
    doc.biome = { id: 1, key, name: key, color: "grey" };
    doc.mesh.faces.f0.properties.landCoverOverride = "forest";
    expect(forestLandCover(doc).size).toBe(0);
    expect(enforceForestLandCover(doc, fabric)).toBe(fabric);
    expect(cachedForestPlan(doc, fabric)).toMatchObject({ areaM2: 0, regions: [], forestFaceIds: [] });
    delete doc.biome;
    delete doc.mesh.faces.f0.properties.landCoverOverride;
    expect(cachedForestPlan(doc, fabric).areaM2).toBeGreaterThan(0);
    expect(JSON.stringify(doc.mesh)).toBe(before);
  }
);
