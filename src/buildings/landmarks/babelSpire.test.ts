import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
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

checkLandmark(model.ultraDetail!, assembly => {
  expect(assembly.group.userData.quality).toBe("ultra");
  const metrics = collectModelMetrics(assembly.group);
  expect(metrics.triangles).toBeLessThan(200_000);
  expect(metrics.meshes).toBeLessThan(140);
  const names = new Set(assembly.pickables.map(mesh => mesh.name));
  expect(names.has("gothic-archivolts")).toBe(true);
  expect(names.has("gothic-quatrefoils")).toBe(true);
  expect(names.has("summit-merlon")).toBe(true);
  const roof = SPIRE_LEVEL_HEIGHTS.reduce((sum, h) => sum + h, 0);
  // A downward ray inside the well reaches a tread below the roof, not a solid cap.
  const ray = new THREE.Raycaster(new THREE.Vector3(0, roof + 10, 0), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(assembly.pickables)[0];
  expect(hit.object.name).toBe("summit-stair-tread");
  expect(hit.point.y).toBeLessThan(roof - 1);
  const shaft = assembly.pickables.find(mesh => mesh.name === "shaft-level-0")!;
  const material = shaft.material as THREE.MeshStandardMaterial;
  expect(material.map?.generateMipmaps).toBe(true);
  expect(material.map?.wrapS).toBe(THREE.RepeatWrapping);
  for (const [i, branch] of (assembly.group.userData.branches as ReturnType<typeof generateTowerBranches>).entries()) {
    const haunches = assembly.pickables.filter(
      mesh => mesh.name.startsWith(`corridor-${i}-`) && mesh.name.endsWith("-haunch")
    );
    expect(haunches).toHaveLength(2);
    // Both haunches stop near the landings, leaving the corridor midpoint unsupported.
    const start = 22.8 + model.towerGeneration!.overhang;
    const mid = start + branch.length / 2;
    const point = new THREE.Vector3(Math.sin(branch.angle) * mid, 0, Math.cos(branch.angle) * mid);
    for (const mesh of haunches) {
      const bounds = new THREE.Box3().setFromObject(mesh);
      point.y = bounds.getCenter(new THREE.Vector3()).y;
      expect(bounds.containsPoint(point)).toBe(false);
    }
  }
});

it("reproducibly selects all three satellite rooftop forms independently of terrace projection", () => {
  const generation = model.towerGeneration!;
  const savedSeed = generation.seed;
  const savedOverhang = generation.overhang;
  const seen = new Set<string>();
  try {
    for (const seed of ["three", "satellite", "babel"]) {
      generation.seed = seed;
      const assembly = model.ultraDetail!.create();
      const styles = assembly.group.userData.satelliteRoofStyles as string[];
      for (const style of styles) seen.add(style);
      for (const [i, style] of styles.entries()) {
        expect(assembly.pickables.some(mesh => mesh.name === `satellite-${i}-merlon`)).toBe(style !== "cone");
        expect(assembly.pickables.some(mesh => mesh.name === `satellite-${i}-conical-roof`)).toBe(
          style !== "battlements"
        );
      }
      assembly.dispose();
      generation.overhang = 12;
      const repeat = model.ultraDetail!.create();
      expect(repeat.group.userData.satelliteRoofStyles).toEqual(styles);
      repeat.dispose();
      generation.overhang = savedOverhang;
    }
    expect([...seen].sort()).toEqual(["battlements", "both", "cone"]);
  } finally {
    generation.seed = savedSeed;
    generation.overhang = savedOverhang;
  }
});
