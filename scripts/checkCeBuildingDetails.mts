/** node --import tsx scripts/checkCeBuildingDetails.mts */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createGridDocument } from "../src/city-editor/generators/document";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import type { CityDocument } from "../src/city-editor/types/document";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5199, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
  await page.addInitScript("globalThis.__name = value => value;");
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/details-check.html", route =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" })
  );
  await page.goto("http://127.0.0.1:5199/details-check.html");
  const result = await page.evaluate(async () => (await import("/scripts/lib/ceBuildingDetailsPreview.ts")).run());
  for (const [id, image] of Object.entries(result.images) as [string, string][]) {
    if (!id.endsWith("far"))
      writeFileSync(
        resolve(`docs/analytics/ce-building-details-${id}.png`),
        Buffer.from(image.split(",")[1], "base64")
      );
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("http://127.0.0.1:5199/src/building-viewer/index.html");
  await page.getByText("CE regional houses", { exact: true }).click();
  await page.locator('[data-appearance-profile="northern-urban"]').click();
  await page.evaluate(
    () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
  await page.locator(".bv-stage").screenshot({ path: resolve("docs/analytics/ce-building-details-bv.png") });
  const settings = defaultGenerationSettings();
  settings.buildingPattern = "medieval";
  settings.historicalPeriod = "highMedieval";
  const seed = "regional-appearance";
  const city = generateCityOnDocument(createGridDocument({ size: "small", grid: "evolution", seed }), settings, seed)!;
  city.buildingAppearanceProfile = "northern-urban";
  await page.goto("http://127.0.0.1:5199/details-check.html");
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.evaluate(async input => {
    const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
    document.body.innerHTML =
      '<style>body{margin:0}.ce-3d{width:1000px;height:720px}.ce-view-toggle{position:absolute;top:8px;left:8px}</style><div id="host"></div><div id="map"></div>';
    const state = window as unknown as { facadeView: { sync(): void; dispose(): void } };
    state.facadeView = mountCity3d({
      canvasHost: document.querySelector("#host")!,
      map: document.querySelector("#map")!,
      getDocument: () => input,
      scope: {
        own() {},
        listen(target: EventTarget, type: string, handler: EventListener) {
          target.addEventListener(type, handler);
        }
      }
    });
  }, city);
  await page.locator(".ce-view-toggle").click();
  const ceViews: object[] = [];
  for (const [mode, wheel] of [
    ["overview", 0],
    ["near", -2600],
    ["returned-far", 2600]
  ] as const) {
    await page.locator(".ce-3d canvas").hover();
    if (wheel) await page.mouse.wheel(0, wheel);
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    const checked = await page.locator(".ce-3d canvas").evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
      return { contextLost: gl.isContextLost(), error: gl.getError() };
    });
    if (checked.contextLost || checked.error) throw new Error("Invalid CE detail view");
    await page.locator(".ce-3d").screenshot({ path: resolve(`docs/analytics/ce-building-details-city-${mode}.png`) });
    ceViews.push({ mode, ...checked });
  }
  await page.evaluate(() => (window as unknown as { facadeView: { dispose(): void } }).facadeView.dispose());
  if (errors.length) throw new Error(errors.join("\n"));
  const { images, ...report } = result;
  writeFileSync(
    "docs/analytics/ce-building-details-browser.json",
    JSON.stringify({ date: new Date().toISOString(), errors, ceViews, ...report }, null, 2) + "\n"
  );
  console.log(JSON.stringify({ errors, backend: result.backend, cases: result.results.length }));
} finally {
  await browser?.close();
  await server.close();
}
