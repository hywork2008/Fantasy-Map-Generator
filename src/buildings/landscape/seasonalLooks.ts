import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { TreeAppearance } from "./treePhenology";
import type { TreeQuality } from "./treeQuality";
import { type FoliageTint, positionHash, type TreeAppearanceOptions, tintFoliage } from "./treeSeasonLayers";

/**
 * Seasonal looks drawn by recolouring or dropping parts of an existing model, without new geometry
 * (docs/plan/bv-tree-seasonal-appearance.md §4, P and V). Models follow the registry layout:
 * pickables[0] wood, [1] foliage, [2] a separate fruit mesh when the species has one.
 */
export interface SeasonalLook {
  /** Appearances this look can draw; others wait for new layers (bare twigs, blossom). */
  appearances: readonly TreeAppearance[];
  /** The appearance of the unmodified model. */
  default: TreeAppearance;
  autumn?: FoliageTint;
  /** Fruit, berries or flowers drawn inside the foliage mesh, recognised by colour. */
  crownExtras?: {
    kind: "fruit" | "flower";
    match(color: THREE.Color): boolean;
    /** Recolour for these appearances; extras of kind fruit are dropped for leaf and harvested. */
    tints?: Partial<Record<TreeAppearance, FoliageTint>>;
  };
  fruitMesh?: {
    tints?: Partial<Record<TreeAppearance, FoliageTint>>;
    /** Leaf shows small unripe fruit at this scale on high and ultra; otherwise fruit is dropped. */
    leafScale?: number;
    /** Share of fruit left after harvest, optionally smaller and recoloured; none when absent. */
    harvested?: { keep: number; scale?: number; tint?: FoliageTint };
  };
}

const exact = (...hex: number[]) => {
  const colors = hex.map(value => new THREE.Color(value));
  return (color: THREE.Color) =>
    colors.some(c => Math.abs(c.r - color.r) + Math.abs(c.g - color.g) + Math.abs(c.b - color.b) < 1e-4);
};
const hsl = { h: 0, s: 0, l: 0 };
/** Saturated reds, scarlets and pinks: berries and flowers among green leaves. */
const redOrPink = (color: THREE.Color) => {
  color.getHSL(hsl);
  return hsl.s > 0.3 && (hsl.h < 0.06 || hsl.h > 0.85);
};
const SMALL_GREEN: FoliageTint = { hue: 0.23, hueJitter: 0.03, saturation: 0.5, lightnessScale: 1 };

