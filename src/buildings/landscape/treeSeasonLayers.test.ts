import { createHash } from "node:crypto";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { TREE_PHENOLOGY, type TreeAppearance } from "./treePhenology";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, FRUIT_LAYER_EDITIONS, TREE_SPECIES, type TreeSpecies, treeLodProfile } from "./trees";

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
    for (const species of TREE_SPECIES) {
      const drawn = treeLodProfile(species)?.seasonal ?? [];
      for (const appearance of drawn) expect(TREE_PHENOLOGY[species].appearances).toContain(appearance);
      for (const appearance of drawn)
        for (const quality of TREE_QUALITIES) {
          const model = createLandscapeTree(species, quality, { appearance });
          const names = model.pickables.map(mesh => mesh.name).join(" ");
          // A static model already over its budget (willow high) may not grow further.
          const base = createLandscapeTree(species, quality);
          const limit = Math.max(BUDGET[quality], triangles(base));
          base.dispose();
          expect(triangles(model), `${species} ${appearance} ${quality}`).toBeLessThanOrEqual(limit);
          expect(model.group.userData.treeAppearance).toBe(appearance);
          // Bare trees are wood only, but for the cones alders keep; every other look keeps its foliage.
          const cones = species === "black_alder" && (quality === "high" || quality === "ultra");
          expect(model.pickables.length === 1).toBe(appearance === "bare" && !cones);
          // Flowers open where fruit will hang; tamarisk's flower spikes are part of its plumes.
          if (appearance === "bloom" && species !== "tamarisk" && (quality === "high" || quality === "ultra")) {
            expect(names).toContain("blossom");
            const parts = model.pickables.slice(1).map(mesh => mesh.name);
            expect(parts.join(" ")).not.toMatch(/fruit|cherries|pods|burs|drupes/);
          }
          model.dispose();
        }
    }
  });

  it("draws the fruit-layer editions' seasons with fruit bodies in place of crown markers", () => {
    for (const [species, { models }] of Object.entries(FRUIT_LAYER_EDITIONS) as [
      keyof typeof FRUIT_LAYER_EDITIONS,
      (typeof FRUIT_LAYER_EDITIONS)[keyof typeof FRUIT_LAYER_EDITIONS]
    ][])
      for (const appearance of treeLodProfile(species)!.seasonal!)
        for (const quality of TREE_QUALITIES) {
          const model = models[quality]({ appearance });
          const names = model.pickables.map(mesh => mesh.name);
          expect(triangles(model), `${species} ${appearance} ${quality}`).toBeLessThanOrEqual(BUDGET[quality]);
          expect(model.group.userData.treeAppearance).toBe(appearance);
          const fruiting = appearance === "unripe" || appearance === "fruit";
          if (quality !== "low") {
            expect(
              names.some(name => /drupes|dates/.test(name)),
              `${species} ${appearance} ${quality}`
            ).toBe(fruiting);
            expect(names.some(name => name.includes("cut-bunch-stalks"))).toBe(appearance === "harvested");
          }
          model.dispose();
        }
    // The olive's crown no longer carries the dark and green triangle markers.
    const markers = createLandscapeTree("olive", "ultra");
    const drupes = FRUIT_LAYER_EDITIONS.olive.models.ultra();
    expect(triangles({ ...drupes, pickables: [drupes.pickables[1]] })).toBeLessThan(
      triangles({ ...markers, pickables: [markers.pickables[1]] })
    );
    markers.dispose();
    drupes.dispose();
  });

  it("opens the chestnut burs on their nuts when ripe", () => {
    for (const quality of ["medium", "high", "ultra"] as const) {
      const model = createLandscapeTree("sweet_chestnut", quality, { appearance: "fruit" });
      expect(model.pickables.map(mesh => mesh.name)).toContain("sweet-chestnut-split-burs-and-nuts");
      model.dispose();
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

  it("drops or recolours fruit and flowers drawn inside existing meshes", () => {
    const count = (species: TreeSpecies, appearance?: TreeAppearance) => {
      const model = createLandscapeTree(species, "ultra", appearance && { appearance });
      const counts = model.pickables.map(mesh => {
        const geometry = mesh.geometry as THREE.BufferGeometry;
        return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      });
      model.dispose();
      return counts;
    };
    // A harvested pear keeps its leaves and loses the fruit with its stalks, which a drawn season
    // carries in the fruit layer; a harvested lemon keeps a few late fruit.
    const [wood, leaves] = count("european_pear");
    const [harvestedWood, harvestedLeaves, ...harvestedFruit] = count("european_pear", "harvested");
    expect(harvestedLeaves).toBe(leaves);
    expect(harvestedFruit).toEqual([]);
    expect(harvestedWood).toBeLessThan(wood);
    expect(harvestedWood).toBe(count("european_pear", "fruit")[0]);
    const lemon = count("lemon")[2];
    const left = count("lemon", "harvested")[2];
    expect(left).toBeGreaterThan(lemon * 0.05);
    expect(left).toBeLessThan(lemon * 0.3);
    // Olive markers and tamarisk flowers share the foliage mesh and leave it for leaf.
    expect(count("olive", "leaf")[1]).toBeLessThan(count("olive")[1]);
    expect(count("tamarisk", "leaf")[1]).toBeLessThan(count("tamarisk")[1]);
    expect(count("rowan", "autumn")).toEqual(count("rowan"));
  });
});
