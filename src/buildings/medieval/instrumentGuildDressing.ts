import * as THREE from "three";
import { ModelKit } from "./modelKit";
import { addCraftBench } from "./workshopDetailKit";

/** Pear-shaped bowl and pierced soundboard; local +Y is the playing face. */
export function createHighLute() {
  const k = new ModelKit("lute-high");
  const outline = (a: number, scale = 1) =>
    new THREE.Vector3(Math.sin(a) * 0.29 * (1 + 0.25 * Math.cos(a)) * scale, 0, Math.cos(a) * 0.4 * scale);
  const positions: number[] = [];
  const point = (a: number, ring: number) => {
    const t = (ring * Math.PI) / 12,
      p = outline(a, Math.cos(t));
    p.y = 0.14 - Math.sin(t) * 0.24;
    return p;
  };
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (let ring = 0; ring < 5; ring++)
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        b = ((i + 1) * Math.PI) / 16;
      triangle(point(a, ring), point(a, ring + 1), point(b, ring));
      triangle(point(b, ring), point(a, ring + 1), point(b, ring + 1));
    }
  for (let i = 0; i < 32; i++)
    triangle(point((i * Math.PI) / 16, 5), new THREE.Vector3(0, -0.1, 0), point(((i + 1) * Math.PI) / 16, 5));
  const bowl = new THREE.BufferGeometry();
  bowl.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  bowl.computeVertexNormals();
  k.add("lute-bowl", bowl, "oak");
  const shape = new THREE.Shape(
    Array.from({ length: 32 }, (_, i) => {
      const p = outline((i * Math.PI) / 16);
      return new THREE.Vector2(p.x, -p.z);
    })
  );
  const hole = new THREE.Path();
  hole.absarc(0, 0.09, 0.066, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const face = new THREE.ShapeGeometry(shape, 16);
  face.rotateX(-Math.PI / 2);
  face.translate(0, 0.14, 0);
  k.add("lute-pierced-soundboard", face, "straw");
  k.ring("soundhole-binding", [0, 0.141, -0.09], 0.073, 0.007, "wood");
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const points = Array.from({ length: 7 }, (_, ring) => {
      const p = point(a, ring);
      return [p.x, p.y, p.z] as const;
    });
    for (let j = 0; j < points.length - 1; j++) k.beam("bowl-rib-joint", points[j], points[j + 1], 0.005, "wood");
  }
  k.box("lute-neck", [0, 0.085, -0.59], [0.11, 0.11, 0.55], "oak");
  k.box("lute-fingerboard", [0, 0.15, -0.59], [0.115, 0.02, 0.55], "dark");
  k.box("lute-bridge", [0, 0.16, 0.2], [0.21, 0.04, 0.045], "dark");
  k.box("lute-nut", [0, 0.168, -0.84], [0.12, 0.016, 0.026], "white");
  k.beam("lute-pegbox", [0, 0.11, -0.85], [0, -0.035, -1.01], 0.105, "oak");
  for (let i = 0; i < 6; i++) {
    const z = -0.93 - i * 0.012,
      y = 0.11 + (z + 0.85) * 0.90625;
    k.beam("lute-tuning-peg", [-0.09, y, z], [0.09, y, z], 0.018, "wood", true);
    k.beam("lute-course", [-0.04 + i * 0.016, 0.18, 0.2], [-0.04 + i * 0.016, 0.176, -0.84], 0.0025, "cloth");
  }
  for (let i = 1; i <= 7; i++)
    k.box("tied-fret", [0, 0.163, -0.84 + (1 - 2 ** (-i / 12)) * 1.04], [0.12, 0.006, 0.008], "cloth");
  return k.finish();
}

export function createInstrumentGuildDressing() {
  const k = new ModelKit("instrument-guild-trade-dressing");
  k.box("guild-trade-plaque", [0, 6.12, 3.64], [1.4, 0.65, 0.12], "oak");
  const emblem = createHighLute();
  emblem.group.rotation.x = Math.PI / 2;
  k.attach(emblem, [0, 6.03, 3.72], 0.39);
  for (const x of [-3, 3]) addCraftBench(k, x, -0.65, 2.5, 1.5, 0.95);
  for (const x of [-3.65, -2.95, -2.25]) {
    k.box("lute-rest-pad", [x, 0.97, -0.55], [0.52, 0.04, 0.62], "leather");
    k.attach(createHighLute(), [x, 1.08, -0.55]);
  }
  k.box("soundboard-blank", [2.55, 0.97, -0.65], [0.7, 0.04, 0.95], "straw");
  for (const x of [3.15, 3.35, 3.55]) k.box("neck-stock", [x, 1.015, -0.7], [0.14, 0.13, 1], "wood");
  k.beam("measuring-rule", [2, 0.968, -0.01], [3.65, 0.968, -0.01], 0.03, "oak");
  for (let i = 0; i < 12; i++) k.box("rule-division", [2.05 + i * 0.13, 0.985, -0.01], [0.007, 0.005, 0.025], "dark");
  k.box("small-plane-sole", [3.92, 0.99, -0.7], [0.22, 0.08, 0.46], "oak");
  k.box("small-plane-iron", [3.92, 1.08, -0.7], [0.17, 0.12, 0.035], "iron");
  return k.finish();
}

/** Floor-standing harp: every string terminates in the neck and sloping soundbox. */
export function createHighHarpDisplay() {
  const k = new ModelKit("harp-display-high"),
    z = 1.45;
  k.box("harp-foot", [3, 0.08, z], [1.75, 0.16, 0.65], "oak");
  k.beam("harp-pillar", [2.25, 0.12, z], [2.25, 2.38, z], 0.13, "oak");
  k.beam("harp-neck", [2.25, 2.38, z], [3.7, 1.9, z], 0.16, "wood");
  k.beam("harp-soundbox", [2.25, 0.18, z], [3.7, 1.9, z], 0.22, "wood");
  k.beam("harp-string-rib", [2.25, 0.18, z + 0.11], [3.7, 1.9, z + 0.11], 0.035, "dark");
  for (let i = 1; i <= 14; i++) {
    const t = i / 15,
      x = 2.25 + t * 1.45;
    k.beam("harp-string", [x, 0.18 + t * 1.72, z + 0.11], [x, 2.38 - t * 0.48, z + 0.06], 0.004, "cloth");
    k.beam("harp-tuning-pin", [x, 2.38 - t * 0.48, z - 0.1], [x, 2.38 - t * 0.48, z + 0.12], 0.022, "iron", true);
    k.box("harp-string-anchor", [x, 0.18 + t * 1.72, z + 0.13], [0.028, 0.04, 0.04], "white");
  }
  for (const y of [0.27, 2.27]) k.box("pillar-collar", [2.25, y, z], [0.2, 0.1, 0.2], "wood");
  return k.finish();
}
