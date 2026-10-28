import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { TEMPERATE_CANOPY } from "./temperateTreeLod";
import { createTreeBase } from "./treeBase";

export type LimeOpusEdition = "standard" | "light";

/** Ovoid crown of an open-grown Tilia cordata: leaves form a dense outer shell, not a filled volume. */
const CROWN_CENTER = new THREE.Vector3(0, 7.1, 0);
const CROWN_RADIUS = new THREE.Vector3(5.1, 4.1, 5.1);
const UP = new THREE.Vector3(0, 1, 0);

function generator(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

interface Limb {
  a: THREE.Vector3;
  b: THREE.Vector3;
  bottom: number;
  top: number;
}
interface Spray {
  center: THREE.Vector3;
  radius: number;
  /** Horizontal direction leaves point away from their twig. */
  outward: THREE.Vector3;
  leaves: number;
}

/** Push a point radially into the crown shell, between `inner` and `outer` of the envelope. */
function intoShell(point: THREE.Vector3, inner: number, outer: number, t: number): THREE.Vector3 {
  const relative = point.clone().sub(CROWN_CENTER).divide(CROWN_RADIUS);
  const length = Math.max(relative.length(), 1e-6);
  return relative
    .multiplyScalar(THREE.MathUtils.lerp(inner, outer, t) / length)
    .multiply(CROWN_RADIUS)
    .add(CROWN_CENTER);
}

/**
 * Ascending primary limbs off a central leader, each carrying secondary shoots that end in leaf
 * sprays on the crown shell; the lowest limbs arch outward and down as on open-grown limes.
 */
function skeleton() {
  const random = generator(7331);
  const limbs: Limb[] = [];
  const sprays: Spray[] = [];
  const spray = (tip: THREE.Vector3, from: THREE.Vector3, radius: number) => {
    const outward = tip.clone().sub(from).setY(0);
    if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0);
    sprays.push({ center: tip, radius, outward: outward.normalize(), leaves: Math.round(32 * radius) });
  };
  const leaderTop = new THREE.Vector3(-0.1, 10.4, 0.08);
  const count = 16;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const azimuth = i * 2.39996 + (random() - 0.5) * 0.35;
    const start = new THREE.Vector3(0.05, 3.1, -0.04).lerp(leaderTop, t * 0.72);
    const elevation = THREE.MathUtils.degToRad(-30 + t * 85);
    const direction = new THREE.Vector3(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth)
    );
    const end = intoShell(CROWN_CENTER.clone().add(direction.clone().multiply(CROWN_RADIUS)), 0.84, 0.84, 0);
    // Lower limbs rise first and then arch over; upper limbs stay straighter.
    const elbow = start
      .clone()
      .lerp(end, 0.5)
      .add(new THREE.Vector3(0, 0.5 * (1 - t), 0));
    const base = 0.19 * (1 - 0.55 * t);
    limbs.push(
      { a: start, b: elbow, bottom: base, top: base * 0.55 },
      { a: elbow, b: end, bottom: base * 0.55, top: 0.04 }
    );
    spray(end, start, 0.85 + random() * 0.2);
    // A second, inner layer of foliage on the elbow keeps the crown from reading as a hollow shell.
    spray(intoShell(elbow, 0.6, 0.72, random()), start, 0.8 + random() * 0.15);
    for (let j = 0; j < 4; j++) {
      const along = 0.4 + j * 0.15 + random() * 0.05;
      const from = along < 0.5 ? start.clone().lerp(elbow, along * 2) : elbow.clone().lerp(end, (along - 0.5) * 2);
      const side = (j % 2 ? 1 : -1) * (0.55 + random() * 0.4);
      const branchDirection = end
        .clone()
        .sub(start)
        .normalize()
        .applyAxisAngle(UP, side)
        .add(new THREE.Vector3(0, 0.25 + random() * 0.2, 0))
        .normalize();
      const tip = intoShell(from.clone().addScaledVector(branchDirection, 1.4 + random() * 0.7), 0.72, 0.94, random());
      limbs.push({ a: from, b: tip, bottom: 0.05, top: 0.012 });
      spray(tip, from, 0.7 + random() * 0.25);
    }
  }
  // Short shoots off the leader close the crown top, which the limbs alone leave thin.
  for (let i = 0; i < 20; i++) {
    const azimuth = i * 2.39996;
    const from = new THREE.Vector3(0.05, 3.1, -0.04).lerp(leaderTop, 0.75 + random() * 0.25);
    const reach = [0.3, 1.2, 2.2][i % 3];
    const tip = intoShell(
      new THREE.Vector3(Math.cos(azimuth) * reach, 11, Math.sin(azimuth) * reach),
      0.8,
      0.95,
      random()
    );
    limbs.push({ a: from, b: tip, bottom: 0.04, top: 0.01 });
    spray(tip, from, 0.75 + random() * 0.2);
  }
  spray(intoShell(leaderTop.clone().add(new THREE.Vector3(0, 1, 0)), 0.9, 0.9, 0), leaderTop, 0.95);
  return { limbs, sprays };
}

/** Leaf centres of one spray, from the spray's own sequence so both editions agree. */
function leafPlacements(spray: Spray, index: number) {
  const random = generator(9001 + index * 7919);
  return Array.from({ length: spray.leaves }, () => {
    const azimuth = random() * Math.PI * 2;
    const height = random() * 2 - 1;
    const distance = Math.cbrt(random()) * spray.radius;
    const horizontal = Math.sqrt(1 - height * height) * distance;
    return {
      center: spray.center
        .clone()
        .add(
          new THREE.Vector3(Math.cos(azimuth) * horizontal, height * distance * 0.7, Math.sin(azimuth) * horizontal)
        ),
      turn: (random() - 0.5) * 1.6,
      tilt: random(),
      size: 0.28 + random() * 0.12,
      speckle: random() - 0.5,
      hue: random() - 0.5
    };
  });
}

