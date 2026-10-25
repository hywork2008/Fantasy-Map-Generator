import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createTreeBase } from "./treeBase";

/** A summer, open-grown Tilia cordata. Meter scale; deterministic and texture-free. */
export function createSmallLeavedLime(): CityStructureMeshes {
  let seed = 6143;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const foliage: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number) {
    const geometry = new THREE.CylinderGeometry(top, bottom, a.distanceTo(b), 9, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    wood.push(geometry);
  }
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.08);
  leafShape.bezierCurveTo(-0.75, -0.55, -0.95, 0.25, -0.5, 0.55);
  leafShape.lineTo(0, 1);
  leafShape.lineTo(0.5, 0.55);
  leafShape.bezierCurveTo(0.95, 0.25, 0.75, -0.55, 0, -0.08);
  const leafSource = new THREE.ShapeGeometry(leafShape, 3);
  const leaf = leafSource.toNonIndexed();
  leafSource.dispose();
  const positions: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color();
  const rotation = new THREE.Euler();
  const matrix = new THREE.Matrix4();
  function spray(tip: THREE.Vector3, radius: number, count = 105) {
    for (let i = 0; i < count; i++) {
      const azimuth = random() * Math.PI * 2;
      const height = random() * 2 - 1;
      const distance = Math.cbrt(random()) * radius;
      const horizontal = Math.sqrt(1 - height * height) * distance;
      const center = tip
        .clone()
        .add(
          new THREE.Vector3(Math.cos(azimuth) * horizontal, height * distance * 0.8, Math.sin(azimuth) * horizontal)
        );
      rotation.set(random() * 2.4 - 1.2, random() * Math.PI * 2, random() * Math.PI);
      const size = 0.12 + random() * 0.1;
      matrix.compose(center, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(size, size * 1.1, size));
      color.setHSL(0.23 + random() * 0.055, 0.33 + random() * 0.18, 0.22 + random() * 0.16);
      const p = leaf.getAttribute("position");
      for (let j = 0; j < p.count; j++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, j);
        // Slightly folded blade catches light without a spherical canopy shell.
        v.z = Math.abs(v.x) * 0.18;
        v.applyMatrix4(matrix);
        positions.push(v.x, v.y, v.z);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const fork = new THREE.Vector3(0.12, 3.3, -0.08);
  wood.push(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.46 },
        { center: [0.04, 1.4, 0.06], radius: 0.31 },
        { center: [0.12, 3.3, -0.08], radius: 0.25 },
        { center: [-0.25, 8.1, 0.15], radius: 0.045 },
        { center: [0.08, 10.35, -0.12], radius: 0.009 }
      ],
      0.9,
      7
    )
  );
  for (let i = 0; i < 19; i++) {
    const angle = i * 2.39996 + random() * 0.3;
    const level = i / 18;
    const reach = 3.7 * Math.sin(0.55 + level * 2.25);
    const start = fork.clone().lerp(new THREE.Vector3(-0.25, 8.1, 0.15), level);
    const end = new THREE.Vector3(Math.cos(angle) * reach, 4.7 + level * 5.1, Math.sin(angle) * reach);
    const elbow = start
      .clone()
      .lerp(end, 0.48)
      .add(new THREE.Vector3(0, -0.25, 0));
    branch(start, elbow, 0.18 * (1 - level * 0.65), 0.08);
    branch(elbow, end, 0.08, 0.018);
    for (let j = 0; j < 5; j++) {
      const theta = angle + (j - 2) * 0.62;
      const tip = end
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(theta) * (0.5 + random() * 0.8),
            (random() - 0.3) * 1.1,
            Math.sin(theta) * (0.5 + random() * 0.8)
          )
        );
      branch(elbow.clone().lerp(end, 0.45 + j * 0.1), tip, 0.026, 0.005);
      spray(tip, 0.7 + random() * 0.3);
    }
  }
  // Continue the leader into a leafy upper crown rather than leaving a hollow ring.
  const leaderBase = new THREE.Vector3(-0.25, 8.1, 0.15);
  const leaderTip = new THREE.Vector3(0.08, 10.35, -0.12);
  spray(leaderTip, 0.9, 240);
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.39996;
    const radius = i < 5 ? 0.65 : 1.45;
    const tip = new THREE.Vector3(
      Math.cos(angle) * radius,
      10.25 - radius * 0.35 + (random() - 0.5) * 0.3,
      Math.sin(angle) * radius
    );
    const start = leaderBase.clone().lerp(leaderTip, 0.35 + random() * 0.4);
    const elbow = start.clone().lerp(tip, 0.55);
    branch(start, elbow, 0.035, 0.018);
    branch(elbow, tip, 0.018, 0.004);
    spray(tip, 0.8 + random() * 0.15, 200);
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  leaves.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  leaves.computeVertexNormals();
  foliage.push(leaves);
  leaf.dispose();
  const barkMaterial = new THREE.MeshLambertMaterial({ color: 0x635747 });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const geometry of wood) geometry.deleteAttribute("uv");
  const bark = mergeGeometries(wood)!;
  bark.computeVertexNormals();
  for (const geometry of wood) geometry.dispose();
  const trunk = new THREE.Mesh(bark, barkMaterial);
  trunk.name = "lime-trunk-roots-and-branches";
  const crown = new THREE.Mesh(leaves, leafMaterial);
  crown.name = "lime-heart-shaped-leaves";
  const group = new THREE.Group();
  group.name = "small-leaved-lime";
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      bark.dispose();
      for (const geometry of foliage) geometry.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
