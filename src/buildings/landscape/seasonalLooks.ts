import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { TreeAppearance } from "./treePhenology";
import type { TreeQuality } from "./treeQuality";
import {
  addFlowers,
  blendFoliage,
  type FoliageTint,
  positionHash,
  type TreeAppearanceOptions,
  tintFoliage
} from "./treeSeasonLayers";

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
  /** Parts of the foliage mesh that stay on a bare winter tree, such as alder cones. */
  bareKeeps?: (color: THREE.Color) => boolean;
  /** Fruit, berries or flowers drawn inside the foliage mesh, recognised by colour. */
  crownExtras?: {
    kind: "fruit" | "flower";
    match(color: THREE.Color): boolean;
    /** Recolour for these appearances; extras of kind fruit are dropped for leaf and harvested. */
    tints?: Partial<Record<TreeAppearance, FoliageTint>>;
  };
  /** Flowers placed where the fruit will hang (fruit bodies or fruit drawn in the crown). */
  bloom?: BloomSpec;
  fruitMesh?: {
    tints?: Partial<Record<TreeAppearance, FoliageTint>>;
    /** Leaf shows small unripe fruit at this scale on high and ultra; otherwise fruit is dropped. */
    leafScale?: number;
    /** Share of fruit left after harvest, optionally smaller and recoloured; none when absent. */
    harvested?: { keep: number; scale?: number; tint?: FoliageTint };
  };
}