/** Cordate outline, tip toward +Y, fanned from a slightly raised midrib point. */
const LEAF_OUTLINE: readonly [number, number][] = [
  [0, 0],
  [-0.46, 0.14],
  [-0.42, 0.62],
  [0, 1],
  [0.44, 0.6],
  [0.48, 0.12]
];

function leaves(sprays: readonly Spray[]) {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color();
  const palette = TEMPERATE_CANOPY.lime;
  const leafNormal = new THREE.Vector3(),
    crownNormal = new THREE.Vector3(),
    relative = new THREE.Vector3();
  sprays.forEach((spray, index) => {
    for (const leaf of leafPlacements(spray, index)) {
      relative.subVectors(leaf.center, CROWN_CENTER).divide(CROWN_RADIUS);
      crownNormal.copy(relative).divide(CROWN_RADIUS).normalize();
      // Blades face out of the crown and toward the sky, so the shell reads as closed from any side.
      leafNormal
        .copy(crownNormal)
        .add(new THREE.Vector3(leaf.turn * 0.45, 0.6 + (leaf.tilt - 0.5) * 0.7, leaf.hue * 1.4))
        .normalize();
      const across = new THREE.Vector3().crossVectors(leafNormal, spray.outward.clone().applyAxisAngle(UP, leaf.turn));
      if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
      across.normalize();
      const blade = new THREE.Vector3().crossVectors(across, leafNormal).normalize();
      // Shading follows the crown as a whole, with the leaf's own facing as a smaller term.
      const normal = leafNormal
        .clone()
        .multiplyScalar(0.4)
        .addScaledVector(crownNormal, 0.6)
        .add(UP.clone().multiplyScalar(0.1))
        .normalize();
      const shell = THREE.MathUtils.smoothstep(relative.length(), 0.45, 0.95);
      const height = THREE.MathUtils.clamp(relative.y * 0.5 + 0.5, 0, 1);
      // Sun leaves on the outer shell are lighter and yellower than shade leaves inside.
      const lightness =
        (palette.lightness + 0.02 * shell + leaf.speckle * 0.12) * (0.6 + 0.34 * shell) * (0.86 + 0.14 * height);
      color.setHSL(palette.hue - 0.012 * shell + leaf.hue * 0.03, palette.saturation + leaf.speckle * 0.08, lightness);
      const point = ([x, y]: readonly [number, number], lift = 0) =>
        leaf.center
          .clone()
          .addScaledVector(across, x * leaf.size)
          .addScaledVector(blade, (y - 0.4) * leaf.size)
          .addScaledVector(leafNormal, lift * leaf.size);
      const midrib = point([0, 0.45], 0.08);
      for (let i = 0; i < LEAF_OUTLINE.length; i++) {
        for (const vertex of [midrib, point(LEAF_OUTLINE[i]), point(LEAF_OUTLINE[(i + 1) % LEAF_OUTLINE.length])]) {
          positions.push(vertex.x, vertex.y, vertex.z);
          normals.push(normal.x, normal.y, normal.z);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Claude Opus 5.5's high tier for Tilia cordata. The standard edition draws individual cordate
 * leaves; the light edition keeps the same limbs and replaces each spray with one fitted lobe,
 * as the Opus medium tier does for the Codex high tier.
 */
export function createSmallLeavedLimeOpus(edition: LimeOpusEdition = "standard"): CityStructureMeshes {
  const light = edition === "light";
  const { limbs, sprays } = skeleton();
  const wood: THREE.BufferGeometry[] = [
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.47 },
        { center: [0.03, 1.2, 0.05], radius: 0.33 },
        { center: [0.05, 3.1, -0.04], radius: 0.27 },
        { center: [-0.06, 7.6, 0.06], radius: 0.09 },
        { center: [-0.1, 10.4, 0.08], radius: 0.012 }
      ],
      0.9,
      7
    )
  ];
  for (const { a, b, bottom, top } of limbs) {
    // Shoots are sub-pixel at the light edition's range; only limbs that show between lobes remain.
    if (light && bottom < 0.05) continue;
    const geometry = new THREE.CylinderGeometry(
      top,
      bottom,
      a.distanceTo(b),
      light ? 4 : bottom < 0.06 ? 4 : 7,
      1,
      light
    );
    geometry.deleteAttribute("uv");
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    wood.push(geometry);
  }
  const bark = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  bark.computeVertexNormals();
  const foliage = light
    ? createCanopyLobes(
        sprays.map(
          (spray, index): CanopyLobe =>
            fitCanopyLobe(
              leafPlacements(spray, index).map(leaf => leaf.center),
              1.3
            )
        ),
        TEMPERATE_CANOPY.lime,
        7331
      )
    : leaves(sprays);
  const barkMaterial = new THREE.MeshLambertMaterial({ color: 0x635747 });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(bark, barkMaterial);
  trunk.name = "lime-opus-trunk-and-limbs";
  const crown = new THREE.Mesh(foliage, leafMaterial);
  crown.name = light ? "lime-opus-fitted-canopy-lobes" : "lime-opus-cordate-leaves";
  const group = new THREE.Group();
  group.name = "small-leaved-lime";
  group.userData.treeQuality = "high";
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      bark.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
