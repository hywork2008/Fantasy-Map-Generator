import { createGridDocument } from "../city-editor/generators/document";
import { generateCityOnDocument } from "../city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../city-editor/generators/generation/settings";
import { facePoints } from "../city-editor/generators/mesh";
import { buildPerimeterBlocks } from "../city-editor/generators/perimeterBlocks";

const seed = "reference-town";
const base = createGridDocument({ size: "small", grid: "evolution", seed });
const settings = defaultGenerationSettings();
const doc = generateCityOnDocument(base, settings, seed)!;

const distFace = doc.mesh.faces.f45;
const polygon = facePoints(doc.mesh, distFace);
const boundaries = distFace.boundary.map((_ref, i) => {
  return {
    a: polygon[i],
    b: polygon[(i + 1) % polygon.length],
    setback: 2,
    feature: false,
    barrier: false
  };
});

const fabric = buildPerimeterBlocks(distFace, polygon, boundaries, undefined, "test", true, false);

// どの block に Triangle 0 が属しているかを特定

for (let bIdx = 0; bIdx < fabric.blocks.length; bIdx++) {
  const block = fabric.blocks[bIdx];
  console.log(`\n--- Block ${bIdx} (${block.length} vertices) ---`);
  console.log("Vertices:", JSON.stringify(block));
}
