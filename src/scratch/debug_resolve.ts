import { createGridDocument } from "../../src/city-editor/core/document";
import { defaultGenerationSettings, generateCityOnDocument } from "../../src/city-editor/core/generate";

// デバッグ用スクリプト
const seed = "reference-town";
const base = createGridDocument({ size: "small", grid: "evolution", seed });
const settings = defaultGenerationSettings();
const _doc = generateCityOnDocument(base, settings, seed)!;

// f45 の face を探す
console.log("Done");
