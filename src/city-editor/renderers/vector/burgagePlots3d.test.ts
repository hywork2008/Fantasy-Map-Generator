import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import { regionalHouseSite } from "../../../city3d/three/regionalHouseMeshes";
import type { BuildingLot } from "../../generators/buildingLots.types";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { pointInPolygon } from "../../generators/geom";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { fabricCellHash } from "../../generators/vector/fabric/hash";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorUrbanFingerprint } from "../../generators/vector/generation/urbanState";
import { vectorWallChoice } from "../../generators/vector/generation/wallShape";
import { regionArea, regionBoolean } from "../../generators/vector/geometry/regions";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import { fabricDoorFrontage } from "./fabricDoors";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

/** A walled burgage town of 2,000 people with its facilities, in a housing culture. */
function town(culture: BuildingAppearanceProfile): VectorCityDocument {
  const seed = "burgage-b4",
    settings = {
      ...defaultGenerationSettings(),
      wallShape: "polygon" as const,
      plotFabric: "burgage" as const,
      facilityLayout: "population" as const,
      buildingAppearanceProfile: culture
    };
  settings.config = {
    ...settings.config,
    rivers: [],
    features: { ...settings.config.features, walls: true, port: false, shanty: false }
  };
  settings.population = defaultPopulationSettings(2000);
  const input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 800, cityRadiusMeters: 200, blockSizeMeters: 50 },
      lotOccupancy: 1
    }),
    wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
    skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
  return generateVectorUrban(skeleton, {
    ...DEFAULT_VECTOR_URBAN,
    mode: "medieval-facilities",
    population: 2000,
    plotFabric: "burgage"
  });
}

/** Burgage meshes of the 3D scene by piece role. */
function burgageMeshes(doc: VectorCityDocument) {
  const data = vectorRenderData(doc, "housing"),
    scene = createVectorScene(data),
    roles: Record<string, number> = {};
  try {
    scene.group.traverse((o: THREE.Object3D) => {
      if (o.userData?.featureKind === "burgage") roles[o.userData.pieceRole] = (roles[o.userData.pieceRole] ?? 0) + 1;
    });
  } finally {
    scene.dispose();
  }
  return { data, roles };
}

describe("burgage plots drawn in 2D and 3D (docs/plan/ce-burgage-plot-fabric.md B4, B5)", () => {
  it("draws each street block's yards and plot walls as one ground and one wall, under its houses", () => {
    const doc = town("atlantic"),
      { data, roles } = burgageMeshes(doc),
      cells = Object.values(doc.fabric!.cells).filter(c => c.plots?.offsets.length && c.houses.offsets.length);
    expect(cells.length).toBeGreaterThan(5);
    // A street block no house was built in (a park, outskirts the town did not need) has no yards, walls or trees.
    const empty = Object.values(doc.fabric!.cells).filter(c => c.plots?.offsets.length && !c.houses.offsets.length);
    for (const cell of empty) {
      expect(data.surfaces.filter(s => s.id.startsWith(`${cell.id}~`) && s.featureKind === "burgage")).toEqual([]);
      expect((data.landscapeTrees ?? []).filter(t => t.id.startsWith(`${cell.id}~`))).toEqual([]);
    }
    // No plot wall runs into a facility's site (its model brings its own enclosure).
    const walls = data.surfaces.filter(s => s.pieceRole === "plot-wall").flatMap(s => s.polygons),
      facilities = Object.values(doc.placements).filter(p => p.building?.kind === "facility");
    expect(facilities.length).toBeGreaterThan(20);
    for (const f of facilities)
      expect(regionBoolean(walls, [f.site], "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(0.05);
    expect(data.warnings.filter(w => w.startsWith("burgage-"))).toEqual([]);
    for (const cell of cells) {
      const own = data.surfaces.filter(s => s.id.startsWith(`${cell.id}~`) && s.featureKind === "burgage");
      expect(
        own
          .map(s => s.pieceRole)
          .filter(r => r !== "landscape-tree")
          .sort()
      ).toEqual(["plot-wall", "yard"]);
      // The yards and walls come before the block's houses, so 2D draws the houses over them.
      const houses = data.surfaces.findIndex(s => s.id === cell.id && s.houses);
      if (houses >= 0) for (const s of own) expect(data.surfaces.indexOf(s)).toBeLessThan(houses);
    }
    // A few meshes per street block, never one per plot or per wall.
    const plots = cells.reduce((n, c) => n + c.plots!.offsets.length, 0);
    expect((roles.yard ?? 0) + (roles["plot-wall"] ?? 0)).toBeLessThan(plots / 2);
    expect(roles["plot-wall"]).toBeGreaterThan(0);
    // Fruit trees stand in the yards (B5), each inside a plot and clear of every house.
    const trees = (data.landscapeTrees ?? []).filter(t => t.id.includes("~tree"));
    expect(trees.length).toBeGreaterThan(20);
    const houses = data.surfaces.filter(s => s.houses).flatMap(s => s.polygons.map(p => p.outer));
    for (const tree of trees) expect(houses.some(h => pointInPolygon(tree.point, h))).toBe(false);
  });

  it("opens no house's door onto a plot wall, even from entrances saved before they followed the plots", () => {
    const doc = town("atlantic");
    // A city saved before v64: every entrance pointing away from its plot's front.
    for (const cell of Object.values(doc.fabric!.cells)) {
      cell.houses.entrances = cell.houses.entrances.map(v => -v);
      cell.hash = fabricCellHash(cell);
    }
    doc.urban!.adoptedFingerprint = vectorUrbanFingerprint(doc);
    const data = vectorRenderData(doc, "housing"),
      walls = data.surfaces.filter(s => s.pieceRole === "plot-wall").flatMap(s => s.polygons.map(p => p.outer));
    let houses = 0,
      blocked = 0;
    for (const s of data.surfaces) {
      const h = s.houses;
      if (!h?.massing || !s.id.includes(":cell:")) continue;
      s.polygons.forEach((polygon, i) => {
        const lot = {
            faceId: s.id,
            landmark: false,
            polygon: polygon.outer,
            massing: h.massing![i],
            appearance: h.appearance?.[i]
          } as BuildingLot,
          site = regionalHouseSite(
            lot,
            i,
            0,
            "standard",
            fabricDoorFrontage(() => h.doors?.[i])
          );
        if (!site) return;
        houses++;
        const { door, normal } = site.frontage,
          ahead = [0.05, 0.2, 0.4, 0.7, 1].map((d): Point => [door[0] + normal[0] * d, door[1] + normal[1] * d]);
        if (ahead.some(p => walls.some(w => pointInPolygon(p, w)))) blocked++;
      });
    }
    expect(houses).toBeGreaterThan(100);
    expect(blocked).toBe(0);
  });

  it("draws a binaire block's venelles and gives its house plots no yard", () => {
    const doc = town("mediterranean"),
      { data, roles } = burgageMeshes(doc);
    expect(data.surfaces.some(s => s.pieceRole === "venelle")).toBe(true);
    expect(data.surfaces.some(s => s.pieceRole === "yard")).toBe(false);
    expect(roles.venelle).toBeGreaterThan(0);
  });
});
