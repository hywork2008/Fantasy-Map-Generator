import Alea from "alea";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ArchitectureKit } from "../architectureKit";
import type { TowerBranch } from "../babelSpire";
import { babelEntranceCenters } from "./babelEntrances";

/** Open, human-scale breastwork with alternating merlons, like W02. */
function battlements(k: ArchitectureKit, name: string, x: number, z: number, radius: number, floor: number) {
  const shell = new THREE.LatheGeometry(
    [
      new THREE.Vector2(radius - 0.65, 0),
      new THREE.Vector2(radius, 0),
      new THREE.Vector2(radius, 0.8),
      new THREE.Vector2(radius - 0.65, 0.8),
      new THREE.Vector2(radius - 0.65, 0)
    ],
    64
  );
  k.add(`${name}-breastwork`, shell, "stone").position.set(x, floor, z);
  const count = Math.round((2 * Math.PI * radius) / 2.1);
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count;
    const r = radius - 0.32;
    const merlon = k.box(
      `${name}-merlon`,
      [x + Math.sin(angle) * r, floor + 1.35, z + Math.cos(angle) * r],
      [1.05, 1.1, 0.72],
      "stone"
    );
    merlon.rotation.y = angle;
    const cap = k.box(
      `${name}-coping`,
      [merlon.position.x, floor + 1.95, merlon.position.z],
      [1.18, 0.16, 0.84],
      "white"
    );
    cap.rotation.y = angle;
  }
}

/** Last five metres are hollow; both the roof slab and its soffit have a stair opening. */
export function addSpireRoofAccess(k: ArchitectureKit, radius: number, roof: number, slab: number) {
  const shell = new THREE.LatheGeometry(
    [
      new THREE.Vector2(radius - 1, 0),
      new THREE.Vector2(radius, 0),
      new THREE.Vector2(radius, 5),
      new THREE.Vector2(radius - 1, 5),
      new THREE.Vector2(radius - 1, 0)
    ],
    32
  );
  k.add("summit-shell", shell, "stone").position.y = roof - slab - 5;
  const plan = new THREE.Shape();
  // Match the 32-sided shaft, including its facet orientation.
  for (let i = 0; i <= 32; i++) {
    const a = (i * Math.PI * 2) / 32;
    if (i === 0) plan.moveTo(Math.sin(a) * radius, Math.cos(a) * radius);
    else plan.lineTo(Math.sin(a) * radius, Math.cos(a) * radius);
  }
  const hole = new THREE.Path();
  hole.moveTo(-1.3, -4);
  hole.lineTo(1.3, -4);
  hole.lineTo(1.3, 4);
  hole.lineTo(-1.3, 4);
  hole.closePath();
  plan.holes.push(hole);
  const deck = k.add(
    "summit-open-deck",
    new THREE.ExtrudeGeometry(plan, { depth: slab, bevelEnabled: false }),
    "stone"
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = roof - slab;
  for (let i = 0; i < 20; i++) {
    k.box("summit-stair-tread", [0, roof - 5 + (i + 1) * 0.25 - 0.09, 3.8 - i * 0.4], [2.35, 0.18, 0.4], "stone");
  }
  for (const x of [-1.15, 1.15]) {
    k.beam("summit-stair-stringer", [x, roof - 5.1, 4], [x, roof - 0.1, -4], 0.22, "stone");
    k.box("summit-stair-curb", [x * 1.2, roof + 0.25, 0], [0.2, 0.5, 8.2], "stone");
    k.beam("summit-stair-handrail", [x, roof - 4, 3.8], [x, roof + 1, -3.8], 0.09, "iron");
  }
  battlements(k, "summit", 0, 0, radius, roof);
}

/** Two short curved haunches; the unsupported middle of the span stays slender. */
function corridorHaunch(
  k: ArchitectureKit,
  index: number,
  branch: TowerBranch,
  floor: number,
  radius: number,
  overhang: number
) {
  const near = radius - 0.2;
  const far = radius + overhang + branch.length + 0.2;
  const reach = Math.min(4, branch.length * 0.22);
  for (const [end, direction, label] of [
    [near, 1, "main"],
    [far, -1, "satellite"]
  ] as const) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.4);
    shape.lineTo(reach, -0.4);
    shape.quadraticCurveTo(reach * 0.3, -0.65, 0, -3.2);
    shape.closePath();
    const mesh = k.add(
      `corridor-${index}-${label}-haunch`,
      new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false, curveSegments: 8 }),
      "stone"
    );
    // Local X follows (or opposes) the corridor axis; local Z is transverse.
    const angle = branch.angle - (direction * Math.PI) / 2;
    mesh.rotation.y = angle;
    mesh.position.set(
      Math.sin(branch.angle) * end - Math.sin(angle) * 0.4,
      floor,
      Math.cos(branch.angle) * end - Math.cos(angle) * 0.4
    );
  }
}

