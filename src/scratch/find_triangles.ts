import { type BlockBoundary, buildPerimeterBlocks } from "../../src/city-editor/core/gen/perimeterBlocks";
import type { DistrictParameters, Face, Point } from "../../src/city-editor/core/types";

const face: Face = {
  id: "f1",
  site: [50, 50],
  boundary: [],
  properties: {
    ward: "craftsmen",
    settlement: "core",
    water: "land",
    elevation: 10,
    slope: 0
  }
};

const parameters: DistrictParameters = {
  lotArea: 80,
  coverage: 0.9,
  occupancy: 1,
  laneWidth: 3,
  orientation: 0
};

function runTest(name: string, outline: Point[], boundaries: BlockBoundary[], seed: string) {
  console.log(`\n=== Testing: ${name} (seed: ${seed}) ===`);
  const fabric = buildPerimeterBlocks(face, outline, boundaries, parameters, seed, true, false);
  console.log(`Blocks: ${fabric.blocks.length}, Buildings: ${fabric.buildings.length}`);

  const triangles: Point[][] = [];
  const quads: Point[][] = [];
  const others: Point[][] = [];

  for (const b of fabric.buildings) {
    if (b.polygon.length === 3) {
      triangles.push(b.polygon);
    } else if (b.polygon.length === 4) {
      quads.push(b.polygon);
    } else {
      others.push(b.polygon);
    }
  }

  console.log(`Summary: Triangles: ${triangles.length}, Quads: ${quads.length}, Others: ${others.length}`);
  if (triangles.length > 0) {
    console.log(`Sample triangles:`);
    for (const t of triangles.slice(0, 5)) {
      console.log("  ", JSON.stringify(t));
    }
  }
}

// 1. 大きな長方形街区
const outline1: Point[] = [
  [0, 0],
  [120, 0],
  [120, 80],
  [0, 80]
];
const b1: BlockBoundary[] = outline1.map((a, i) => ({
  a,
  b: outline1[(i + 1) % outline1.length],
  barrier: false,
  feature: i === 0,
  setback: 2
}));

for (let s = 1; s <= 5; s++) {
  runTest("Large Rect 120x80", outline1, b1, `seed-${s}`);
}

// 2. 斜めの街区
const outline2: Point[] = [
  [10, 10],
  [130, 25],
  [110, 95],
  [0, 75]
];
const b2: BlockBoundary[] = outline2.map((a, i) => ({
  a,
  b: outline2[(i + 1) % outline2.length],
  barrier: false,
  feature: i === 0,
  setback: 2
}));

for (let s = 1; s <= 5; s++) {
  runTest("Oblique 120x75", outline2, b2, `oblique-${s}`);
}
