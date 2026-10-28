import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

/** Opaque, lobed silhouettes retain the spreading lime and broad evergreen yew at city distances. */
export function createTemperateTreeLod(species: "lime" | "yew", quality: "low" | "medium"): CityStructureMeshes {
  const lime = species === "lime";
  const medium = quality === "medium";
  const wood: THREE.BufferGeometry[] = [];
  const crowns: THREE.BufferGeometry[] = [];
  const top = lime ? 11.2 : 7.8;
  const trunk = new THREE.CylinderGeometry(lime ? 0.16 : 0.28, lime ? 0.46 : 0.7, top * 0.7, medium ? 8 : 5);
  trunk.translate(0, top * 0.35, 0);
  wood.push(trunk);
  const root = new THREE.ConeGeometry(lime ? 0.85 : 1.05, 0.7, medium ? 7 : 5);
  root.translate(0, 0, 0);
  wood.push(root);
  const count = medium ? 24 : 7;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const angle = i * 2.399963;
    const reach = (lime ? 3.1 : 2.9) * Math.sin(0.55 + t * 2.55);
    const center = new THREE.Vector3(
      Math.cos(angle) * reach,
      (lime ? 5.2 : 3.1) + t * (lime ? 4.4 : 3.1),
      Math.sin(angle) * reach
    );
    const crown = new THREE.IcosahedronGeometry(1, medium ? 1 : 0);
    const radius = medium ? (lime ? 1.55 : 1.35) : lime ? 2.25 : 1.9;
    crown.scale(radius, radius * (lime ? 1 : 0.65), radius);
    crown.translate(...center.toArray());
    crown.deleteAttribute("uv");
    const color = new THREE.Color().setHSL(
      lime ? 0.26 : 0.32,
      lime ? 0.43 : 0.42,
      (lime ? 0.3 : 0.22) + Math.sin(i * 7) * 0.035
    );
    const positions = crown.getAttribute("position");
    crown.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        Array.from({ length: positions.count }, () => [color.r, color.g, color.b]).flat(),
        3
      )
    );
    crowns.push(crown);
    if (medium) {
      const start = new THREE.Vector3(0, center.y * 0.65, 0);
      const branch = new THREE.CylinderGeometry(0.025, 0.1, start.distanceTo(center), 5);
      branch.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), center.clone().sub(start).normalize())
      );
      branch.translate(...start.add(center).multiplyScalar(0.5).toArray());
      wood.push(branch);
    }
  }
  for (const part of wood) part.deleteAttribute("uv");
  const bark = mergeGeometries(wood)!;
  const foliage = mergeGeometries(crowns)!;
  for (const part of [...wood, ...crowns]) part.dispose();
  bark.computeVertexNormals();
  foliage.computeVertexNormals();
  const barkMaterial = new THREE.MeshLambertMaterial({ color: lime ? 0x635747 : 0x725044 });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const stem = new THREE.Mesh(bark, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  stem.name = `${species}-structural-wood`;
  crown.name = `${species}-lobed-canopy`;
  const group = new THREE.Group();
  group.name = lime ? "small-leaved-lime" : "european-yew";
  group.userData.treeQuality = quality;
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
