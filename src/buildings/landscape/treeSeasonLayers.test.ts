import { createHash } from "node:crypto";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { TREE_PHENOLOGY } from "./treePhenology";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, TREE_SPECIES, treeLodProfile } from "./trees";

const BUDGET = { low: 500, medium: 3000, high: 25000, ultra: 120000 } as const;

function digest(model: CityStructureMeshes): string {
  const hash = createHash("sha256");
  for (const mesh of model.pickables) {
    hash.update(mesh.name);
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const bytes = (array: THREE.TypedArray) =>
      new Uint8Array(array.buffer as ArrayBuffer, array.byteOffset, array.byteLength);
    for (const key of Object.keys(geometry.attributes).sort()) {
      hash.update(key);
      hash.update(bytes(geometry.attributes[key].array));
    }
    if (geometry.index) hash.update(bytes(geometry.index.array));
  }
  return hash.digest("hex").slice(0, 16);
}

function triangles(model: CityStructureMeshes): number {
  return model.pickables.reduce((sum, mesh) => {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    return sum + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  }, 0);
}

describe("seasonal tree layers", () => {
  it("keeps the static default model byte-identical when no appearance is given", () => {
    // Recorded from the models before seasonal layers were added (bv-tree-seasonal-appearance.md §6.4).
    const before = {
      domestic_apple: ["02afe6dcbe58a0f8", "0ed64b479e29f247", "bc982bc8c4139c79", "82f08b98ce1f2b3b"],
      european_beech: ["3cb9a24186ca33f5", "ad5c3bd895048673", "6343d6c7d0dbc34e", "6e2b97fde0458375"]
    };
    for (const [species, hashes] of Object.entries(before))
      TREE_QUALITIES.forEach((quality, i) => {
        const model = createLandscapeTree(species as keyof typeof before, quality);
        expect(digest(model), `${species} ${quality}`).toBe(hashes[i]);
        model.dispose();
      });
  });

  it("draws every supported appearance of seasonal species within the tier budgets", () => {
    for (const species of TREE_SPECIES.filter(entry => treeLodProfile(entry)?.seasonal)) {
      for (const appearance of TREE_PHENOLOGY[species].appearances)
        for (const quality of TREE_QUALITIES) {
          const model = createLandscapeTree(species, quality, { appearance });
          const names = model.pickables.map(mesh => mesh.name).join(" ");
          expect(triangles(model), `${species} ${appearance} ${quality}`).toBeLessThanOrEqual(BUDGET[quality]);
          expect(model.group.userData.treeAppearance).toBe(appearance);
          // Bare trees are wood only; every other look keeps its foliage mesh.
          expect(model.pickables.length === 1).toBe(appearance === "bare");
          if (appearance === "bloom" && quality !== "low") expect(names).toContain("blossom");
          model.dispose();
        }
    }
  });

  it("recolours autumn foliage without moving a vertex", () => {
    const summer = createLandscapeTree("european_beech", "high");
    const autumn = createLandscapeTree("european_beech", "high", { appearance: "autumn" });
    const [summerCrown, autumnCrown] = [summer.pickables[1].geometry, autumn.pickables[1].geometry];
    expect(autumnCrown.attributes.position.array).toEqual(summerCrown.attributes.position.array);
    expect(autumnCrown.attributes.color.array).not.toEqual(summerCrown.attributes.color.array);
    expect(autumn.pickables[0].geometry.attributes.position.array).toEqual(
      summer.pickables[0].geometry.attributes.position.array
    );
    summer.dispose();
    autumn.dispose();
  });
});