export const SEASONAL_LOOKS = {
  european_pear: {
    appearances: ["leaf", "fruit", "harvested"],
    default: "fruit",
    autumn: { hue: 0.055, hueJitter: 0.07, saturation: 0.6, lightnessScale: 1.25 },
    fruitMesh: { leafScale: 0.55, tints: { leaf: SMALL_GREEN } }
  },
  european_plum: {
    appearances: ["leaf", "fruit", "harvested"],
    default: "fruit",
    autumn: { hue: 0.1, hueJitter: 0.06, saturation: 0.58, lightnessScale: 1.25 },
    fruitMesh: { leafScale: 0.6, tints: { leaf: SMALL_GREEN } }
  },
  common_fig: {
    appearances: ["leaf", "fruit", "harvested"],
    default: "fruit",
    autumn: { hue: 0.135, hueJitter: 0.04, saturation: 0.62, lightnessScale: 1.35 },
    fruitMesh: { leafScale: 0.6, tints: { leaf: SMALL_GREEN } }
  },
  lemon: {
    appearances: ["unripe", "fruit", "harvested"],
    default: "fruit",
    fruitMesh: {
      tints: { unripe: { hue: 0.25, hueJitter: 0.03, saturation: 0.55, lightnessScale: 0.8 } },
      harvested: { keep: 0.15 }
    }
  },
  sweet_chestnut: {
    appearances: ["unripe", "fruit", "harvested"],
    default: "unripe",
    autumn: { hue: 0.11, hueJitter: 0.05, saturation: 0.6, lightnessScale: 1.3 },
    // Browning burs stand in for split ones until the fruit layer adds the opened husks (T5).
    fruitMesh: { tints: { fruit: { hue: 0.085, hueJitter: 0.03, saturation: 0.5, lightnessScale: 1.05 } } }
  },
  cacao: {
    appearances: ["fruit", "harvested"],
    default: "fruit",
    // Young green cherelles remain on the trunk after the ripe pods are cut.
    fruitMesh: { harvested: { keep: 0.3, scale: 0.6, tint: { ...SMALL_GREEN, lightnessScale: 0.9 } } }
  },
  arabica_coffee: {
    appearances: ["unripe", "fruit", "harvested"],
    default: "fruit",
    fruitMesh: { tints: { unripe: { hue: 0.25, hueJitter: 0.03, saturation: 0.5, lightnessScale: 1.1 } } }
  },
  olive: {
    appearances: ["leaf", "unripe", "fruit"],
    default: "fruit",
    crownExtras: {
      kind: "fruit",
      match: exact(0x2a2230, 0x6b7a3a),
      tints: { unripe: { hue: 0.2, hueJitter: 0.02, saturation: 0.35, lightnessScale: 1 } }
    }
  },
  date_palm: {
    appearances: ["unripe", "fruit", "harvested"],
    default: "unripe",
    // Harvest cuts the bunches; their four fruit axes stay as stalks until the fruit layer (T5).
    crownExtras: {
      kind: "fruit",
      match: exact(0xd09a2a),
      tints: { fruit: { hue: 0.06, hueJitter: 0.02, saturation: 0.5, lightnessScale: 0.55 } }
    }
  },
  tamarisk: {
    appearances: ["bloom", "leaf"],
    default: "bloom",
    crownExtras: { kind: "flower", match: redOrPink }
  },
  rowan: {
    appearances: ["leaf", "fruit", "autumn"],
    default: "fruit",
    autumn: { hue: 0.015, hueJitter: 0.04, saturation: 0.62, lightnessScale: 1.45 },
    crownExtras: { kind: "fruit", match: redOrPink }
  },
  european_hornbeam: {
    appearances: ["leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.13, hueJitter: 0.04, saturation: 0.6, lightnessScale: 1.35 }
  },
  pedunculate_oak: {
    appearances: ["leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.08, hueJitter: 0.05, saturation: 0.45, lightnessScale: 1.15 }
  },
  garden_parkland: {
    appearances: ["leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.14, hueJitter: 0.03, saturation: 0.6, lightnessScale: 1.45 }
  },
  silver_birch: {
    appearances: ["leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.145, hueJitter: 0.03, saturation: 0.7, lightnessScale: 1.6 }
  },
  peaceful_willow: {
    appearances: ["leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.15, hueJitter: 0.03, saturation: 0.55, lightnessScale: 1.4 }
  }
} as const satisfies Record<string, SeasonalLook>;
export type SeasonalLookSpecies = keyof typeof SEASONAL_LOOKS;

/** Triangle index list of a geometry, indexed or not. */
function triangleVertices(geometry: THREE.BufferGeometry): ArrayLike<number> {
  return geometry.index?.array ?? Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i);
}

/** A copy keeping only the triangles for which `keep` is true. */
function filterTriangles(geometry: THREE.BufferGeometry, keep: (triangle: number) => boolean): THREE.BufferGeometry {
  const vertices = triangleVertices(geometry);
  const triangles = vertices.length / 3;
  if (geometry.index) {
    const result = geometry.clone();
    const index: number[] = [];
    for (let t = 0; t < triangles; t++)
      if (keep(t)) index.push(vertices[t * 3], vertices[t * 3 + 1], vertices[t * 3 + 2]);
    result.setIndex(index);
    return result;
  }
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize;
    const values: number[] = [];
    for (let t = 0; t < triangles; t++) {
      if (!keep(t)) continue;
      for (let k = t * 3 * size; k < (t + 1) * 3 * size; k++) values.push(attribute.array[k]);
    }
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  return result;
}

/**
 * Separate fruit bodies of a merged mesh: triangles joined through shared or coincident vertices.
 * Returns each triangle's fruit and each fruit's centroid.
 */
function fruitBodies(geometry: THREE.BufferGeometry): { body: Int32Array; centers: THREE.Vector3[] } {
  const position = geometry.getAttribute("position");
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const seen = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else join(i, first);
  }
  const vertices = triangleVertices(geometry);
  for (let t = 0; t < vertices.length; t += 3) {
    join(vertices[t], vertices[t + 1]);
    join(vertices[t], vertices[t + 2]);
  }
  const ids = new Map<number, number>();
  const sums: THREE.Vector3[] = [];
  const counts: number[] = [];
  const vertexBody = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const root = find(i);
    let id = ids.get(root);
    if (id === undefined) {
      id = sums.length;
      ids.set(root, id);
      sums.push(new THREE.Vector3());
      counts.push(0);
    }
    vertexBody[i] = id;
    sums[id].add(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    counts[id]++;
  }
  const body = new Int32Array(vertices.length / 3);
  for (let t = 0; t < body.length; t++) body[t] = vertexBody[vertices[t * 3]];
  return { body, centers: sums.map((sum, i) => sum.divideScalar(counts[i])) };
}

/** Shrink every fruit about its own centroid; the stalk socket moves with it. */
function shrinkBodies(geometry: THREE.BufferGeometry, scale: number): void {
  const { body, centers } = fruitBodies(geometry);
  const position = geometry.getAttribute("position");
  const vertexBody = new Int32Array(position.count).fill(-1);
  const vertices = triangleVertices(geometry);
  for (let t = 0; t < body.length; t++) for (let k = 0; k < 3; k++) vertexBody[vertices[t * 3 + k]] = body[t];
  for (let i = 0; i < position.count; i++) {
    const c = centers[vertexBody[i]];
    if (!c) continue;
    position.setXYZ(
      i,
      c.x + (position.getX(i) - c.x) * scale,
      c.y + (position.getY(i) - c.y) * scale,
      c.z + (position.getZ(i) - c.z) * scale
    );
  }
  position.needsUpdate = true;
}

/** Keep a stable share of fruit bodies, chosen by their position. */
function keepFruit(geometry: THREE.BufferGeometry, share: number): THREE.BufferGeometry {
  const { body, centers } = fruitBodies(geometry);
  const kept = centers.map(c => positionHash(c.x * 1.7, c.y * 1.3, c.z * 1.9) < share);
  return filterTriangles(geometry, t => kept[body[t]]);
}

/** Leaf-coloured triangles of a crown, using the colour of each triangle's first vertex. */
function crownTriangles(geometry: THREE.BufferGeometry, match: (color: THREE.Color) => boolean): boolean[] {
  const color = geometry.getAttribute("color");
  const vertices = triangleVertices(geometry);
  const rgb = new THREE.Color();
  return Array.from({ length: vertices.length / 3 }, (_, t) => {
    const v = vertices[t * 3];
    return match(rgb.setRGB(color.getX(v), color.getY(v), color.getZ(v)));
  });
}

/**
 * Apply a seasonal look to a freshly built model. Without options the model is returned
 * untouched, keeping the static default byte-identical.
 */
export function applySeasonalLook(
  look: SeasonalLook,
  quality: TreeQuality,
  model: CityStructureMeshes,
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  if (!options.appearance && !options.autumnPalette) return model;
  const appearance =
    options.appearance && look.appearances.includes(options.appearance) ? options.appearance : look.default;
  const { group, pickables } = model;
  const crown = pickables[1];
  const fruit = look.fruitMesh ? pickables[2] : undefined;
  const replace = (mesh: THREE.Mesh, geometry: THREE.BufferGeometry) => {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  };
  const drop = (mesh: THREE.Mesh) => {
    group.remove(mesh);
    pickables.splice(pickables.indexOf(mesh), 1);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  };

  const extras = look.crownExtras;
  if (extras && crown) {
    const isExtra = crownTriangles(crown.geometry, extras.match);
    const dropped =
      (extras.kind === "fruit" && (appearance === "leaf" || appearance === "harvested")) ||
      (extras.kind === "flower" && appearance !== "bloom");
    if (dropped)
      replace(
        crown,
        filterTriangles(crown.geometry, t => !isExtra[t])
      );
    const tint = extras.tints?.[appearance];
    if (tint && !dropped) tintFoliage(crown.geometry, tint, extras.match);
  }

  if (fruit && look.fruitMesh) {
    const spec = look.fruitMesh;
    const reduced = quality === "low" || quality === "medium";
    if (appearance === "leaf") {
      if (spec.leafScale && !reduced) shrinkBodies(fruit.geometry, spec.leafScale);
      else drop(fruit);
    } else if (appearance === "harvested") {
      if (spec.harvested) {
        replace(fruit, keepFruit(fruit.geometry, spec.harvested.keep));
        if (spec.harvested.scale) shrinkBodies(fruit.geometry, spec.harvested.scale);
        if (spec.harvested.tint) tintFoliage(fruit.geometry, spec.harvested.tint);
      } else drop(fruit);
    }
    const tint = spec.tints?.[appearance];
    if (tint && pickables.includes(fruit)) tintFoliage(fruit.geometry, tint);
  }

  if (look.autumn && crown && (appearance === "autumn" || options.autumnPalette))
    tintFoliage(crown.geometry, look.autumn, extras ? color => !extras.match(color) : undefined);

  group.userData.treeAppearance = appearance;
  return {
    group,
    pickables,
    dispose() {
      model.dispose();
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}
