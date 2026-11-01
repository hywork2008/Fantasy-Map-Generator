import * as THREE from "three";
import { ModelKit } from "./modelKit";

export type LimeKilnPart = "kiln" | "charging-bank" | "materials";

/** An unlit, charged intermittent kiln: the hearth and charging throat remain actual voids. */
export function createLimeKilnPart(part: LimeKilnPart) {
  const k = new ModelKit(`lime-kiln-${part}-high`),
    cz = -0.5;
  if (part === "kiln") {
    k.box("kiln-stone-foundation", [0, 0.125, cz], [4.7, 0.25, 4.6], "stone");
    for (let row = 0; row < 12; row++)
      for (let sector = 0; sector < 48; sector++) {
        const a = (sector * Math.PI * 2) / 48,
          b = ((sector + 1) * Math.PI * 2) / 48;
        const y0 = 0.25 + (row / 12) * 4,
          y1 = 0.25 + ((row + 1) / 12) * 4;
        // Leave the complete lower front sector open for the deep stoking passage.
        if (row < 5 && (sector < 4 || sector >= 44)) continue;
        const shape = new THREE.Shape();
        const outer = 2.02 - row * 0.006,
          inner = 1.53;
        shape.moveTo(Math.sin(a) * outer, Math.cos(a) * outer);
        for (let j = 1; j <= 3; j++) {
          const t = a + ((b - a) * j) / 3;
          shape.lineTo(Math.sin(t) * outer, Math.cos(t) * outer);
        }
        shape.lineTo(Math.sin(b) * inner, Math.cos(b) * inner);
        for (let j = 2; j >= 0; j--) {
          const t = a + ((b - a) * j) / 3;
          shape.lineTo(Math.sin(t) * inner, Math.cos(t) * inner);
        }
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0 - 0.007, bevelEnabled: false });
        geometry.rotateX(Math.PI / 2);
        k.add("kiln-masonry-course-block", geometry, "stone").position.set(0, y1, cz);
      }
    // The lower shell opening is closed around, rather than behind, the throat.
    for (const side of [-1, 1]) k.box("stoke-passage-sidewall", [side * 0.98, 1.075, 1.35], [0.96, 1.65, 2.1], "stone");
    const arch = new THREE.Shape();
    arch.moveTo(-1.46, 1.92);
    arch.lineTo(1.46, 1.92);
    arch.lineTo(1.46, 1.05);
    arch.lineTo(0.5, 1.05);
    for (let i = 1; i <= 32; i++) {
      const a = (i * Math.PI) / 32;
      arch.lineTo(Math.cos(a) * 0.5, 1.05 + Math.sin(a) * 0.55);
    }
    arch.lineTo(-1.46, 1.05);
    arch.closePath();
    k.add(
      "open-stoking-passage-vault",
      new THREE.ExtrudeGeometry(arch, { depth: 2.1, bevelEnabled: false }),
      "stone"
    ).position.z = 0.3;
    // Radial arch joints remain outside the opening.
    for (let i = 1; i < 12; i++) {
      const a = (i * Math.PI) / 12;
      k.beam(
        "stoke-arch-joint",
        [Math.cos(a) * 0.5, 1.05 + Math.sin(a) * 0.55, 2.405],
        [Math.cos(a) * 0.73, 1.05 + Math.sin(a) * 0.77, 2.405],
        0.012,
        "earth"
      );
    }
    k.box("hearth-ash-bed", [0, 0.285, cz], [2.5, 0.07, 2.5], "dark");
    const ledge = [
      [1.15, 1.82],
      [1.55, 1.82],
      [1.55, 2.02],
      [1.15, 2.02],
      [1.15, 1.82]
    ];
    k.add(
      "interior-charge-bearing-ledge",
      new THREE.LatheGeometry(
        ledge.map(([r, y]) => new THREE.Vector2(r, y)),
        48
      ),
      "stone"
    ).position.z = cz;
    const vault = new THREE.Shape();
    vault.moveTo(-1.4, 2.2);
    vault.lineTo(1.4, 2.2);
    vault.lineTo(1.4, 1.82);
    vault.lineTo(1.15, 1.82);
    for (let i = 1; i <= 32; i++) {
      const a = (i * Math.PI) / 32;
      vault.lineTo(Math.cos(a) * 1.15, 1.82 + Math.sin(a) * 0.2);
    }
    vault.lineTo(-1.4, 1.82);
    vault.closePath();
    k.add(
      "limestone-charge-support-vault",
      new THREE.ExtrudeGeometry(vault, { depth: 1.6, bevelEnabled: false }),
      "stone"
    ).position.z = cz - 0.8;
    k.cylinder("limestone-charge-bed", [0, 2.47, cz], 1.48, 0.58, "stone", 1.48, 48);
    for (let i = 0; i < 39; i++) {
      const r = Math.sqrt((i + 0.5) / 39) * 1.2,
        a = i * 2.39996;
      const geometry = new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.018, 0);
      geometry.scale(1, 0.8, 1);
      geometry.rotateY(a);
      geometry.computeBoundingBox();
      geometry.translate(0, 2.76 - geometry.boundingBox!.min.y, 0);
      k.add("individual-limestone-charge", geometry, "stone").position.set(Math.cos(a) * r, 0, cz + Math.sin(a) * r);
    }
    k.ring("kiln-mouth-coping", [0, 4.25, cz], 1.77, 0.19, "stone");
  } else if (part === "charging-bank") {
    const vertices = [-1.8, 0, -7.8, 1.8, 0, -7.8, 1.8, 4.05, -2.35, -1.8, 4.05, -2.35, -1.8, 0, -2.35, 1.8, 0, -2.35];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 1, 5, 2, 3, 2, 5, 3, 5, 4, 0, 4, 5, 0, 5, 1]);
    geometry.computeVertexNormals();
    k.add("solid-earthen-charging-bank", geometry, "earth");
    for (let i = 0; i < 23; i++) {
      const h = ((i + 1) * 4.25) / 23,
        z = -7.8 + ((i + 0.5) * 5.45) / 23;
      k.box("stone-bank-tread", [0, h / 2, z], [1.15, h, 5.45 / 23 + 0.006], "stone");
    }
    k.box("charging-crest-landing", [0, 4.16, -2.35], [2.4, 0.18, 0.5], "stone");
    for (const x of [-1.02, 1.02]) {
      k.box("crest-landing-pier", [x, 2.035, -2.35], [0.22, 4.07, 0.3], "stone");
      k.box("charging-edge-post", [x, 4.72, -2.35], [0.1, 0.94, 0.1], "oak");
    }
    // Rails stay beside the approach, leaving the final path to the mouth open.
    for (const side of [-1, 1]) {
      for (let i = 1; i < 23; i += 4) {
        const h = ((i + 1) * 4.25) / 23,
          z = -7.8 + ((i + 0.5) * 5.45) / 23;
        const ground = (4.05 * (i + 0.5)) / 23;
        k.box("bank-post-footing", [side * 0.7, (ground - 0.05 + h) / 2, z], [0.18, h - ground + 0.05, 0.18], "stone");
        k.box("bank-handrail-post", [side * 0.7, h + 0.45, z], [0.09, 0.9, 0.09], "oak");
      }
      k.beam(
        "bank-handrail",
        [side * 0.7, 0.9 + 4.25 * (0.35 / 5.45 + 0.5 / 23), -7.45],
        [side * 0.7, 0.9 + 4.25 * (5.25 / 5.45 + 0.5 / 23), -2.55],
        0.075,
        "wood"
      );
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const geometry = new THREE.DodecahedronGeometry(0.38 + (i % 3) * 0.035, 0);
      geometry.scale(1, 0.85, 0.8);
      geometry.rotateY(i * 0.7);
      geometry.computeBoundingBox();
      geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      k.add("limestone-stock", geometry, "stone").position.set(
        -4.1 + (i % 2) * 0.85,
        0,
        0.2 + Math.floor(i / 2) * 0.85
      );
    }
    for (const x of [3.2, 4.4]) k.box("fuel-stack-sleeper", [x, 0.1, 0.4], [0.2, 0.2, 2], "oak");
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 6 - row; i++) {
        const x = 3.03 + i * 0.25 + row * 0.125,
          y = 0.32 + row * 0.22;
        k.beam("stacked-kiln-firewood", [x, y, -0.45], [x, y, 1.3], 0.24, "wood", true);
        for (const z of [-0.453, 1.303]) {
          const ring = k.ring("firewood-end-grain", [x, y, z], 0.065, 0.007, "oak", true);
          ring.rotation.z = Math.PI / 2;
        }
      }
    k.box("kiln-tools-rack", [3.7, 0.55, 2.7], [1.65, 0.12, 0.45], "wood");
    for (const x of [3, 4.4]) k.box("rack-foot", [x, 0.25, 2.7], [0.12, 0.5, 0.3], "oak");
    for (const x of [3.25, 3.7, 4.15]) {
      k.beam("long-kiln-tool", [x, 0.63, 2.15], [x, 0.63, 3.25], 0.045, "wood", true);
      k.box("iron-rake-head", [x, 0.63, 3.32], [0.3, 0.05, 0.12], "iron");
    }
  }
  return k.finish();
}
