import { createGridDocument } from "../city-editor/generators/document";
import { generateCityOnDocument } from "../city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../city-editor/generators/generation/settings";

// デバッグ用スクリプト
const seed = "reference-town";
const base = createGridDocument({ size: "small", grid: "evolution", seed });
const settings = defaultGenerationSettings();
generateCityOnDocument(base, settings, seed);

// f45 の face を探す
console.log("Done");
