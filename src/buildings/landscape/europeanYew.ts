import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTemperateTreeLod, TEMPERATE_CANOPY } from "./temperateTreeLod";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Mature, untrimmed Taxus baccata, not the later columnar Irish yew cultivar. */
export function createEuropeanYew(quality: TreeQuality = "ultra"): CityStructureMeshes {
  if (quality === "low") return createTemperateTreeLod("yew");
  // Medium follows the same limb skeleton and replaces each fan cluster with one fitted lobe.
  const medium = quality === "medium";
  let seed = 61017;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  function limb(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number) {
    // Twigs are sub-pixel at medium range and the dense crown hides all but the main limbs.
    if (medium && bottom < 0.05) return;
    const geometry = medium
      ? new THREE.CylinderGeometry(top, bottom, a.distanceTo(b), 4, 1, true)
      : new THREE.CylinderGeometry(top, bottom, a.distanceTo(b), bottom < 0.01 ? 4 : 10, bottom < 0.01 ? 1 : 3);
    const p = geometry.getAttribute("position");
    // Longitudinal fluting breaks the smooth cylinder silhouette of old yew bark.
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getZ(i), p.getX(i));
      const relief = 1 + Math.sin(angle * 5 + p.getY(i) * 0.35) * 0.11;
      p.setXYZ(i, p.getX(i) * relief, p.getY(i), p.getZ(i) * relief);
    }
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    wood.push(geometry);
  }
  function foliage(center: THREE.Vector3, radius: number) {
    // A folded, serrated fan represents many two-ranked needle shoots in one surface.
    const points: THREE.Vector3[] = [];
    for (let shoot = 0; shoot < 10; shoot++) {
      const angle = random() * Math.PI * 2;
      const y = random() * 2 - 1;
      const r = Math.cbrt(random()) * radius;
      const horizontal = Math.sqrt(1 - y * y) * r;
      const base = center
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * horizontal, y * r * 0.55, Math.sin(angle) * horizontal));
      const direction = new THREE.Vector3(Math.cos(angle), 0.1 + random() * 0.3, Math.sin(angle)).normalize();
      const sideways = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).applyAxisAngle(
        direction,
        (random() - 0.5) * 1.8
      );
      const length = 0.75 + random() * 0.45;
      const vertices: THREE.Vector3[] = [];
      const segments = medium || quality === "high" ? 4 : 8;
      for (let n = 0; n <= segments; n++) {
        const t = n / segments;
        const spine = base.clone().addScaledVector(direction, t * length);
        const width = Math.sin(Math.PI * t) * (n % 2 ? 0.3 : 0.2);
        vertices.push(
          spine.clone().addScaledVector(up, Math.sin(t * Math.PI) * 0.08),
          spine.clone().addScaledVector(sideways, -width),
          spine.clone().addScaledVector(sideways, width)
        );
      }
      const shade = 0.16 + random() * 0.13;
      // Fit only the fans that high actually renders, rather than filling the omitted ultra sprays.
      if (shoot < 4) points.push(...vertices);
      // Keep branch positions identical by retaining the random sequence for omitted sprays.
      if (medium || (quality === "high" && shoot >= 4)) continue;
      for (let n = 0; n < segments; n++) {
        const a = n * 3,
          b = a + 3;
        for (const index of [a, b + 1, a + 1, a, b, b + 1, a, b + 2, b, a, a + 2, b + 2]) {
          const v = vertices[index];
          positions.push(v.x, v.y, v.z);
          color.setHSL(0.32, 0.42, shade + (index % 3 === 0 ? 0.025 : 0));
          colors.push(color.r, color.g, color.b);
        }
      }
    }
    if (medium) lobes.push(fitCanopyLobe(points, 0.45, true));
  }
  const fork = new THREE.Vector3(0.08, 1.9, -0.04);
  wood.push(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.7 },
        { center: [0.03, 0.6, -0.02], radius: 0.53 },
        { center: [0.08, 1.9, -0.04], radius: 0.4 },
        { center: [-0.18, 5.8, 0.12], radius: 0.1 },
        { center: [-0.18, 6.9, 0.12], radius: 0.02 }
      ],
      1.1,
      9
    )
  );
  // Irregular, overlapping fans occupy the whole crown, including directly above the trunk.
  for (let i = 0; i < 28; i++) {
    const level = i / 27;
    const angle = i * 2.39996 + random() * 0.3;
    const reach = 3.65 * Math.sin(0.8 + level * 2.15);
    const start = fork.clone().lerp(new THREE.Vector3(-0.18, 5.8, 0.12), level);
    const elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.5, 2.4 + level * 3.9, Math.sin(angle) * reach * 0.5);
    const end = new THREE.Vector3(Math.cos(angle) * reach, 2.7 + level * 3.9, Math.sin(angle) * reach);
    limb(start, elbow, 0.22 * (1 - level * 0.65), 0.075);
    limb(elbow, end, 0.075, 0.014);
    for (let j = 0; j < 2; j++) {
      const theta = angle + (j === 0 ? -0.6 : 0.55);
      const tip = end.clone().add(new THREE.Vector3(Math.cos(theta) * 0.45, random() * 0.4, Math.sin(theta) * 0.45));
      limb(elbow, tip, 0.035, 0.006);
      foliage(tip, 0.85 + random() * 0.25);
    }
    if (i % 3 === 0) foliage(elbow, 0.85);
  }
  const leader = new THREE.Vector3(-0.18, 6.9, 0.12);
  foliage(leader, 0.95);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996;
    const tip = new THREE.Vector3(Math.cos(angle) * 0.8, 6.5 + random() * 0.35, Math.sin(angle) * 0.8);
    limb(new THREE.Vector3(-0.1, 5.6, 0.1), tip, 0.04, 0.005);
    foliage(tip, 0.95);
  }
  for (const geometry of wood) geometry.deleteAttribute("uv");
  const bark = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const p = bark.getAttribute("position");
  const barkColors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const stripe = Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 15 + p.getY(i) * 0.6);
    color.setHSL(0.045 + stripe * 0.012, 0.25 + stripe * 0.06, 0.24 + stripe * 0.055);
    barkColors.push(color.r, color.g, color.b);
  }
  bark.setAttribute("color", new THREE.Float32BufferAttribute(barkColors, 3));
  bark.computeVertexNormals();
  const leaves = medium ? createCanopyLobes(lobes, TEMPERATE_CANOPY.yew, 61017) : new THREE.BufferGeometry();
  if (!medium) {
    leaves.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    leaves.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    leaves.computeVertexNormals();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(bark, barkMaterial),
    crown = new THREE.Mesh(leaves, leafMaterial);
  trunk.name = "yew-fluted-trunk-and-branches";
  crown.name = medium ? "yew-fitted-canopy-lobes" : "yew-abstract-needle-sprays";
  const group = new THREE.Group();
  group.name = "european-yew";
  group.userData.treeQuality = quality;
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      bark.dispose();
      leaves.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
