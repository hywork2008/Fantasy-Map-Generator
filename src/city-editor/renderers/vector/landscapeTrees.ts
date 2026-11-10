import * as THREE from "three";
import { adoptedTree } from "../../../city3d/adoption";
import { createBvInstances, createBvPrototypeCache } from "../../../city3d/three/bvInstances";
import { type TreeSeason, treeLookOptions } from "../../../city3d/treeSeason";
import type { Point } from "../../types/primitives";
import type { VectorLandscapeTree } from "../../types/vector/landscape";

/** Species BV geometry shares the persisted canopy radius, height, heading and ground datum. */
export function createVectorLandscapeTrees(
  trees: (VectorLandscapeTree & { elevationMeters: number })[],
  origin: Point,
  datum: number,
  season?: TreeSeason
) {
  const definitions = new Map<
    VectorLandscapeTree["species"],
    {
      definition: {
        id: string;
        cacheKey: string;
        variant: string;
        create: () => ReturnType<ReturnType<typeof adoptedTree>["create"]>;
      };
      radius: number;
      height: number;
    }
  >();
  const models: ReturnType<ReturnType<typeof adoptedTree>["create"]>[] = [];
  try {
    for (const species of new Set(trees.map(t => t.species))) {
      const variant = adoptedTree(species, "low"),
        look = treeLookOptions(season?.look(species)),
        model = variant.create(look.options);
      models.push(model);
      model.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.group),
        v = new THREE.Vector3();
      let radius = 0;
      model.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          v.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          radius = Math.max(radius, Math.hypot(v.x, v.z));
        }
      });
      if (radius <= 0 || bounds.max.y <= 0) throw Error("landscape-tree-model");
      definitions.set(species, {
        definition: {
          id: `landscape-tree:${species}`,
          cacheKey: `${variant.id}${look.suffix}`,
          variant: variant.id,
          create: () => variant.create(look.options)
        },
        radius,
        height: bounds.max.y
      });
    }
    const sites = trees.map(tree => {
      const model = definitions.get(tree.species)!;
      return {
        id: tree.id,
        ownerId: tree.ownerId,
        species: tree.species,
        definition: model.definition,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(tree.point[0] - origin[0], tree.elevationMeters - datum, -tree.point[1] + origin[1]),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.angleRadians),
          new THREE.Vector3(
            tree.radiusMeters / model.radius,
            tree.heightMeters / model.height,
            tree.radiusMeters / model.radius
          )
        )
      };
    });
    const result = createBvInstances(sites, createBvPrototypeCache());
    result.group.name = "vector-landscape-trees";
    result.group.userData = {
      id: "landscape:trees",
      kind: "feature",
      featureKind: "landscape",
      representation: "bv-landscape"
    };
    for (const mesh of result.pickables)
      mesh.userData.landscapeTrees = result.accepted
        .filter(s => s.definition.id === mesh.name.replace(/-instances$/, ""))
        .map(s => ({ id: s.id, species: s.species }));
    return result;
  } finally {
    for (const model of models) model.dispose();
  }
}
