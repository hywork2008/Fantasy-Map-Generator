import { createGridDocument } from "../../src/city-editor/core/document";
import { buildBlockFabric } from "../../src/city-editor/core/gen/blockInfill";
import { defaultGenerationSettings, generateCityOnDocument } from "../../src/city-editor/core/generate";

console.log("=== Testing evolution city generation for triangles ===");
const seeds = ["reference-town", "complete-b", "greyfield-test", "organic-seed-1", "test-42"];

for (const seed of seeds) {
  const base = createGridDocument({ size: "small", grid: "evolution", seed });
  const settings = defaultGenerationSettings();
  const doc = generateCityOnDocument(base, settings, seed)!;
  if (!doc) {
    console.log(`Failed to generate city for seed ${seed}`);
    continue;
  }

  const fabric = buildBlockFabric(doc);
  let triangles = 0;
  let quads = 0;
  let pentagons = 0;
  let others = 0;

  const sampleTriangles: (typeof fabric.buildings)[number][] = [];

  for (const b of fabric.buildings) {
    const len = b.polygon.length;
    if (len === 3) {
      triangles++;
      if (sampleTriangles.length < 5) sampleTriangles.push(b);
    } else if (len === 4) {
      quads++;
    } else if (len === 5) {
      pentagons++;
    } else {
      others++;
    }
  }

  console.log(`\nSeed: ${seed}`);
  console.log(`Buildings total: ${fabric.buildings.length}`);
  console.log(`  Triangles: ${triangles}, Quads: ${quads}, Pentagons: ${pentagons}, Others: ${others}`);
  if (sampleTriangles.length > 0) {
    for (const t of sampleTriangles) {
      const face = doc.mesh.faces[t.faceId];
      console.log(`    face ${t.faceId} ward: ${face?.properties.ward}, settlement: ${face?.properties.settlement}`);
      console.log(`    polygon:`, JSON.stringify(t.polygon));
    }
  }
}
