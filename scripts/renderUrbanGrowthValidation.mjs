/** Render generated, local CE SVGs at a common scale for visual review. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const directory = resolve(process.argv[2] ?? "temp/urban-growth-validation");
const names = ["1-before", "1-after"];
const sources = names.map(name => readFileSync(join(directory, `${name}.svg`), "utf8"));
const viewBox = sources[0].match(/viewBox="([^"]+)"/)[1];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
  for (let i = 0; i < names.length; i++) {
    await page.setContent(`<style>html,body{margin:0;background:#e7e3d5}svg{width:1400px;height:1400px}</style>${sources[i].replace(/<\?xml[^>]*>/, "").replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`)}`);
    await page.screenshot({ path: join(directory, `${names[i]}.png`) });
  }
} finally { await browser.close(); }
