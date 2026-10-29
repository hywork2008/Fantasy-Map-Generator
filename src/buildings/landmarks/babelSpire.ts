import Alea from "alea";
import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { addBabelEntrances, babelEntranceCenters } from "./details/babelEntrances";
import { addSpireDetails, addSpireRoofAccess } from "./details/babelSpireDetails";
import { BABEL_TIERS } from "./towerOfBabel";

export const SPIRE_RADIUS = (BABEL_TIERS.at(-1)![0] * 2.4) / 2 - 6;
export const SPIRE_LEVEL_HEIGHTS = [...BABEL_TIERS, ...[...BABEL_TIERS].reverse()].map(([, height]) => height * 2.4);
const HEIGHT = Math.round(SPIRE_LEVEL_HEIGHTS.reduce((sum, height) => sum + height, 0) * 10) / 10;
const SLAB = 1.2;
export const CORRIDOR_WIDTH = 1.2;

export interface TowerBranch {
  level: number;
  angle: number;
  /** Clear gap from the outer terrace edge to the satellite's near face. */
  length: number;
  radius: number;
}

export function generateTowerBranches(seed: string): TowerBranch[] {
  const random = Alea(seed);
  const count = Math.floor(random() * 4);
  const levels = Array.from({ length: 25 }, (_, index) => index + 2);
  const bearing = random() * Math.PI * 2;
  const entrances = babelEntranceCenters(SPIRE_RADIUS);
  return Array.from({ length: count }, (_, index) => {
    const slot = Math.floor(random() * levels.length);
    const level = levels.splice(slot, 1)[0];
    const desiredAngle = bearing + (index * Math.PI * 2) / Math.max(count, 1) + (random() - 0.5) * 0.35;
    const entrance = entrances.reduce((nearest, candidate) =>
      Math.cos(Math.atan2(candidate.x, candidate.z) - desiredAngle) >
      Math.cos(Math.atan2(nearest.x, nearest.z) - desiredAngle)
        ? candidate
        : nearest
    );
    return {
      level,
      angle: Math.atan2(entrance.x, entrance.z),
      length: 12 + random() * 58,
      radius: 5 + random() * 3
    };
  });
}

const generation = {
  seed: "three",
  overhang: 3,
  regenerate() {
    this.seed = crypto.randomUUID();
  }
};

export const model: LandmarkModel = {
  id: "babel-spire",
  task: "I04",
  name: "Babel spire (narrow tower and satellite towers)",
  style: "Imaginary",
  state: "Uniform narrow shaft with adjustable terrace rims and 0–3 suspended satellite towers",
  size: [250, 250, HEIGHT],
  dimensions:
    "Main wall diameter 45.6 m, matching I02's smallest wall. 28 levels, total height 508.8 m. Terrace projection 0–12 m. " +
    "Corridors are 1.2 m wide with a random clear span of 12–70 m. Each satellite is 1.5 local storeys tall: one above its corridor and half below.",
  note:
    "A straightened I02 study with its original floor heights and stone color, round-headed entrances, and level circular terrace slabs. " +
    "Random generation selects 0–3 different storeys, entrance-aligned bearings, corridor lengths and satellite radii. " +
    "Each narrow horizontal corridor enters the side of a cylindrical satellite, like a support inserted into an aluminum can. " +
    "Satellites have no ground supports. Interiors, railings and structural engineering are omitted.",
  sources: [],
  towerGeneration: generation,
  create: () => createSpire(false)
};

function createSpire(ultra: boolean) {
  const k = new ArchitectureKit(model.id, "stone");
  const floors: number[] = [];
  let base = 0;
  for (const [index, height] of SPIRE_LEVEL_HEIGHTS.entries()) {
    floors.push(base);
    k.cylinder(
      `shaft-level-${index}`,
      [0, base + (height - SLAB - (ultra && index === SPIRE_LEVEL_HEIGHTS.length - 1 ? 5 : 0)) / 2, 0],
      SPIRE_RADIUS,
      height - SLAB - (ultra && index === SPIRE_LEVEL_HEIGHTS.length - 1 ? 5 : 0),
      "stone",
      SPIRE_RADIUS,
      32
    );
    const rimRadius = SPIRE_RADIUS + (index < SPIRE_LEVEL_HEIGHTS.length - 1 ? generation.overhang : 0);
    if (ultra && index === SPIRE_LEVEL_HEIGHTS.length - 1) addSpireRoofAccess(k, SPIRE_RADIUS, base + height, SLAB);
    else k.cylinder(`terrace-${index}`, [0, base + height - SLAB / 2, 0], rimRadius, SLAB, "stone", rimRadius, 32);
    addBabelEntrances(k, `shaft-entrances-${index}`, SPIRE_RADIUS, base, height - SLAB, ultra);
    base += height;
  }
  const branches = generateTowerBranches(generation.seed);
  for (const [index, branch] of branches.entries()) {
    const floor = floors[branch.level];
    const height = SPIRE_LEVEL_HEIGHTS[branch.level];
    const reach = SPIRE_RADIUS + generation.overhang + branch.length + branch.radius;
    const x = Math.sin(branch.angle),
      z = Math.cos(branch.angle);
    const start = SPIRE_RADIUS - 0.5;
    // The deck top is the floor datum and continues into both closed volumes.
    const corridor = k.box(
      `corridor-${index}`,
      [(x * (start + reach)) / 2, floor - 0.2, (z * (start + reach)) / 2],
      [CORRIDOR_WIDTH, 0.4, reach - start],
      "stone"
    );
    corridor.rotation.y = branch.angle;
    k.cylinder(
      `satellite-${index}`,
      [x * reach, floor + height * 0.25, z * reach],
      branch.radius,
      height * 1.5,
      "stone",
      branch.radius,
      32
    );
    // The satellite entrance faces the incoming corridor at its floor datum.
    k.opening(
      `satellite-entry-${index}`,
      x * (reach - branch.radius),
      floor,
      z * (reach - branch.radius),
      1.2,
      2.4,
      branch.angle + Math.PI,
      false,
      true
    );
  }
  k.group.userData.seed = generation.seed;
  k.group.userData.branches = branches;
  k.group.userData.overhang = generation.overhang;
  if (ultra) return addSpireDetails(k, floors, SPIRE_LEVEL_HEIGHTS, branches, generation, SPIRE_RADIUS);
  return k.finish();
}

model.ultraDetail = {
  ...model,
  ultraDetail: undefined,
  author: "Codex GPT-6.1 Sol",
  name: "Babel spire · ultra detail",
  size: [250, 250, HEIGHT + 2.5],
  state: "Gothic stone spire with crenellated summit, open stair access and suspended satellite towers",
  note:
    "Mipmapped small-block masonry, molded Gothic portal surrounds, paired blind lancets and quatrefoil tracery. " +
    "Short arched haunches reinforce only the two corridor landings. Seeded satellites select battlements, a conical tiled roof, or both. " +
    "The main summit has a real stairwell opening, visible ascending treads and a crenellated parapet. Stone joints use a shared texture rather than individual block geometry.",
  create: () => createSpire(true)
};
