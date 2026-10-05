import { createGridDocument } from "../../src/city-editor/core/document";
import { buildPerimeterBlocks } from "../../src/city-editor/core/gen/perimeterBlocks";
import { defaultGenerationSettings, generateCityOnDocument } from "../../src/city-editor/core/generate";
import { facePoints } from "../../src/city-editor/core/mesh";

const seed = "reference-town";
const base = createGridDocument({ size: "small", grid: "evolution", seed });
const settings = defaultGenerationSettings();
const doc = generateCityOnDocument(base, settings, seed)!;

console.log("doc.fabric is:", doc.fabric ? "defined" : "undefined");
console.log("doc.layout is:", doc.layout);
const distFace = doc.mesh.faces.f45;
console.log("District face properties:", distFace?.properties);

const polygon = facePoints(doc.mesh, distFace);
console.log("District polygon vertex count:", polygon.length);

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

console.log(`Fabric blocks: ${fabric.blocks.length}, buildings: ${fabric.buildings.length}`);

const triangles = fabric.buildings.filter(b => b.polygon.length === 3);
console.log(`Triangles generated: ${triangles.length}`);
for (let i = 0; i < triangles.length; i++) {
  console.log(`Triangle ${i}:`, JSON.stringify(triangles[i].polygon));
}
