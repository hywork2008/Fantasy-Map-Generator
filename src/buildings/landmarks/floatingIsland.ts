import * as THREE from "three";
import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { generateIslandTerrain } from "./terrain/floatingIslandTerrain";

const generation = {
  seed: "floating-island-1",
  surface: "terrain" as "terrain" | "flat",
  regenerate() {
    this.seed = crypto.randomUUID();
  }
};

export const model: LandmarkModel = {
  id: "floating-island",
  task: "I03",
  name: "Floating island (FMG mountain terrain)",
  style: "Imaginary",
  state: "Random inverted mountain rock foundation joined to a flat or rolling grass surface",
  size: [280, 260, 230],
  dimensions:
    "Variable outline, approximately 190–260 m wide. Inverted mountain depth 110–170 m, rock rim 8 m, upper relief 0–43 m.",
  note:
    "FMG Hill-style neighbor flood-fill with power decay and cell jitter forms one or two dominant peaks, inverted below the island. " +
    "The grass surface shares the rock footprint and closes the foundation along an 8 m rim. " +
    "Regenerate rerolls the outline, lower mountains and upper hills together. The flat option preserves a level upper surface. " +
    "Seeded generation is independent of FMG world state. Vegetation, buildings, waterfalls and clouds are omitted.",
  sources: [
    {
      title: "Floating island visual reference",
      url: "https://img.magnific.com/premium-photo/flying-land-with-beautiful-landscape-green-grass-3d_1029679-8255.jpg"
    }
  ],
  terrainGeneration: generation,
  floating: true,
  create() {
    const terrain = generateIslandTerrain(generation.seed, generation.surface);
    const k = new ArchitectureKit(this.id);
    const bottom = terrain.points.map(
      ([x, z], i) => new THREE.Vector3(x, terrain.seamHeight - 8 - terrain.depths[i], z)
    );
    const top = terrain.points.map(([x, z], i) => new THREE.Vector3(x, terrain.seamHeight + terrain.heights[i], z));
    const upper: number[] = [],
      lower: number[] = [],
      rim: number[] = [];
    const append = (positions: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
      positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    for (let i = 0; i < terrain.triangles.length; i += 3) {
      let [a, b, c] = terrain.triangles.slice(i, i + 3);
      const normal = new THREE.Vector3()
        .subVectors(top[b], top[a])
        .cross(new THREE.Vector3().subVectors(top[c], top[a]));
      if (normal.y < 0) [b, c] = [c, b];
      append(upper, top[a], top[b], top[c]);
      append(lower, bottom[a], bottom[c], bottom[b]);
    }
    for (let i = 0; i < terrain.boundary.length; i++) {
      const a = terrain.boundary[i],
        b = terrain.boundary[(i + 1) % terrain.boundary.length];
      append(rim, top[a], top[b], bottom[a]);
      append(rim, top[b], bottom[b], bottom[a]);
    }
    for (const [name, positions, surface] of [
      ["inverted-mountains", lower, "stone"],
      ["rock-rim", rim, "stone"],
      ["grass-surface", upper, "green"]
    ] as const) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      k.add(name, geometry, surface);
    }
    k.group.userData.seed = generation.seed;
    k.group.userData.peaks = terrain.peakIndices.length;
    return k.finish();
  }
};
