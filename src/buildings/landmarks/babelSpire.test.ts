import * as THREE from "three";
import { expect, it } from "vitest";
import { generateTowerBranches, model, SPIRE_LEVEL_HEIGHTS } from "./babelSpire";
import { checkLandmark } from "./landmarkTestSupport";

checkLandmark(model, assembly => {
  const shaft = assembly.pickables.filter(mesh => mesh.name.startsWith("shaft-level-"));
  expect(shaft).toHaveLength(28);
  for (const wall of shaft) {
    const size = new THREE.Box3().setFromObject(wall).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(45.6);
    expect(size.z).toBeCloseTo(45.6);
  }
  const branches = generateTowerBranches(model.towerGeneration!.seed);
  expect(branches).toHaveLength(3);
  for (const [i, branch] of branches.entries()) {
    const corridor = assembly.pickables.find(mesh => mesh.name === `corridor-${i}`)!;
    const satellite = assembly.pickables.find(mesh => mesh.name === `satellite-${i}`)!;
    const deck = new THREE.Box3().setFromObject(corridor).max.y;
    const bounds = new THREE.Box3().setFromObject(satellite);
    const height = SPIRE_LEVEL_HEIGHTS[branch.level];
    expect(bounds.max.y - deck).toBeCloseTo(height);
    expect(deck - bounds.min.y).toBeCloseTo(height * 0.5);
    expect(corridor.scale.x).toBeCloseTo(1.2);
    const end = corridor.localToWorld(new THREE.Vector3(0, 0.5, 0.5));
    expect(end.x).toBeCloseTo(satellite.position.x);
    expect(end.z).toBeCloseTo(satellite.position.z);
    expect(end.y).toBeCloseTo(deck);
    const start = corridor.localToWorld(new THREE.Vector3(0, 0.5, -0.5));
    expect(Math.hypot(start.x, start.z)).toBeLessThan(22.8);
    // Both edges of the 1.2 m corridor must lead into the painted opening,
    // rather than an arbitrary solid part of the polygonal facade.
    const outward = new THREE.Vector3(Math.sin(branch.angle), 0, Math.cos(branch.angle));
    const tangent = new THREE.Vector3(Math.cos(branch.angle), 0, -Math.sin(branch.angle));
    for (const offset of [-0.6, 0, 0.6]) {
      const origin = outward.clone().multiplyScalar(25).addScaledVector(tangent, offset);
      origin.y = deck + 1.4;
      const ray = new THREE.Raycaster(origin, outward.clone().negate(), 0, 5);
      expect(ray.intersectObjects(assembly.pickables)[0]?.object.name).toBe(`shaft-entrances-${branch.level}`);
    }
  }
});

it("adjusts terrace projection without rerolling branches, and keeps each corridor attached", () => {
  const generation = model.towerGeneration!;
  const saved = generation.overhang;
  const assemblies = [];
  try {
    for (const projection of [0, 12]) {
      generation.overhang = projection;
      const assembly = model.create();
      assemblies.push(assembly);
      const terrace = assembly.pickables.find(mesh => mesh.name === "terrace-0")!;
      expect(new THREE.Box3().setFromObject(terrace).getSize(new THREE.Vector3()).x).toBeCloseTo(45.6 + projection * 2);
      const branches = generateTowerBranches(generation.seed);
      for (const [i, branch] of branches.entries()) {
        const satellite = assembly.pickables.find(mesh => mesh.name === `satellite-${i}`)!;
        const distance = Math.hypot(satellite.position.x, satellite.position.z);
        expect(distance - branch.radius - (22.8 + projection)).toBeCloseTo(branch.length);
      }
    }
    expect(assemblies[0].group.userData.branches).toEqual(assemblies[1].group.userData.branches);
  } finally {
    generation.overhang = saved;
    for (const assembly of assemblies) assembly.dispose();
  }
});

it("reproducibly generates zero through three corridors with distinct floors and variable lengths", () => {
  for (const [seed, count] of [
    ["spire-2", 0],
    ["babel", 1],
    ["satellite", 2],
    ["three", 3]
  ] as const) {
    const branches = generateTowerBranches(seed);
    expect(branches).toHaveLength(count);
    expect(generateTowerBranches(seed)).toEqual(branches);
    expect(new Set(branches.map(branch => branch.level)).size).toBe(count);
    for (const branch of branches) {
      expect(branch.length).toBeGreaterThanOrEqual(12);
      expect(branch.length).toBeLessThan(70);
      expect(branch.level).toBeGreaterThan(0);
      expect(branch.level).toBeLessThan(27);
    }
  }
});
