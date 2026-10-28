import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { TreeQuality } from "./treeQuality";

it("propagates a newly tiered species' factories and policy through BV, woodland and park rendering", async () => {
  vi.resetModules();
  const trees = await import("./trees");
  const original = trees.TREE_DEFINITIONS.rowan;
  const { TREE_QUALITIES } = await import("./treeQuality");
  const factories = Object.fromEntries(
    TREE_QUALITIES.map(quality => [
      quality,
      vi.fn(() => {
        const geometry = new THREE.BoxGeometry(2, 10, 2);
        geometry.translate(0, 5, 0);
        const material = new THREE.MeshLambertMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        const group = new THREE.Group();
        group.add(mesh);
        return {
          group,
          pickables: [mesh],
          dispose() {
            geometry.dispose();
            material.dispose();
          }
        };
      })
    ])
  ) as Record<TreeQuality, ReturnType<typeof vi.fn>>;
  trees.TREE_DEFINITIONS.rowan = {
    lod: {
      selection: "pixels",
      budget: "quality-first",
      heightMeters: 10,
      models: factories
    }
  };
  let forest: { dispose(): void } | undefined;
  let park: { dispose(): void } | undefined;
  try {
    const { TREE_VARIANTS, treeFamily } = await import("./treeVariants");
    const variants = TREE_VARIANTS.filter(variant => variant.family === treeFamily("rowan"));
    expect(variants.map(variant => variant.level)).toEqual(TREE_QUALITIES);
    for (const quality of TREE_QUALITIES) {
      const model = variants.find(variant => variant.level === quality)!.create();
      expect(factories[quality]).toHaveBeenCalledOnce();
      expect(model.pickables[0].geometry.getAttribute("position").count).toBe(24);
      model.dispose();
    }
    const { createTownForest } = await import("../../city3d/three/forestMeshes");
    const { createTownOpenSpaces } = await import("../../city3d/three/openSpaceMeshes");
    const landscape = await import("../../city-editor/renderers/landscapeTreeSpecies");
    vi.spyOn(landscape, "landscapeTreeSpecies").mockReturnValue("rowan");
    const { createDocument } = await import("../../city-editor/generators/document");
    const { forestRegions } = await import("../../city-editor/generators/forestGeometry");
    const document = createDocument("registered-forest", 200);
    document.biome = { id: 1, key: "newWoodland", name: "New woodland", color: "green" };
    const regions = forestRegions([
      {
        faceId: "f0",
        polygon: [
          [-64, -64],
          [64, -64],
          [64, 64],
          [-64, 64]
        ]
      }
    ]);
    const woodland = createTownForest(
      document,
      {
        regions,
        areaM2: regions[0].areaM2,
        forestFaceIds: ["f0"],
        protectedFarmCount: 0,
        protectedFarmAreaM2: 0
      },
      undefined,
      "light"
    );
    forest = woodland;
    const c = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    c.position.set(0, 2000, 1);
    c.lookAt(0, 0, 0);
    woodland.update(c, 720);
    expect(woodland.stats.detailedTrees).toBeGreaterThan(16);
    expect(woodland.stats.detailedTiers.low).toBe(woodland.stats.trees);
    const parkland = createTownOpenSpaces({ surfaces: [], sites: [{ model: "rowan", point: [0, 0], angle: 0 }] });
    park = parkland;
    parkland.update(c, 720);
    const mesh = parkland.group.getObjectByName("forest-bv-rowan-low-shadow") as THREE.InstancedMesh;
    expect(mesh.count).toBe(1);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[5]).toBe(1);
  } finally {
    forest?.dispose();
    park?.dispose();
    trees.TREE_DEFINITIONS.rowan = original;
    vi.restoreAllMocks();
    vi.resetModules();
  }
});
