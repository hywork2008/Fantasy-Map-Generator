import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { ModelKit, type Position } from "./modelKit";
import { createTimberLadder } from "./timberLadder";

/** Geometry-only exterior study; this retains the original town prop's fitted envelope. */
function timber(k: ModelKit, name: string, a: Position, b: Position, width: number) {
  const h = width / 2,
    c = width * 0.1;
  const section = new THREE.Shape([
    new THREE.Vector2(-h + c, -h),
    new THREE.Vector2(h - c, -h),
    new THREE.Vector2(h, -h + c),
    new THREE.Vector2(h, h - c),
    new THREE.Vector2(h - c, h),
    new THREE.Vector2(-h + c, h),
    new THREE.Vector2(-h, h - c),
    new THREE.Vector2(-h, -h + c)
  ]);
  const start = new THREE.Vector3(...a),
    delta = new THREE.Vector3(...b).sub(start);
  const mesh = k.add(name, new THREE.ExtrudeGeometry(section, { depth: delta.length(), bevelEnabled: false }), "oak");
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
}

function foundation() {
  const k = new ModelKit("gallows-foundation-high");
  for (const x of [-2.4, 2.4]) {
    // Continuous masonry accepts overlapping posts instead of a bespoke post-sized cutout.
    k.box("continuous-stone-footing", [x, 0.12, 0], [1.05, 0.24, 1.05], "stone");
    for (let row = 0; row < 2; row++)
      for (const side of [-1, 1])
        k.box("footing-ashlar-course", [x + side * 0.213, 0.3 + row * 0.12, 0], [0.418, 0.115, 0.85], "stone");
    k.box("footing-capstone", [x, 0.51, 0], [0.94, 0.08, 0.94], "stone");
    for (const z of [-1.1, 1.1]) k.box("stay-stone-pad", [x, 0.12, z], [0.72, 0.24, 0.65], "stone");
  }
  return k.finish();
}

function frame() {
  const k = new ModelKit("gallows-frame-high");
  for (const x of [-2.4, 2.4]) {
    timber(k, "chamfered-upright", [x, 0.38, 0], [x, 4.5, 0], 0.36);
    timber(k, "pegged-knee-brace", [x, 3.15, 0], [x - Math.sign(x) * 1.05, 4.28, 0], 0.2);
    for (const z of [-1.1, 1.1]) timber(k, "transverse-timber-stay", [x, 0.22, z], [x, 2.85, 0], 0.18);
    for (const z of [-0.195, 0.195]) {
      for (const [xx, y] of [
        [x, 3.2],
        [x - Math.sign(x) * 0.96, 4.2]
      ]) {
        k.beam("brace-joint-peg", [xx, y, z - 0.025], [xx, y, z + 0.025], 0.055, "wood", true);
      }
      for (const u of [-0.07, 0.07])
        k.beam("upright-split-grain", [x + u, 0.62, z], [x + u + 0.008, 4.03, z], 0.006, "wood");
    }
    for (const y of [0.64, 4.04])
      for (const z of [-0.19, 0.19]) {
        k.box("upright-iron-strap", [x, y, z], [0.4, 0.065, 0.035], "iron");
        for (const u of [-0.13, 0.13])
          k.beam("strap-pin", [x + u, y, z - 0.03], [x + u, y, z + 0.03], 0.04, "iron", true);
      }
  }
  timber(k, "continuous-crossbeam", [-2.8, 4.3, 0], [2.8, 4.3, 0], 0.42);
  for (const z of [-0.215, 0.215])
    for (const y of [4.22, 4.35]) k.beam("crossbeam-grain", [-2.73, y, z], [2.73, y + 0.012, z], 0.006, "wood");
  for (const x of [-2.4, 2.4]) {
    k.box("beam-top-strap", [x, 4.525, 0], [0.12, 0.035, 0.45], "iron");
    for (const z of [-0.23, 0.23]) k.box("beam-strap-return", [x, 4.32, z], [0.12, 0.42, 0.035], "iron");
  }
  return k.finish();
}

function ropes() {
  const k = new ModelKit("gallows-rope-dressing-high");
  for (const x of [-1, 1]) {
    k.tube(
      "beam-rope-drape",
      [
        [x, 4.08, -0.23],
        [x, 4.53, -0.23],
        [x, 4.53, 0.23],
        [x, 4.08, 0.23]
      ],
      0.023,
      "cloth"
    );
    k.beam("suspended-rope-core", [x, 4.08, 0.24], [x, 2.7, 0.24], 0.035, "cloth", true);
    for (let strand = 0; strand < 3; strand++) {
      const points: Position[] = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24,
          a = t * Math.PI * 12 + (strand * Math.PI * 2) / 3;
        return [x + Math.cos(a) * 0.016, 2.75 + t * 1.3, 0.24 + Math.sin(a) * 0.016];
      });
      k.add(
        "rope-strand-relief",
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))),
          48,
          0.007,
          4,
          false
        ),
        "cloth"
      );
    }
    const loop = k.ring("empty-rope-loop", [x, 2.35, 0.24], 0.22, 0.024, "cloth", true);
    loop.scale.y = 1.6;
    for (const y of [2.76, 2.81, 2.86]) {
      const collar = k.add("rope-collar-relief", new THREE.TorusGeometry(0.034, 0.014, 4, 12), "cloth");
      collar.position.set(x, y, 0.24);
      collar.rotation.x = Math.PI / 2;
    }
  }
  return k.finish();
}

export function gallowsPartFactories(): readonly ModelPartFactory[] {
  return [
    { id: "foundation", create: foundation },
    { id: "frame", create: frame },
    { id: "rope-dressing", create: ropes },
    {
      id: "access-ladder",
      create: () => createTimberLadder({ foot: [1.875, 0.1, 2.3], head: [1.875, 4.22, 0.17], width: 0.6, rungs: 12 })
    }
  ].map(({ id, create }) => ({
    id: `permanent-town-gallows:${id}`,
    role: id,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create
  }));
}

export function assembleGallowsParts(parts: readonly ModelPartFactory[]) {
  return compactModel(createModelAssembly("permanent-town-gallows-high", parts), { mergeEquivalentMaterials: true });
}

export const createHighGallows = () => assembleGallowsParts(gallowsPartFactories());
