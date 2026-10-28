import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { BridgeStructure } from "../../utils/bridgeSkewPolicy";

export interface ModularBridgeSpec {
  material: BridgeStructure;
  length: number;
  width: number;
  /** Walking surface above the foundation datum, at each bank. */
  deckHeight: number;
  endDeckHeight?: number;
  waterHeight: number;
  /** Preferred bay size. All regular bays share one geometry; no full-bridge stretching. */
  spanMeters?: number;
  /** Clear navigation opening. The double lifting leaves are shown closed. */
  movableOpeningMeters?: number;
}
export type BridgeModelQuality = "high" | "low";
export const MODULAR_BRIDGE = {
  author: "Codex GPT-6.1 Sol",
  stoneSpanMeters: 12,
  timberSpanMeters: 6,
  deckThicknessMeters: 0.45,
  parapetHeightMeters: 0.95,
  note: "Repeatable masonry arch or timber trestle bays, vertical supports and bank abutments. The optional double lifting span is shown closed. Illustrative exterior model, in metres."
} as const;

class Parts {
  private parts: THREE.BufferGeometry[] = [];
  add(geometry: THREE.BufferGeometry, color: string) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const rgb = new THREE.Color(color),
      values = new Float32Array(flat.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    flat.setAttribute("color", new THREE.BufferAttribute(values, 3));
    this.parts.push(flat);
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  }
  beam(a: THREE.Vector3, b: THREE.Vector3, width: number, color: string) {
    const geometry = new THREE.BoxGeometry(width, a.distanceTo(b), width);
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize()
    );
    geometry.applyQuaternion(rotation).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geometry, color);
  }
  finish() {
    const geometry = mergeGeometries(this.parts)!;
    for (const part of this.parts) part.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
const stone = ["#A69B83", "#B8AD94", "#C8BDA6"];
const wood = "#786047",
  darkWood = "#514330";

function bayGeometry(
  material: BridgeStructure,
  length: number,
  width: number,
  pierWidth: number,
  rise: number,
  quality: BridgeModelQuality
) {
  const p = new Parts(),
    t = MODULAR_BRIDGE.deckThicknessMeters,
    lip = MODULAR_BRIDGE.parapetHeightMeters;
  p.box(0, -t / 2, 0, length, t, width, material === "stone" ? "#B9AF99" : wood);
  for (const side of [-1, 1]) {
    const z = side * (width / 2 - 0.15);
    if (material === "stone") p.box(0, lip / 2, z, length, lip, 0.3, stone[1]);
    else {
      for (const y of [0.45, 0.9]) p.box(0, y, z, length, 0.12, 0.12, wood);
      for (const x of [-length / 2 + 0.1, 0, length / 2 - 0.1]) p.box(x, lip / 2, z, 0.14, lip, 0.14, darkWood);
      p.box(0, -0.65, z, length, 0.35, 0.3, darkWood);
      if (quality === "high") {
        p.beam(new THREE.Vector3(-length / 2, -0.8, z), new THREE.Vector3(0, -1.6, z), 0.16, wood);
        p.beam(new THREE.Vector3(0, -1.6, z), new THREE.Vector3(length / 2, -0.8, z), 0.16, wood);
      }
    }
  }
  if (material === "stone") {
    const run = (length - pierWidth) / 2,
      ring = 0.35;
    const archRise = Math.min(rise, run * 0.9);
    const radius = (run * run + archRise * archRise) / (2 * archRise),
      crown = -t - ring;
    const centerY = crown - radius,
      spring = crown - archRise,
      theta = Math.asin(run / radius);
    const shape = new THREE.Shape();
    shape.moveTo(-length / 2, spring);
    shape.lineTo(-run, spring);
    shape.absarc(0, centerY, radius, Math.PI / 2 + theta, Math.PI / 2 - theta, true);
    shape.lineTo(length / 2, spring);
    shape.lineTo(length / 2, -t);
    shape.lineTo(-length / 2, -t);
    shape.closePath();
    p.add(
      new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 }).translate(
        0,
        0,
        -width / 2
      ),
      stone[0]
    );
    if (quality === "high") {
      const blocks = Math.max(9, Math.ceil((theta * radius) / 0.38));
      for (let i = 0; i < blocks; i++) {
        const a = Math.PI / 2 - theta + (2 * theta * i) / blocks + 0.003,
          b = Math.PI / 2 - theta + (2 * theta * (i + 1)) / blocks - 0.003;
        const wedge = new THREE.Shape();
        wedge.moveTo(Math.cos(a) * radius, centerY + Math.sin(a) * radius);
        wedge.absarc(0, centerY, radius, a, b, false);
        wedge.lineTo(Math.cos(b) * (radius + ring), centerY + Math.sin(b) * (radius + ring));
        wedge.absarc(0, centerY, radius + ring, b, a, true);
        wedge.closePath();
        for (const side of [-1, 1])
          p.add(
            new THREE.ExtrudeGeometry(wedge, { depth: 0.065, bevelEnabled: false, curveSegments: 2 }).translate(
              0,
              0,
              side > 0 ? width / 2 : -width / 2 - 0.065
            ),
            stone[i % 3]
          );
      }
    }
  }
  if (quality === "high") {
    const step = material === "stone" ? 0.65 : 0.24;
    for (let x = -length / 2 + step; x < length / 2 - 0.02; x += step) {
      p.box(x, 0.006, 0, 0.018, 0.012, width - 0.65, material === "stone" ? "#8A816E" : darkWood);
      if (material === "stone")
        for (const side of [-1, 1]) p.box(x, lip + 0.012, side * (width / 2 - 0.15), 0.018, 0.024, 0.29, "#8A816E");
    }
  }
  return p.finish();
}
function pierGeometry(width: number, pierWidth: number, quality: BridgeModelQuality) {
  const p = new Parts(),
    half = pierWidth / 2,
    z = width / 2;
  const shape = new THREE.Shape([
    new THREE.Vector2(-half, -z),
    new THREE.Vector2(0, -z - 0.8),
    new THREE.Vector2(half, -z),
    new THREE.Vector2(half, z),
    new THREE.Vector2(0, z + 0.8),
    new THREE.Vector2(-half, z)
  ]);
  p.add(
    new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2),
    quality === "high" ? stone[1] : stone[0]
  );
  return p.finish();
}
function timberBentGeometry(width: number, drop: number, quality: BridgeModelQuality) {
  const p = new Parts(),
    z = width / 2 - 0.45;
  p.box(0, -0.12, 0, 0.35, 0.24, width, wood);
  if (quality === "high")
    for (const side of [-1, 1])
      p.beam(new THREE.Vector3(0, -drop, side * z), new THREE.Vector3(0, -0.2, -side * z), 0.14, darkWood);
  return p.finish();
}
function timberPierGeometry() {
  const p = new Parts();
  p.add(new THREE.CylinderGeometry(0.16, 0.2, 1, 8).translate(0, 0.5, 0), wood);
  return p.finish();
}