function portals(k: ArchitectureKit, radius: number, floors: number[], heights: readonly number[]) {
  const outline = (w: number, h: number) => {
    const path = new THREE.Path();
    path.moveTo(-w / 2, 0);
    path.lineTo(-w / 2, h * 0.65);
    path.quadraticCurveTo(-w * 0.45, h * 0.87, 0, h);
    path.quadraticCurveTo(w * 0.45, h * 0.87, w / 2, h * 0.65);
    path.lineTo(w / 2, 0);
    path.closePath();
    return path;
  };
  for (const [level, base] of floors.entries()) {
    const h = Math.min(12, (heights[level] - 1.2) * 0.62);
    for (const [i, entry] of babelEntranceCenters(radius).entries()) {
      const frame = new THREE.Shape(outline(entry.width + 0.7, h + 0.5).getPoints(12));
      frame.holes.push(outline(entry.width, h));
      const mesh = k.add(
        "gothic-archivolts",
        new THREE.ExtrudeGeometry(frame, { depth: 0.18, bevelEnabled: false, curveSegments: 8 }),
        "white"
      );
      mesh.rotation.y = entry.angle;
      mesh.position.set(entry.x + Math.sin(entry.angle) * 0.05, base + 0.3, entry.z + Math.cos(entry.angle) * 0.05);
      for (const side of [-1, 1]) {
        const offset = side * (entry.width / 2 + 0.22);
        const x = entry.x + Math.cos(entry.angle) * offset + Math.sin(entry.angle) * 0.18;
        const z = entry.z - Math.sin(entry.angle) * offset + Math.cos(entry.angle) * 0.18;
        k.box("gothic-jamb-shafts", [x, base + 0.3 + h * 0.32, z], [0.18, h * 0.64, 0.18], "white");
        const capital = k.box("gothic-capitals", [x, base + 0.3 + h * 0.65, z], [0.4, 0.22, 0.35], "white");
        capital.rotation.y = entry.angle;
      }
      // Blind paired lancets enrich the dark recess without blocking the lower entrance.
      const y = base + h * 0.66;
      for (const side of [-1, 1]) {
        const offset = side * entry.width * 0.23;
        const x = entry.x + Math.cos(entry.angle) * offset;
        const z = entry.z - Math.sin(entry.angle) * offset;
        const shape = new THREE.Shape(outline(entry.width * 0.35, h * 0.26).getPoints(8));
        shape.holes.push(outline(entry.width * 0.27, h * 0.23));
        const lancet = k.add("gothic-paired-lancets", new THREE.ShapeGeometry(shape, 6), "stone");
        lancet.rotation.y = entry.angle;
        lancet.position.set(x + Math.sin(entry.angle) * 0.24, y, z + Math.cos(entry.angle) * 0.24);
      }
      if (i % 4 === 0)
        for (let lobe = 0; lobe < 4; lobe++) {
          const a = (lobe * Math.PI) / 2;
          const u = Math.cos(a) * 0.18;
          const ring = k.add("gothic-quatrefoils", new THREE.TorusGeometry(0.22, 0.045, 4, 8), "white");
          ring.rotation.y = entry.angle;
          ring.position.set(
            entry.x + Math.cos(entry.angle) * u + Math.sin(entry.angle) * 0.25,
            base + h + 1.25 + Math.sin(a) * 0.18,
            entry.z - Math.sin(entry.angle) * u + Math.cos(entry.angle) * 0.25
          );
        }
    }
  }
}

