/** Render CE's actual regional-house replacements, rather than the canonical BV sample. */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5198, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript("globalThis.__name = value => value;");
  await page.route("**/regional-houses-check.html", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><style>body{margin:0;background:#ece7dc;font:16px sans-serif}h2{margin:10px 20px 0}canvas{display:block}</style><body></body>'
  }));
  await page.goto("http://127.0.0.1:5198/regional-houses-check.html");
  const report = await page.evaluate(async () => {
    const { run } = await import("/scripts/lib/ceRegionalHousesPreview.ts");
    return run();
  });
  if (errors.length) throw new Error(errors.join("\n"));
  await page.screenshot({ path: "docs/analytics/ce-regional-houses-20261026.png", fullPage: true });
  writeFileSync("docs/analytics/ce-regional-houses-20261026.json", JSON.stringify({ errors, ...report }, null, 2) + "\n");
  console.log(JSON.stringify({ errors, cases: report.cases.length }));
} finally {
  await browser?.close();
  await server.close();
}
