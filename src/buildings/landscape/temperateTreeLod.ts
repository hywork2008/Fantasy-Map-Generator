import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, type CanopyPalette, createCanopyLobes } from "./canopyLobes";
import { limbGeometry } from "./treeSeasonLayers";

/** Mean foliage color of the high tiers, shared by the reduced tiers so tier switches do not flash. */
export const TEMPERATE_CANOPY: Record<"lime" | "yew", CanopyPalette> = {
  lime: { hue: 0.258, saturation: 0.42, lightness: 0.235 },
  yew: { hue: 0.32, saturation: 0.4, lightness: 0.25 }
};

/** Opaque, lobed silhouettes retain the spreading lime and broad evergreen yew at distant city scales. */
/** `bare` adds the limbs a leafless distant lime shows; the registry drops its lobes (seasonalLooks.ts). */
export function createTemperateTreeLod(species: "lime" | "yew", bare = false): CityStructureMeshes {
  const lime = species === "lime";
  const wood: THREE.BufferGeometry[] = [];
  const top = lime ? 11.2 : 7.8;
  const trunk = new THREE.CylinderGeometry(lime ? 0.16 : 0.28, lime ? 0.46 : 0.7, top * 0.7, 5);
  trunk.translate(0, top * 0.35, 0);
  wood.push(trunk);
  const root = new THREE.ConeGeometry(lime ? 0.85 : 1.05, 0.7, 5);
  wood.push(root);
  if (bare && lime) {
    const limbs: [THREE.Vector3, THREE.Vector3, number][] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const out = (r: number, y: number) => new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
      const fork = out(2.2, 6.6);
      limbs.push(
        [new THREE.Vector3(0, 3.3 + i * 0.45, 0), fork, 0.2],
        [fork, out(4.6, 8.4), 0.1],
        [fork, out(3.2, 9.8), 0.08]
      );
    }
    for (const angle of [0.6, Math.PI + 0.6])
      limbs.push([
        new THREE.Vector3(0, 7.6, 0),
        new THREE.Vector3(Math.cos(angle) * 1.5, 11, Math.sin(angle) * 1.5),
        0.1
      ]);
    wood.push(...limbGeometry(limbs));
  }
  const count = 7;
  const lobes: CanopyLobe[] = [];
  for (let i = 0; i < count; i++) {
    // Five spreading lower lobes and two leaders match the broad high-tier crown.
    // A rising spiral made the distant trees read as narrow, vertically stacked clumps.
    const lower = i < 5;
    const angle = lower ? (i * Math.PI * 2) / 5 : (i - 5) * Math.PI + 0.6;
    const reach = lower ? (lime ? 2.5 : 3) : 1;
    const radius = lower ? (lime ? 2.5 : 2.2) : 2.4;
    lobes.push({
      center: new THREE.Vector3(
        Math.cos(angle) * reach,
        lower ? (lime ? 7 : 4.9) : lime ? 9.3 : 6.2,
        Math.sin(angle) * reach
      ),
      radius: new THREE.Vector3(radius, lower ? (lime ? 2.8 : 1.6) : lime ? 2 : 1.4, radius)
    });
  }
  for (const part of wood) part.deleteAttribute("uv");
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  bark.computeVertexNormals();
  const foliage = createCanopyLobes(lobes, TEMPERATE_CANOPY[species], lime ? 6143 : 61017);
  const barkMaterial = new THREE.MeshLambertMaterial({ color: lime ? 0x635747 : 0x725044 });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const stem = new THREE.Mesh(bark, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  stem.name = `${species}-structural-wood`;
  crown.name = `${species}-lobed-canopy`;
  const group = new THREE.Group();
  group.name = lime ? "small-leaved-lime" : "european-yew";
  group.userData.treeQuality = "low";
  group.add(stem, crown);
  return {
    group,
    pickables: [stem, crown],
    dispose() {
      bark.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
