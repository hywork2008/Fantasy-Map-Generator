import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { BridgeModelQuality } from "./modularBridge";

export interface SuspensionBridgeSpec {
  /** Clear bank-to-bank span along local X, in metres. Anchors extend beyond both banks. */
  length: number;
  width: number;
  /** Walking surface at the banks, relative to the foundation datum Y = 0. */
  deckHeight: number;
  endDeckHeight?: number;
  /** Water datum for clearance validation only; the model contains no river or terrain. */
  waterHeight: number;
}

export const SUSPENSION_BRIDGE = {
  author: "Codex GPT-6.1 Sol",
  note: "Illustrative timber-deck rope suspension bridge for a high riverbank or gorge. Paired main ropes, vertical hangers, braced timber portals on bank masonry, and backstays secured to outboard anchor blocks. The stiffened deck remains straight in plan; no piers occupy the clear span. High detail adds laid-rope strands, plank grain, iron straps, bolts and rope lashings. Metre units; water and terrain omitted."
} as const;

/** Material batches keep the detailed, individually fitted components to four draw calls. */
class Assembly {
  private readonly batches = new Map<string, THREE.BufferGeometry[]>();
  add(geometry: THREE.BufferGeometry, color: string) {
    const batch = this.batches.get(color) ?? [];
    batch.push(geometry);
    this.batches.set(color, batch);
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  }
  beam(a: THREE.Vector3, b: THREE.Vector3, width: number, color: string) {
    const geometry = new THREE.BoxGeometry(width, a.distanceTo(b), width);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    );
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geometry, color);
  }
  rope(points: THREE.Vector3[], radius: number, color: string, sides = 7) {
    const path = new THREE.CatmullRomCurve3(points);
    this.add(new THREE.TubeGeometry(path, Math.max(1, points.length - 1), radius, sides, false), color);
  }
  finish(): CityStructureMeshes {
    const group = new THREE.Group();
    group.name = "timber-rope-suspension-bridge";
    const pickables: THREE.Mesh[] = [];
    const names: Record<string, string> = {
      [TIMBER]: "suspension-timber",
      [IRON]: "suspension-ironwork",
      [ROPE]: "suspension-ropes",
      [STONE]: "suspension-bank-masonry"
    };
    for (const [color, parts] of this.batches) {
      const geometry = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: color === IRON ? 0.5 : 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = names[color];
      mesh.castShadow = mesh.receiveShadow = true;
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
}
const TIMBER = "#96704b",
  IRON = "#343b39",
  ROPE = "#bba47a",
  STONE = "#9d998b";
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A bank-supported assembly; no whole-model scaling and no supports inside the river span. */
export function createSuspensionBridge(
  spec: SuspensionBridgeSpec,
  quality: BridgeModelQuality = "high"
): CityStructureMeshes {
  const { length, width, deckHeight, waterHeight } = spec;
  const end = spec.endDeckHeight ?? deckHeight;
  if (
    ![length, width, deckHeight, end, waterHeight].every(Number.isFinite) ||
    length < 12 ||
    length > 240 ||
    width < 1.5 ||
    width > 8 ||
    Math.min(deckHeight, end) < 1 ||
    Math.min(deckHeight, end) - waterHeight < 0.7 ||
    Math.abs(end - deckHeight) / length > 0.15
  )
    throw new RangeError("Invalid suspension bridge dimensions");
  const p = new Assembly(),
    high = quality === "high";
  const half = length / 2,
    edge = width / 2 + 0.18;
  const deckAt = (x: number) => deckHeight + ((x + half) / length) * (end - deckHeight);
  const towerRise = Math.max(4.8, length * 0.1),
    anchorRun = Math.max(4, towerRise * 0.75);
  const cableAt = (x: number) => deckAt(x) + 1.6 + (towerRise - 1.6) * (x / half) ** 2;
  // Fit boards to the exact span; their upper faces follow the bank-to-bank grade.
  const boards = Math.ceil(length / (high ? 0.28 : 1.5)),
    pitch = length / boards;
  const slope = (end - deckHeight) / length;
  for (let i = 0; i < boards; i++) {
    const x = -half + (i + 0.5) * pitch;
    const board = new THREE.BoxGeometry(pitch - 0.012, 0.16, width + 0.22);
    board.rotateZ(Math.atan(slope)).translate(x, deckAt(x) - 0.08, 0);
    p.add(board, TIMBER);
    if (high) {
      for (const z of [-width / 2 + 0.2, width / 2 - 0.2])
        p.box(x, deckAt(x) + slope * (pitch * 0.17) + 0.006, z, 0.038, 0.012, 0.038, IRON);
      // Fine inset-looking grain marks, with deterministic variation between boards.
      for (let grain = 0; grain < 2; grain++)
        p.box(
          x + (grain ? 0.06 : -0.06),
          deckAt(x) + 0.002,
          Math.sin(i * 2.4 + grain) * width * 0.12,
          0.007,
          0.004,
          width * (0.35 + (i % 3) * 0.07),
          IRON
        );
    }
  }
  for (const side of [-1, 1]) {
    const z = side * edge;
    p.beam(v(-half, deckAt(-half) - 0.32, z), v(half, deckAt(half) - 0.32, z), 0.3, TIMBER);
    for (const rail of [0.55, 1.1])
      p.rope([v(-half, deckAt(-half) + rail, z), v(half, deckAt(half) + rail, z)], 0.035, ROPE);
    const steps = Math.ceil(length / (high ? 0.45 : 2));
    const cable = Array.from({ length: steps + 1 }, (_, i) => {
      const x = -half + (length * i) / steps;
      return v(x, cableAt(x), z);
    });
    p.rope(cable, 0.105, ROPE, high ? 10 : 6);
    if (high) {
      // Three laid strands remain visible along the main rope at close viewing distances.
      const strandSteps = Math.ceil(length / 0.09);
      for (let strand = 0; strand < 3; strand++) {
        const points = Array.from({ length: strandSteps + 1 }, (_, i) => {
          const x = -half + (length * i) / strandSteps,
            angle = (x + half) * 14 + (strand * Math.PI * 2) / 3;
          return v(x, cableAt(x) + Math.cos(angle) * 0.09, z + Math.sin(angle) * 0.09);
        });
        p.rope(points, 0.025, ROPE, 4);
      }
    }
    const hangers = Math.ceil(length / 1.6);
    for (let i = 0; i <= hangers; i++) {
      const x = -half + (length * i) / hangers,
        y = deckAt(x);
      p.rope([v(x, y - 0.38, z), v(x, cableAt(x), z)], 0.033, ROPE, high ? 7 : 4);
      if (high) {
        p.box(x, y - 0.3, z, 0.12, 0.48, 0.34, IRON);
        for (const height of [y + 1.1, cableAt(x) - 0.12])
          for (let turn = 0; turn < 3; turn++)
            p.add(
              new THREE.TorusGeometry(0.065, 0.014, 4, 8).rotateX(Math.PI / 2).translate(x, height + turn * 0.03, z),
              ROPE
            );
      }
    }
  }
  const panels = Math.ceil(length / 3.2);
  for (let i = 0; i <= panels; i++) {
    const x = -half + (length * i) / panels;
    p.box(x, deckAt(x) - 0.23, 0, 0.18, 0.18, width + 0.8, TIMBER);
    if (high && i < panels) {
      const next = -half + (length * (i + 1)) / panels;
      for (const side of [-1, 1]) {
        p.beam(v(x, deckAt(x) - 0.55, side * edge), v(next, deckAt(next) - 0.55, -side * edge), 0.1, TIMBER);
        p.beam(v(x, deckAt(x) - 0.4, side * edge), v(next, deckAt(next) - 0.4, side * edge), 0.12, TIMBER);
      }
    }
  }
  // Both portals and their backstays sit on the banks, outside the clear water span.
  for (const side of [-1, 1]) {
    const x = side * half,
      y = deckAt(x),
      anchorX = x + side * anchorRun;
    p.box(x + side * 0.6, (y - 0.35) / 2, 0, 1.2, y - 0.35, width + 1.7, STONE);
    for (const z of [-edge, edge]) {
      p.box(x + side * 0.18, y + towerRise / 2 - 0.2, z, 0.5, towerRise + 0.4, 0.5, TIMBER);
      p.box(x + side * 0.18, y + towerRise + 0.2, z, 0.72, 0.18, 0.72, TIMBER);
      p.rope([v(x, y + towerRise, z), v(anchorX, 0.75, z)], 0.105, ROPE, high ? 10 : 6);
      p.box(anchorX, 0.45, z, 1.6, 0.9, 1.5, STONE);
      p.box(anchorX, 0.77, z, 1.65, 0.12, 0.25, IRON);
      p.beam(v(x, y + 2, z), v(x + side * 2.3, y - 0.3, z), 0.25, TIMBER);
      p.box(x + side * 2.3, (y - 0.3) / 2, z, 0.7, y - 0.3, 0.8, STONE);
      if (high) {
        for (const h of [0.15, towerRise - 0.45]) p.box(x + side * 0.18, y + h, z, 0.55, 0.18, 0.55, IRON);
        // Separate stone courses and staggered joints on the outer abutment face.
        for (let h = 0.35; h < y - 0.35; h += 0.38) p.box(x + side * 1.205, h, z, 0.012, 0.016, 1.4, IRON);
      }
    }
    p.box(x + side * 0.18, y + towerRise - 0.55, 0, 0.42, 0.48, width + 1.05, TIMBER);
    for (const sign of [-1, 1])
      p.beam(
        v(x + side * 0.18, y + towerRise - 1.9, sign * edge),
        v(x + side * 0.18, y + towerRise - 0.55, sign * Math.max(0, edge - 1.2)),
        0.2,
        TIMBER
      );
  }
  return p.finish();
}
