/**
 * Package a built extension into a distributable ZIP file.
 *
 * Usage:
 *   npx tsx scripts/package-extension.ts economy
 *
 * Expects `dist/extensions/<name>/` to exist (run `npm run build:<name>` first).
 * Outputs `dist/extensions/<name>.zip` containing:
 *   - manifest.json  (generated from the metadata below)
 *   - <name>.mjs     (the bundled JS)
 *   - <name>.css     (optional CSS, if present)
 */

import fs from "fs";
import path from "path";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Extension metadata registry
// ---------------------------------------------------------------------------
const MANIFESTS: Record<string, { id: string; name: string; version: string; description: string }> = {
  economy: {
    id: "economy",
    name: "Economy, Goods & Trade",
    version: "1.0.0",
    description: "Adds economy system including goods production, markets, and trade routes."
  }
};

// ---------------------------------------------------------------------------

const extensionName = process.argv[2];
if (!extensionName) {
  console.error("Usage: tsx scripts/package-extension.ts <extension-name>");
  process.exit(1);
}

const manifest = MANIFESTS[extensionName];
if (!manifest) {
  console.error(`No manifest entry found for extension: "${extensionName}"`);
  console.error(`Available: ${Object.keys(MANIFESTS).join(", ")}`);
  process.exit(1);
}

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const srcDir = path.join(rootDir, "dist", "extensions", extensionName);
const outFile = path.join(rootDir, "dist", "extensions", `${extensionName}.zip`);

if (!fs.existsSync(srcDir)) {
  console.error(`Build output not found at: ${srcDir}`);
  console.error(`Run 'npm run build:${extensionName}' first.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });

const zip = new JSZip();
zip.file("manifest.json", JSON.stringify(manifest, null, 2));

const files = fs.readdirSync(srcDir);

const jsFile = files.find(f => /\.(m?js)$/.test(f));
if (!jsFile) {
  console.error(`No .js/.mjs file found in ${srcDir}`);
  process.exit(1);
}
zip.file(jsFile, fs.readFileSync(path.join(srcDir, jsFile)));

const cssFile = files.find(f => f.endsWith(".css"));
if (cssFile) {
  zip.file(cssFile, fs.readFileSync(path.join(srcDir, cssFile)));
}

const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
fs.writeFileSync(outFile, buffer);

const kb = (buffer.byteLength / 1024).toFixed(1);
console.log(`✓ Packaged: ${outFile} (${kb} KB)`);
