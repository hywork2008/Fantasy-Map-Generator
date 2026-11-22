import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { pointInPolygon } from "../../generators/geom";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { cellHouseRing, fabricHouseId } from "../../generators/vector/fabric/pack";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorWallChoice } from "../../generators/vector/generation/wallShape";
import type { Point } from "../../types/primitives";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

/** A roadside village of 300 people (docs/plan/ce-meshless-roadside-burgage-village.md V4). */
function village(facilities = false) {
  const seed = "village-3d",
    settings = {
      ...defaultGenerationSettings(),
      plotFabric: "burgage-village" as const,
      ...(facilities ? { facilityLayout: "population" as const } : {})
    };
  settings.config = { ...settings.config, rivers: [], features: { ...settings.config.features, port: false } };
  settings.population = defaultPopulationSettings(300);
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
    mode: facilities ? "medieval-facilities" : "medieval",
    population: 300,
    plotFabric: "burgage-village"
  });
}

describe("roadside village in 3D (plan V4)", () => {
  it("draws every village building with its Opus model on its footprint, barns for the outbuildings", () => {
    const doc = village(),
      data = vectorRenderData(doc, "housing"),
      houses = data.surfaces.flatMap(s =>
        (s.houses?.village ?? []).map((house, i) => ({ id: s.houses!.ids[i], ...house }))
      ),
      cells = Object.values(doc.fabric!.cells),
      expected = cells.reduce((n, c) => n + c.houses.offsets.length, 0);
    expect(houses).toHaveLength(expected);
    expect(data.surfaces.some(s => s.houses?.massing?.length)).toBe(false);
    const kinds = new Set(houses.map(h => h.spec.kind));
    expect([...kinds].sort()).toEqual(["barn", "cottage", "longhouse"]);
    // Each model stands on its own footprint, its centre inside it.
    for (const cell of cells)
      cell.houses.dwellings.forEach((dwellings, i) => {
        const house = houses.find(h => h.id === fabricHouseId(cell.id, i))!;
        expect(house.spec.kind === "barn").toBe(dwellings === 0);
        expect(pointInPolygon(house.center as Point, cellHouseRing(cell, i))).toBe(true);
      });
    const scene = createVectorScene(data, { quality: "low" });
    try {
      let instances = 0;
      const ids = new Set<string>();
      scene.group.traverse(o => {
        if (o.userData.representation !== "village-houses") return;
        const mesh = o as THREE.InstancedMesh;
        instances += mesh.count;
        for (let i = 0; i < mesh.count; i++) {
          const id = scene.pickHouse({ object: mesh, instanceId: i } as unknown as THREE.Intersection);
          if (id) ids.add(id);
        }
      });
      // Several meshes per model (walls, roof), one instance each per house.
      expect(instances).toBeGreaterThanOrEqual(expected);
      expect(ids.size).toBe(expected);
    } finally {
      scene.dispose();
    }
  });

  // Plan V7: a village's workshops are single-storey village buildings too, not the town's street houses.
  it("draws a village's workshops with the village models", () => {
    const doc = village(true),
      data = vectorRenderData(doc, "housing"),
      street = Object.values(doc.placements).filter(p =>
        /^trade-workhome\.|^trade-workshop\.rear-works/.test(p.modelId)
      );
    expect(street.length).toBeGreaterThan(0);
    const scene = createVectorScene(data, { quality: "low" });
    try {
      const drawn = new Set<string>();
      let workshops = 0;
      scene.group.traverse(o => {
        if (o.userData.representation === "village-houses" && o.userData.buildingKind === "facility")
          workshops += (o as THREE.InstancedMesh).count;
        if (o.userData.representation === "bv-instances") drawn.add(String(o.userData.modelId));
      });
      expect(workshops).toBeGreaterThanOrEqual(street.length);
      for (const p of street) expect(drawn.has(p.modelId)).toBe(false);
    } finally {
      scene.dispose();
    }
  });
});
