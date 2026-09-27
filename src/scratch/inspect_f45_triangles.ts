import { createGridDocument } from "../../src/city-editor/core/document";
import { buildBlockFabric } from "../../src/city-editor/core/gen/blockInfill";
import { defaultGenerationSettings, generateCityOnDocument } from "../../src/city-editor/core/generate";

const seed = "reference-town";
const base = createGridDocument({ size: "small", grid: "evolution", seed });
const settings = defaultGenerationSettings();
const doc = generateCityOnDocument(base, settings, seed)!;

const fabric = buildBlockFabric(doc);
const f45Buildings = fabric.buildings.filter(b => b.faceId === "f45");

console.log("=== Triangle buildings in face f45 ===");
for (let i = 0; i < f45Buildings.length; i++) {
  const b = f45Buildings[i];
  if (b.polygon.length === 3) {
    console.log(`Index ${i} is TRIANGLE:`, JSON.stringify(b.polygon));
    if (i > 0)
      console.log(`  prev (${f45Buildings[i - 1].polygon.length} pts):`, JSON.stringify(f45Buildings[i - 1].polygon));
    if (i < f45Buildings.length - 1)
      console.log(`  next (${f45Buildings[i + 1].polygon.length} pts):`, JSON.stringify(f45Buildings[i + 1].polygon));
  }
}
