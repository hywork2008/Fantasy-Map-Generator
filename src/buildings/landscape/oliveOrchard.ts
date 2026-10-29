import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { buildFruitLayer, type FruitSite } from "./fruitLayer";
import { OLIVE_DRUPES, OLIVE_SHARE } from "./mediterraneanMontaneTrees";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import { positionHash, type TreeAppearanceOptions } from "./treeSeasonLayers";

/**
 * A managed olive of the traditional rain-fed Mediterranean grove, pruned to the open vase (O01):
 * a short clean trunk, four scaffold limbs leaning out from one crotch, an open centre that lets
 * light in, and a low, wide crown whose fruiting shoots hang at picking height. The skirt is raised
 * for grazing and harvest. Not the modern hedgerow or high-density grove.
 */
export function createOliveOrchard(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const reduced = low || quality === "medium";
  const appearance = options.appearance === "leaf" || options.appearance === "unripe" ? options.appearance : "fruit";
  let seed = 43267;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const fruitSites: FruitSite[] = [];
  let lowPoints: THREE.Vector3[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Pruned limbs stay smoother than the hollow, twisted bole of an ancient landscape olive.
  const bark = (p: THREE.Vector3) => (Math.sin(Math.atan2(p.z, p.x) * 6 + p.y * 3.1) > 0.55 ? 0x5a5448 : 0x8a8274);
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position"),
      rgb: number[] = [],
      v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const c = new THREE.Color(bark(v.fromBufferAttribute(p, i)));
      rgb.push(c.r, c.g, c.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top = bottom * 0.6, sides = 6) {
    if (reduced && bottom < (low ? 0.08 : 0.03)) return;
    const geometry = new THREE.CylinderGeometry(
      top,
      bottom,
      a.distanceTo(b),
      reduced ? (low ? 3 : 4) : sides,
      1,
      reduced
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  /** Lance leaves on the outer shoots, grey-green above and silvery beneath, as on the landscape olive. */
  function leaves(center: THREE.Vector3, radius: number, count: number, droop: number) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius;
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * r, (random() - 0.5 - droop) * radius * 0.7, Math.sin(angle) * r));
      const heading = random() * Math.PI * 2;
      const along = new THREE.Vector3(Math.cos(heading), (random() - 0.5 - droop) * 0.8, Math.sin(heading))
        .normalize()
        .multiplyScalar(0.19 + random() * 0.06);
      const across = new THREE.Vector3(-Math.sin(heading), 0.1, Math.cos(heading)).multiplyScalar(0.034);
      const silver = random() < 0.35;
      const color = new THREE.Color().setHSL(
        silver ? 0.2 : 0.22 + random() * 0.04,
        silver ? 0.1 : 0.2 + random() * 0.1,
        silver ? 0.55 + random() * 0.1 : 0.25 + random() * 0.1
      );
      // Olives hang in the leaf axils of last year's shoots, in every tier at the same places.
      if (i % 24 === 0)
        fruitSites.push({
          position: p,
          hang: new THREE.Vector3(along.x * 2, -1, along.z * 2).normalize(),
          order: positionHash(p.x, p.y, p.z),
          kind: "axil"
        });
      if (quality !== "ultra" && i % 3 !== 0) continue;
      if (quality !== "ultra") across.multiplyScalar(3);
      const tip = p.clone().add(along);
      const a = p.clone().addScaledVector(along, 0.5).add(across),
        b = p.clone().addScaledVector(along, 0.5).sub(across);
      if (reduced) points.push(p, a, tip, b);
      else
        for (const v of [p, a, tip, p, tip, b]) {
          positions.push(v.x, v.y, v.z);
          colors.push(color.r, color.g, color.b);
        }
    }
    if (quality === "medium") lobes.push(fitCanopyLobe(points, 0.85, true));
    else if (low) lowPoints.push(...points);
  }

  // A short, clean trunk up to the single crotch of the vase.
  const crotch = new THREE.Vector3(0.04, 0.95, 0.02);
  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.3 },
        { center: [0.02, 0.5, 0.01], radius: 0.24 },
        { center: crotch.toArray() as [number, number, number], radius: 0.22 }
      ],
      0.7,
      5,
      low ? 6 : 14
    )
  );
  for (let s = 0; s < 4; s++) {
    lowPoints = [];
    const yaw = (s * Math.PI) / 2 + 0.35 + (random() - 0.5) * 0.25;
    const out = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const side = new THREE.Vector3(-out.z, 0, out.x);
    // Each scaffold leans out about 45 degrees and turns upward, leaving the centre open.
    const base = crotch.clone().addScaledVector(out, 0.12);
    const elbow = base
      .clone()
      .addScaledVector(out, 1.05 + random() * 0.15)
      .addScaledVector(up, 1.05);
    const head = elbow
      .clone()
      .addScaledVector(out, 0.8 + random() * 0.15)
      .addScaledVector(up, 1.15 + random() * 0.2);
    branch(base, elbow, 0.13, 0.1, 8);
    branch(elbow, head, 0.1, 0.06, 7);
    for (let k = 0; k < 5; k++) {
      // Laterals fan outward and sideways from the scaffold, meeting those of the next scaffold so
      // the crown closes into a ring around the open centre.
      const turn = (k - 2) * 0.55 + (random() - 0.5) * 0.2;
      const from = k % 2 ? base.clone().lerp(elbow, 0.55 + k * 0.08) : elbow.clone().lerp(head, 0.2 + k * 0.18);
      const direction = out
        .clone()
        .multiplyScalar(Math.cos(turn))
        .addScaledVector(side, Math.sin(turn))
        .multiplyScalar(0.95 + random() * 0.35);
      const tip = from
        .clone()
        .add(direction)
        .addScaledVector(up, 0.35 + random() * 0.35);
      branch(from, tip, 0.045, 0.02, 5);
      leaves(tip, 0.66, 280, 0.1);
      leaves(from.clone().lerp(tip, 0.5), 0.52, 150, 0.1);
      // Fruiting shoots hang from the laterals over the outer skirt, where they are picked.
      for (let h = 0; h < 2; h++) {
        const hangFrom = from.clone().lerp(tip, 0.55 + h * 0.35);
        const hang = hangFrom
          .clone()
          .addScaledVector(direction.clone().normalize(), 0.45)
          .addScaledVector(side, (h ? -1 : 1) * 0.25)
          .addScaledVector(up, -0.55 - random() * 0.2);
        branch(hangFrom, hang, 0.02, 0.008, 4);
        leaves(hang, 0.42, 110, 0.35);
      }
      if (low && k === 2) {
        lobes.push(fitCanopyLobe(lowPoints, 1, true));
        lowPoints = [];
      }
    }
    leaves(head.clone().addScaledVector(up, 0.25), 0.7, 220, 0);
    if (low) lobes.push(fitCanopyLobe(lowPoints, 1, true));
  }

  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  let foliage: THREE.BufferGeometry;
  if (reduced) foliage = createCanopyLobes(lobes, { hue: 0.235, saturation: 0.18, lightness: 0.34 }, 43267);
  else {
    foliage = new THREE.BufferGeometry();
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.computeVertexNormals();
  }
  const trunk = new THREE.Mesh(barkGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const crown = new THREE.Mesh(foliage, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  trunk.name = "olive-orchard-short-trunk-and-four-vase-scaffolds";
  crown.name = reduced ? "olive-orchard-fitted-open-vase-crown" : "olive-orchard-silvery-lance-leaves";
  const group = new THREE.Group();
  group.name = "olive-orchard";
  group.userData.treeQuality = quality;
  group.userData.treeAppearance = appearance;
  group.add(trunk, crown);
  const pickables = [trunk, crown];
  // Summer leaf carries no visible fruit; the drupes swell green, then turn violet to black.
  const fruitGeometry =
    appearance === "leaf"
      ? undefined
      : buildFruitLayer(fruitSites, OLIVE_DRUPES, quality, {
          stage: appearance === "unripe" ? "unripe" : "ripe",
          density: OLIVE_SHARE[quality]
        });
  if (fruitGeometry) {
    const mesh = new THREE.Mesh(fruitGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = appearance === "unripe" ? "olive-orchard-green-drupes" : "olive-orchard-green-violet-and-black-drupes";
    group.add(mesh);
    pickables.push(mesh);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}
