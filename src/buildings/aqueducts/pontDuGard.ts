import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

/** Idealized, repeatable bays, in meters; not a surveyed reconstruction. */
export const PONT_DU_GARD = {
  author: "Codex GPT-6.1 Sol",
  name: "Pont du Gard",
  bays: 6,
  pitch: 24,
  height: 49,
  tiers: [
    { count: 6, pitch: 24, base: 0, height: 21, radius: 9.5, depth: 6 },
    { count: 6, pitch: 24, base: 21, height: 20, radius: 9.8, depth: 4.5 },
    { count: 24, pitch: 6, base: 41, height: 6, radius: 2.15, depth: 3 }
  ]
} as const;

export function createPontDuGard(bays: number = PONT_DU_GARD.bays): CityStructureMeshes {
  if (!Number.isInteger(bays) || bays < 1 || bays > 24) throw new Error("Aqueduct bays must be from 1 to 24.");
  const group = new THREE.Group();
  group.name = "pont-du-gard";
  const pickables: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const stone = new THREE.MeshLambertMaterial({ color: 0xc9b58c });
  const trim = new THREE.MeshLambertMaterial({ color: 0xd9c7a3 });
  const width = bays * PONT_DU_GARD.pitch;
  function repeat(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, pitch: number, y: number) {
    geometries.push(geometry);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(-width / 2 + (i + 0.5) * pitch, y, 0);
      group.add(mesh);
      pickables.push(mesh);
    }
  }
  for (const tier of PONT_DU_GARD.tiers) {
    const { pitch, height, radius, depth } = tier;
    const spring = height - radius - 1.5;
    // A single concave outline leaves the arch open through the entire depth.
    const shape = new THREE.Shape();
    shape.moveTo(-pitch / 2, 0);
    shape.lineTo(-radius, 0);
    shape.lineTo(-radius, spring);
    shape.absarc(0, spring, radius, Math.PI, 0, true);
    shape.lineTo(radius, 0);
    shape.lineTo(pitch / 2, 0);
    shape.lineTo(pitch / 2, height);
    shape.lineTo(-pitch / 2, height);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    geometry.translate(0, 0, -depth / 2);
    const count = bays * (tier.count / PONT_DU_GARD.bays);
    repeat(geometry, stone, count, pitch, tier.base);
    repeat(new THREE.BoxGeometry(pitch, 0.45, depth + 0.35), trim, count, pitch, tier.base + height - 0.225);
  }
  // A continuous open specus: floor and two intact parapets, shared per bay.
  repeat(new THREE.BoxGeometry(24, 0.4, 3), trim, bays, 24, 47.2);
  const parapet = new THREE.BoxGeometry(24, 1.6, 0.45);
  for (const z of [-1.275, 1.275]) {
    const first = pickables.length;
    repeat(parapet, stone, bays, 24, 48.2);
    for (const mesh of pickables.slice(first)) mesh.position.z = z;
  }
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of new Set(geometries)) geometry.dispose();
      stone.dispose();
      trim.dispose();
    }
  };
}

export function pontDuGardElevation(): string {
  const width = PONT_DU_GARD.bays * PONT_DU_GARD.pitch;
  const paths = PONT_DU_GARD.tiers.flatMap(tier =>
    Array.from({ length: tier.count }, (_, i) => {
      const x = i * tier.pitch;
      const center = x + tier.pitch / 2;
      const spring = tier.base + tier.height - tier.radius - 1.5;
      return `<path d="M${x},${-tier.base} H${center - tier.radius} V${-spring} A${tier.radius},${tier.radius} 0 0 1 ${center + tier.radius},${-spring} V${-tier.base} H${x + tier.pitch} V${-tier.base - tier.height} H${x} Z"/>`;
    })
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -52 ${width + 6} 55"><g fill="#c9b58c" stroke="#827358" stroke-width="0.15">${paths.join("")}<rect x="0" y="-49" width="${width}" height="2"/></g></svg>`;
}
