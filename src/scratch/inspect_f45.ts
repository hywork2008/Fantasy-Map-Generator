import { createGridDocument } from "../../src/city-editor/core/document";
import { buildBlockFabric } from "../../src/city-editor/core/gen/blockInfill";
import { defaultGenerationSettings, generateCityOnDocument } from "../../src/city-editor/core/generate";
import { facePoints } from "../../src/city-editor/core/mesh";

const seed = "reference-town";
const base = createGridDocument({ size: "small", grid: "evolution", seed });
const settings = defaultGenerationSettings();
const doc = generateCityOnDocument(base, settings, seed)!;

const face = doc.mesh.faces.f45;
console.log("=== Face f45 properties ===");
console.log(face.properties);
console.log("Face points:", facePoints(doc.mesh, face));

// face f45 の境界エッジ
for (const ref of face.boundary) {
  const edge = doc.mesh.edges[ref.edgeId];
  console.log(
    `Edge ${ref.edgeId}: a=${doc.mesh.vertices[edge.a].point}, b=${doc.mesh.vertices[edge.b].point}, road=${doc.featureGroups.some(g => g.kind === "road" && g.segments.some(s => s.edgeId === ref.edgeId))}`
  );
}

const fabric = buildBlockFabric(doc);
const f45Buildings = fabric.buildings.filter(b => b.faceId === "f45");
console.log(`Face f45 total buildings: ${f45Buildings.length}`);

for (let i = 0; i < f45Buildings.length; i++) {
  const b = f45Buildings[i];
  console.log(`Building ${i} (${b.polygon.length} vertices):`, JSON.stringify(b.polygon));
}