type Tier = TreeQuality;
export interface BloomSpec {
  /** Blossom of five-petalled flowers, flat-topped corymbs, hanging catkins or inflorescence strands. */
  kind: "blossom" | "corymb" | "catkin" | "strand";
  /** Flowers open on bare twigs, so high and ultra draw the generator's winter skeleton. */
  beforeLeaves?: boolean;
  /** Fruit bodies, fruit drawn inside the crown, or points spread over the leafy crown itself. */
  sites: "fruit" | "crownExtras" | "crown";
  heart: number;
  rim: number;
  /** Petal radius or catkin/strand length in metres at ultra; high and medium enlarge it. */
  size: number;
  spread: number;
  perSite: Record<Exclude<Tier, "low">, number>;
  /** Sites spread over the crown for `sites: "crown"`; a tree in full blossom needs thousands. */
  crownSites?: Record<Exclude<Tier, "low">, number>;
  /** Crown colour mixed toward `distant` on fitted lobes, where single flowers vanish. */
  distant: number;
  blend: Record<"low" | "medium", number>;
  /**
   * Leaf mix toward `distant` at high and ultra: catkins and florets are thinner than a pixel at
   * whole-tree range, so the crown carries their colour as it does seen from afar.
   */
  crownTint?: number;
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
    appearances: ["bare", "bloom", "leaf", "fruit", "harvested"],
    bloom: {
      kind: "blossom",
      beforeLeaves: true,
      sites: "crown",
      heart: 0xfffdf6,
      rim: 0xf1ede2,
      size: 0.045,
      spread: 0.06,
      perSite: { medium: 0, high: 3, ultra: 4 },
      crownSites: { medium: 0, high: 1150, ultra: 2200 },
      distant: 0xfbfaf6,
      blend: { low: 0.8, medium: 0.78 }
    },
    default: "fruit",
    autumn: { hue: 0.055, hueJitter: 0.07, saturation: 0.6, lightnessScale: 1.25 },
    fruitMesh: { leafScale: 0.55, tints: { leaf: SMALL_GREEN } }
  },
  european_plum: {
    appearances: ["bare", "bloom", "leaf", "fruit", "harvested"],
    bloom: {
      kind: "blossom",
      beforeLeaves: true,
      sites: "crown",
      heart: 0xfffef9,
      rim: 0xf4f2ea,
      size: 0.04,
      spread: 0.06,
      perSite: { medium: 0, high: 3, ultra: 4 },
      crownSites: { medium: 0, high: 1150, ultra: 2200 },
      distant: 0xfbfbf8,
      blend: { low: 0.8, medium: 0.78 }
    },
    default: "fruit",
    autumn: { hue: 0.1, hueJitter: 0.06, saturation: 0.58, lightnessScale: 1.25 },
    fruitMesh: { leafScale: 0.6, tints: { leaf: SMALL_GREEN } }
  },
  common_fig: {
    appearances: ["bare", "leaf", "fruit", "harvested"],
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
    appearances: ["bare", "bloom", "unripe", "fruit", "harvested"],
    // Long cream male catkins spread from the new shoots in early summer.
    bloom: {
      kind: "catkin",
      sites: "crown",
      heart: 0xf2e8b4,
      rim: 0xdccf88,
      size: 0.2,
      spread: 0.05,
      perSite: { medium: 1, high: 3, ultra: 4 },
      distant: 0xe8dea8,
      blend: { low: 0.45, medium: 0.4 },
      crownTint: 0.32
    },
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
    appearances: ["bloom", "unripe", "fruit", "harvested"],
    // White, jasmine-like flowers crowd the same nodes that later carry the cherries.
    bloom: {
      kind: "blossom",
      sites: "crown",
      heart: 0xffffff,
      rim: 0xf6f4ee,
      size: 0.022,
      spread: 0.04,
      perSite: { medium: 1, high: 3, ultra: 4 },
      distant: 0xf2f2ec,
      blend: { low: 0.4, medium: 0.3 }
    },
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
    appearances: ["bloom", "unripe", "fruit", "harvested"],
    // Female inflorescences: cream-yellow strands hanging from the four fruit axes.
    bloom: {
      kind: "strand",
      sites: "crownExtras",
      heart: 0xe8d590,
      rim: 0xcdb466,
      size: 0.42,
      spread: 0.12,
      perSite: { medium: 6, high: 10, ultra: 16 },
      distant: 0xd8c47c,
      blend: { low: 0, medium: 0 }
    },
    default: "unripe",
    // Harvest cuts the bunches; their four fruit axes stay as stalks until the fruit layer (T5).
    crownExtras: {
      kind: "fruit",
      match: exact(0xd09a2a),
      tints: { fruit: { hue: 0.06, hueJitter: 0.02, saturation: 0.5, lightnessScale: 0.55 } }
    }
  },
  tamarisk: {
    appearances: ["bare", "bloom", "leaf"],
    default: "bloom",
    crownExtras: { kind: "flower", match: redOrPink }
  },
  rowan: {
    appearances: ["bare", "bloom", "leaf", "fruit", "autumn"],
    // Creamy flat-topped corymbs open where the berry clusters will hang.
    bloom: {
      kind: "corymb",
      sites: "crownExtras",
      heart: 0xfffbea,
      rim: 0xf0ead0,
      size: 0.018,
      spread: 0.13,
      perSite: { medium: 3, high: 16, ultra: 28 },
      distant: 0xece6cc,
      blend: { low: 0.3, medium: 0.25 },
      crownTint: 0.15
    },
    default: "fruit",
    autumn: { hue: 0.015, hueJitter: 0.04, saturation: 0.62, lightnessScale: 1.45 },
    crownExtras: { kind: "fruit", match: redOrPink }
  },
  european_hornbeam: {
    appearances: ["bare", "leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.13, hueJitter: 0.04, saturation: 0.6, lightnessScale: 1.35 }
  },
  pedunculate_oak: {
    appearances: ["bare", "leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.08, hueJitter: 0.05, saturation: 0.45, lightnessScale: 1.15 }
  },
  garden_parkland: {
    appearances: ["bare", "leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.14, hueJitter: 0.03, saturation: 0.6, lightnessScale: 1.45 }
  },
  silver_birch: {
    appearances: ["bare", "leaf", "autumn"],
    default: "leaf",
    autumn: { hue: 0.145, hueJitter: 0.03, saturation: 0.7, lightnessScale: 1.6 }
  },
  // Alder cones and catkins stay through the winter.
  black_alder: {
    appearances: ["bare", "leaf"],
    default: "leaf",
    bareKeeps: exact(0x2b2218)
  },
  peaceful_willow: {
    appearances: ["bare", "leaf", "autumn"],
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

  if (appearance === "bare") {
    // The generator drew winter twigs on its skeleton; leaves and fruit fall away.
    for (const mesh of pickables.slice(1)) {
      const keeps = mesh === crown && look.bareKeeps ? crownTriangles(mesh.geometry, look.bareKeeps) : [];
      if (keeps.some(Boolean))
        replace(
          mesh,
          filterTriangles(mesh.geometry, t => keeps[t])
        );
      else drop(mesh);
    }
    group.userData.treeAppearance = appearance;
    return wrap(model);
  }

  if (appearance === "bloom" && look.bloom) {
    applyBloom(look, look.bloom, quality, model, replace, drop);
    group.userData.treeAppearance = appearance;
    return wrap(model);
  }

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
  return wrap(model);
}

/** Replaced geometries are not known to the generator's own dispose. */
function wrap(model: CityStructureMeshes): CityStructureMeshes {
  return {
    group: model.group,
    pickables: model.pickables,
    dispose() {
      model.dispose();
      for (const mesh of model.pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}

/** Options for the generator itself: blossom before leaves opens on the winter skeleton. */
export function generatorOptions(
  look: SeasonalLook,
  quality: TreeQuality,
  options: TreeAppearanceOptions | undefined
): TreeAppearanceOptions | undefined {
  return options?.appearance === "bloom" && look.bloom?.beforeLeaves && (quality === "high" || quality === "ultra")
    ? { appearance: "bare" }
    : options;
}

/** One site per fruit cluster: points merged per grid cell, so a spiny bur or berry head counts once. */
function clusterSites(points: readonly THREE.Vector3[], cell: number): THREE.Vector3[] {
  const cells = new Map<string, { sum: THREE.Vector3; count: number }>();
  for (const p of points) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
    const entry = cells.get(key) ?? { sum: new THREE.Vector3(), count: 0 };
    entry.sum.add(p);
    entry.count++;
    cells.set(key, entry);
  }
  return [...cells.values()].map(entry => entry.sum.divideScalar(entry.count));
}

/** Points spread evenly over the leafy crown: a stable stride through its triangle centroids. */
function crownSites(geometry: THREE.BufferGeometry, target: number): THREE.Vector3[] {
  const position = geometry.getAttribute("position");
  const vertices = triangleVertices(geometry);
  const triangles = vertices.length / 3;
  const stride = Math.max(1, Math.floor(triangles / target));
  const sites: THREE.Vector3[] = [];
  for (let t = 0; t < triangles; t += stride) {
    const site = new THREE.Vector3();
    for (let k = 0; k < 3; k++) site.add(new THREE.Vector3().fromBufferAttribute(position, vertices[t * 3 + k]));
    sites.push(site.divideScalar(3));
  }
  return sites;
}
const CROWN_SITES: Record<"medium" | "high" | "ultra", number> = { medium: 90, high: 260, ultra: 560 };

/** Positions of fruit drawn as loose triangles in the crown. */
function crownExtraPoints(geometry: THREE.BufferGeometry, isExtra: boolean[]): THREE.Vector3[] {
  const position = geometry.getAttribute("position");
  const vertices = triangleVertices(geometry);
  return isExtra.flatMap((extra, t) =>
    extra ? [new THREE.Vector3().fromBufferAttribute(position, vertices[t * 3])] : []
  );
}

/** A low dome of eight triangles, facing the sky: a flower head seen whole. */
function addDisc(
  out: { positions: number[]; normals: number[]; colors: number[] },
  center: THREE.Vector3,
  radius: number,
  color: THREE.Color
): void {
  const top = center.clone().add(new THREE.Vector3(0, radius * 0.25, 0));
  const turn = positionHash(center.x, center.y, center.z) * Math.PI;
  for (let k = 0; k < 8; k++) {
    for (const p of [
      top,
      center
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(turn + ((k + 1) * Math.PI) / 4) * radius,
            0,
            Math.sin(turn + ((k + 1) * Math.PI) / 4) * radius
          )
        ),
      center
        .clone()
        .add(
          new THREE.Vector3(Math.cos(turn + (k * Math.PI) / 4) * radius, 0, Math.sin(turn + (k * Math.PI) / 4) * radius)
        )
    ]) {
      out.positions.push(p.x, p.y, p.z);
      out.normals.push(0, 1, 0);
      out.colors.push(color.r, color.g, color.b);
    }
  }
}

/** A thin ribbon bent by `droop`, for catkins and inflorescence strands. */
function addRibbon(
  out: { positions: number[]; normals: number[]; colors: number[] },
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  width: number,
  droop: number,
  base: THREE.Color,
  tip: THREE.Color,
  segments: number
): void {
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize().multiplyScalar(width / 2);
  const normal = new THREE.Vector3().crossVectors(side, direction).normalize();
  const points: THREE.Vector3[] = [start];
  const heading = direction.clone().normalize();
  for (let i = 1; i <= segments; i++) {
    heading.y -= droop / segments;
    heading.normalize();
    points.push(points[i - 1].clone().addScaledVector(heading, length / segments));
  }
  const color = new THREE.Color();
  const push = (p: THREE.Vector3, t: number) => {
    color.copy(base).lerp(tip, t);
    out.positions.push(p.x, p.y, p.z);
    out.normals.push(normal.x, normal.y, normal.z);
    out.colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments,
      t1 = (i + 1) / segments;
    const w0 = 1 - t0 * 0.3,
      w1 = 1 - t1 * 0.3;
    const a = points[i].clone().addScaledVector(side, w0),
      b = points[i].clone().addScaledVector(side, -w0),
      c = points[i + 1].clone().addScaledVector(side, w1),
      d = points[i + 1].clone().addScaledVector(side, -w1);
    push(a, t0);
    push(b, t0);
    push(c, t1);
    push(b, t0);
    push(d, t1);
    push(c, t1);
  }
}

/**
 * Flowering: fruit and berries are not yet set, flowers open at their sites, and fitted lobes
 * pale toward the flower colour. Blossom before leaves stands on the generator's bare skeleton.
 */
function applyBloom(
  look: SeasonalLook,
  spec: BloomSpec,
  quality: TreeQuality,
  model: CityStructureMeshes,
  replace: (mesh: THREE.Mesh, geometry: THREE.BufferGeometry) => void,
  drop: (mesh: THREE.Mesh) => void
): void {
  const { group, pickables } = model;
  const crown = pickables[1];
  const fruit = look.fruitMesh ? pickables[2] : undefined;
  let sites: THREE.Vector3[] = [];
  // Fruit is not yet set while the tree flowers.
  if (fruit) {
    if (spec.sites === "fruit") sites = clusterSites(fruitBodies(fruit.geometry).centers, 0.12);
    drop(fruit);
  }
  const extras = look.crownExtras;
  if (extras?.kind === "fruit" && crown) {
    const isExtra = crownTriangles(crown.geometry, extras.match);
    if (spec.sites === "crownExtras") sites = clusterSites(crownExtraPoints(crown.geometry, isExtra), 0.6);
    replace(
      crown,
      filterTriangles(crown.geometry, t => !isExtra[t])
    );
  }
  if (spec.sites === "crown" && crown && quality !== "low")
    sites = crownSites(crown.geometry, (spec.crownSites ?? CROWN_SITES)[quality]);
  const bareTwigs = spec.beforeLeaves && (quality === "high" || quality === "ultra");
  if (crown && bareTwigs) drop(crown);
  else if (crown) {
    const amount = quality === "low" || quality === "medium" ? spec.blend[quality] : (spec.crownTint ?? 0);
    if (amount > 0) blendFoliage(crown.geometry, new THREE.Color(spec.distant), amount);
  }
  if (quality === "low" || !sites.length || !spec.perSite[quality]) return;

  const out = { positions: [] as number[], normals: [] as number[], colors: [] as number[] };
  const heart = new THREE.Color(spec.heart),
    rim = new THREE.Color(spec.rim);
  const count = spec.perSite[quality];
  // Reduced tiers draw fewer, larger flowers, as their leaves are fewer and larger.
  const scale = quality === "medium" ? 2 : quality === "high" ? 1.4 : 1;
  const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0);
  for (const site of sites) {
    const turn = positionHash(site.x, site.y, site.z) * Math.PI * 2;
    const outward = site.clone().sub(center).setY(0).normalize();
    for (let k = 0; k < count; k++) {
      const angle = turn + (k / count) * Math.PI * 2;
      const r = spec.spread * Math.sqrt((k + 0.5) / count);
      const at = site.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
      if (spec.kind === "blossom")
        addFlowers(
          out,
          [at.addScaledVector(up, 0.02)],
          center,
          spec.size * scale,
          heart,
          rim,
          quality === "ultra" ? 2 : 1
        );
      else if (spec.kind === "corymb") {
        // Terminal heads stand at the top of the shoot, above the hanging berries' position. The
        // flat head reads as one creamy disc; ultra adds the florets standing on it.
        const lift = 0.22;
        if (k === 0) addDisc(out, site.clone().addScaledVector(up, lift), spec.spread * scale, rim);
        if (quality !== "ultra") continue;
        addFlowers(
          out,
          [at.addScaledVector(up, lift + 0.03)],
          at.clone().addScaledVector(up, -1),
          spec.size * scale,
          heart,
          rim,
          1
        );
      } else {
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).lerp(outward, 0.5);
        if (spec.kind === "catkin") direction.setY(0.35).normalize();
        else direction.setY(-1.6).normalize();
        const length = spec.size * (0.8 + positionHash(at.z, at.x, at.y) * 0.4);
        addRibbon(
          out,
          at,
          direction,
          length,
          (spec.kind === "catkin" ? 0.022 : 0.02) * scale,
          spec.kind === "catkin" ? 0.9 : 0.2,
          heart,
          rim,
          quality === "ultra" ? 4 : 2
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(out.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(out.colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = `${group.name}-${spec.kind === "blossom" ? "blossom" : spec.kind === "corymb" ? "blossom-corymbs" : spec.kind === "catkin" ? "blossom-catkins" : "blossom-inflorescences"}`;
  group.add(mesh);
  pickables.push(mesh);
}