/** Few draw calls even across a kilometre: identical bay / pier buffers are instanced. */
export function createModularBridge(
  spec: ModularBridgeSpec,
  quality: BridgeModelQuality = "high"
): CityStructureMeshes & { bayCount: number } {
  const end = spec.endDeckHeight ?? spec.deckHeight;
  if (
    ![spec.length, spec.width, spec.deckHeight, end, spec.waterHeight].every(Number.isFinite) ||
    spec.length < 2 ||
    spec.length > 20000 ||
    spec.width < 1 ||
    spec.width > 40 ||
    Math.min(spec.deckHeight, end) < 2
  )
    throw new RangeError("Invalid modular bridge dimensions");
  const preferred =
    spec.spanMeters ?? (spec.material === "stone" ? MODULAR_BRIDGE.stoneSpanMeters : MODULAR_BRIDGE.timberSpanMeters);
  if (!Number.isFinite(preferred) || preferred < 2 || preferred > 24)
    throw new RangeError("Bridge bays must be between 2 and 24 metres");
  const slope = (end - spec.deckHeight) / spec.length,
    tilt = Math.atan(slope),
    cosine = Math.cos(tilt);
  const deckAt = (x: number) => spec.deckHeight + (x + spec.length / 2) * slope;
  const regularCount = Math.max(1, Math.ceil(spec.length / preferred));
  const pitch = spec.length / regularCount;
  const pierWidth = Math.min(1.8, pitch * 0.24);
  const opening = spec.movableOpeningMeters ?? 0;
  if (!Number.isFinite(opening) || opening < 0 || opening > spec.length - 4)
    throw new RangeError("Invalid movable bridge opening");
  const bays: Array<{ a: number; b: number; lifting?: boolean }> = [];
  const fill = (a: number, b: number) => {
    const n = Math.max(1, Math.ceil((b - a) / preferred));
    for (let i = 0; i < n; i++) bays.push({ a: a + ((b - a) * i) / n, b: a + ((b - a) * (i + 1)) / n });
  };
  if (opening > 0) {
    const half = (opening + pierWidth) / 2;
    fill(-spec.length / 2, -half);
    bays.push({ a: -half, b: half, lifting: true });
    fill(half, spec.length / 2);
  } else fill(-spec.length / 2, spec.length / 2);
  const group = new THREE.Group();
  group.name = `modular-${spec.material}-bridge`;
  const pickables: THREE.Mesh[] = [],
    geometries = new Set<THREE.BufferGeometry>();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const instance = (name: string, geometry: THREE.BufferGeometry, matrices: THREE.Matrix4[]) => {
    geometries.add(geometry);
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    pickables.push(mesh);
  };
  const groups = new Map<string, { length: number; lifting: boolean; matrices: THREE.Matrix4[] }>();
  for (const bay of bays) {
    const length = (bay.b - bay.a) / cosine,
      key = `${bay.lifting ?? false}:${length.toFixed(8)}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { length, lifting: !!bay.lifting, matrices: [] };
      groups.set(key, entry);
    }
    const mid = (bay.a + bay.b) / 2;
    entry.matrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(mid, deckAt(mid), 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt),
        new THREE.Vector3(1, 1, 1)
      )
    );
  }
  for (const entry of groups.values()) {
    const available = Math.min(spec.deckHeight, end) - spec.waterHeight - MODULAR_BRIDGE.deckThicknessMeters - 0.5;
    const rise = Math.max(0.2, Math.min(entry.length * 0.24, available));
    const geometry = bayGeometry(
      entry.lifting ? "timber" : spec.material,
      entry.length,
      spec.width,
      pierWidth,
      rise,
      quality
    );
    instance(entry.lifting ? "bridge-lifting-deck" : "bridge-repeated-bays", geometry, entry.matrices);
  }
  const nodes = [bays[0].a, ...bays.map(b => b.b)];
  const supports: THREE.Matrix4[] = [];
  for (const [i, node] of nodes.entries()) {
    const endNode = i === 0 || i === nodes.length - 1;
    const x = endNode ? node + ((i === 0 ? 1 : -1) * pierWidth) / 4 : node;
    const top = deckAt(x) - MODULAR_BRIDGE.deckThicknessMeters;
    if (spec.material === "stone") {
      const courses = quality === "high" ? Math.max(1, Math.ceil(top / 0.5)) : 1;
      for (let course = 0; course < courses; course++)
        supports.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, (top * course) / courses, 0),
            new THREE.Quaternion(),
            new THREE.Vector3(endNode ? 0.5 : 1, top / courses - (quality === "high" ? 0.012 : 0), 1)
          )
        );
    } else {
      for (const z of [-spec.width / 2 + 0.45, spec.width / 2 - 0.45])
        supports.push(
          new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, top, 1))
        );
    }
  }
  instance(
    "bridge-repeated-supports",
    spec.material === "stone" ? pierGeometry(spec.width, pierWidth, quality) : timberPierGeometry(),
    supports
  );
  if (spec.material === "timber")
    instance(
      "bridge-repeated-trestles",
      timberBentGeometry(spec.width, Math.min(2.5, Math.min(spec.deckHeight, end) - 1), quality),
      nodes.map(x => new THREE.Matrix4().makeTranslation(x, deckAt(x) - MODULAR_BRIDGE.deckThicknessMeters, 0))
    );
  if (opening > 0) {
    const p = new Parts();
    const half = (opening + pierWidth) / 2;
    for (const side of [-1, 1])
      for (const z of [-spec.width / 2 + 0.3, spec.width / 2 - 0.3]) {
        const x = side * half,
          y = deckAt(x);
        p.box(x, y + 1.8, z, 0.22, 3.6, 0.22, darkWood);
        if (quality === "high") {
          p.beam(
            new THREE.Vector3(x, y + 3.4, z),
            new THREE.Vector3(x - side * half * 0.6, deckAt(x - side * half * 0.6) + 0.12, z),
            0.04,
            "#4B4E48"
          );
          p.box(x + side * 0.5, y + 1, z, 0.7, 1.2, 0.55, stone[0]);
        }
      }
    instance("bridge-lifting-gear", p.finish(), [new THREE.Matrix4()]);
  }
  return {
    group,
    pickables,
    bayCount: bays.length,
    dispose() {
      for (const mesh of pickables) if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    }
  };
}
