/** node --import tsx scripts/checkCeHouseChimneys.mts */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5198, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1350, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript("globalThis.__name = value => value;");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/chimney-check.html", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><style>body{margin:0;background:#e5dfd2;font:16px sans-serif;display:grid;grid-template-columns:repeat(3,450px)}h2{height:44px;font-size:16px;padding:12px 16px 0;margin:0}canvas{display:block}</style><body></body>'
  }));
  await page.goto("http://127.0.0.1:5198/chimney-check.html");
  const cases = await page.evaluate(async () => (await import("/scripts/lib/ceHouseChimneysPreview.ts")).run());
  if (errors.length) throw new Error(errors.join("\n"));
  await page.screenshot({ path: "docs/analytics/ce-house-chimneys-20261026.png", fullPage: true });
  writeFileSync("docs/analytics/ce-house-chimneys-20261026.json", JSON.stringify({ errors, cases }, null, 2) + "\n");
  console.log(JSON.stringify({ errors, cases: cases.length }));
} finally {
  await browser?.close();
  await server.close();
}