/** One 256 px repeat covers 4 x 2 m: staggered small ashlar with recessed mortar. */
function masonryTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const random = Alea("babel-ashlar");
  const tones = Array.from({ length: 8 * 8 }, () => 0.89 + random() * 0.2);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 32),
        u = (x + (row % 2) * 16) % size;
      const mortar = y % 32 < 2 || u % 32 < 2;
      const shade = mortar ? 0.63 : tones[row * 8 + Math.floor(u / 32)] + (random() - 0.5) * 0.045;
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(170 * shade);
      data[offset + 1] = Math.round(161 * shade);
      data[offset + 2] = Math.round(142 * shade);
      data[offset + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Merge repeated ornaments by purpose, retaining a small number of draw calls. */
function batch(k: ArchitectureKit, start: number) {
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const mesh of k.pickables.filter(
    (mesh, index) => index >= start || /^summit-(merlon|coping|stair-)/.test(mesh.name)
  )) {
    const key = mesh.name;
    const bucket = buckets.get(key) ?? [];
    bucket.push(mesh);
    buckets.set(key, bucket);
  }
  for (const [name, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => {
      mesh.updateMatrix();
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      g.deleteAttribute("uv");
      return g.applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(geometries)!;
    for (const g of geometries) g.dispose();
    for (const mesh of meshes) {
      k.group.remove(mesh);
      k.pickables.splice(k.pickables.indexOf(mesh), 1);
    }
    const merged = k.add(name, geometry, "stone");
    merged.material = meshes[0].material as THREE.MeshLambertMaterial;
  }
}

export function addSpireDetails(
  k: ArchitectureKit,
  floors: number[],
  heights: readonly number[],
  branches: TowerBranch[],
  generation: { seed: string; overhang: number },
  radius: number
) {
  const start = k.pickables.length;
  portals(k, radius, floors, heights);
  const random = Alea(`${generation.seed}:satellite-roofs`);
  const roofStyles: string[] = [];
  for (const [i, branch] of branches.entries()) {
    const reach = radius + generation.overhang + branch.length + branch.radius;
    const x = Math.sin(branch.angle) * reach,
      z = Math.cos(branch.angle) * reach;
    const roof = floors[branch.level] + heights[branch.level];
    corridorHaunch(k, i, branch, floors[branch.level], radius, generation.overhang);
    const style = ["battlements", "cone", "both"][Math.floor(random() * 3)];
    roofStyles.push(style);
    if (style !== "cone") battlements(k, `satellite-${i}`, x, z, branch.radius, roof);
    if (style !== "battlements") {
      const r = branch.radius - (style === "both" ? 1.25 : -0.25);
      const rise = r * 0.95;
      k.cylinder(`satellite-${i}-roof-eave`, [x, roof + 0.3, z], r + 0.2, 0.2, "tile", r, 32);
      k.cylinder(`satellite-${i}-conical-roof`, [x, roof + 0.4 + rise / 2, z], r, rise, "tile", 0, 32);
      k.cylinder(`satellite-${i}-roof-finial`, [x, roof + rise + 0.6, z], 0.12, 0.4, "iron", 0, 8);
    }
  }
  batch(k, start);
  const texture = masonryTexture();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, side: THREE.DoubleSide });
  for (const mesh of k.pickables) {
    if (mesh.name === "summit-shell" || mesh.name.endsWith("-breastwork")) {
      const uv = mesh.geometry.getAttribute("uv");
      const positions = mesh.geometry.getAttribute("position");
      const r =
        mesh.name === "summit-shell" || mesh.name === "summit-breastwork"
          ? radius
          : branches[Number(mesh.name.split("-")[1])].radius;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / 4, positions.getY(i) / 2);
      uv.needsUpdate = true;
      mesh.material = material;
      continue;
    }
    if (!/^shaft-level-|^satellite-\d+$/.test(mesh.name)) continue;
    const cylinder = mesh.geometry as THREE.CylinderGeometry;
    const uv = cylinder.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        (uv.getX(i) * Math.PI * 2 * cylinder.parameters.radiusBottom) / 4,
        (uv.getY(i) * cylinder.parameters.height) / 2
      );
    uv.needsUpdate = true;
    mesh.material = material;
  }
  k.group.userData.satelliteRoofStyles = roofStyles;
  k.group.userData.quality = "ultra";
  const assembly = k.finish();
  return {
    ...assembly,
    dispose() {
      assembly.dispose();
      material.dispose();
      texture.dispose();
    }
  };
}
