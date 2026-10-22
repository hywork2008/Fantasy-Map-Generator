/** Run benchmarkCeRegionalColors.mts first; verifies exports and the real BV preview in Chromium. */
import { readFileSync, writeFileSync } from "node:fs";
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
const profiles = ["mediterranean", "northern-wooded", "northern-urban", "stone-upland"];
const results: object[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  // tsx preserves nested function names with this helper when serializing evaluate callbacks.
  await page.addInitScript("globalThis.__name = value => value;");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const profile of profiles) {
    const svg = readFileSync(`/tmp/ce-regional-colors/${profile}.svg`, "utf8");
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
    await page.locator("body > svg").evaluate(svg => {
      svg.setAttribute("width", "900");
      svg.setAttribute("height", "900");
    });
    const checked = await page
      .locator(".ce-building[style*='--ce-roof-color']")
      .first()
      .evaluate(node => ({
        expected: (node as SVGElement).style.getPropertyValue("--ce-roof-color"),
        actual: getComputedStyle(node).fill
      }));
    const actualHex = await page.evaluate(rgb => {
      const c = document.createElement("canvas").getContext("2d")!;
      c.fillStyle = rgb;
      return c.fillStyle;
    }, checked.actual);
    if (actualHex.toLowerCase() !== checked.expected.toLowerCase())
      throw new Error(`Export color mismatch: ${profile}`);
    await page.screenshot({ path: resolve(`docs/analytics/ce-regional-colors-${profile}-2d.png`) });
    results.push({ profile, exportComputedFill: checked.actual, expectedHex: checked.expected });
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("http://127.0.0.1:5199/src/building-viewer/index.html");
  await page.getByText("CE regional houses", { exact: true }).click();
  for (const profile of profiles) {
    await page.locator(`[data-appearance-profile="${profile}"]`).click();
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    const checked = await page.evaluate(() => {
      const gl = document.querySelector<HTMLCanvasElement>(".bv-stage canvas")!.getContext("webgl2")!;
      return {
        contextLost: gl.isContextLost(),
        glError: gl.getError(),
        planColors: [
          ...new Set([...document.querySelectorAll(".bv-plans path[fill]")].map(p => p.getAttribute("fill")))
        ]
      };
    });
    if (checked.contextLost || checked.glError || checked.planColors.length < 2)
      throw new Error(`Invalid BV preview: ${profile}`);
    await page
      .locator(".bv-stage")
      .screenshot({ path: resolve(`docs/analytics/ce-regional-colors-${profile}-3d.png`) });
    results.push({ profile, ...checked });
  }
  const settings = defaultGenerationSettings();
  settings.buildingPattern = "medieval";
  settings.historicalPeriod = "highMedieval";
  const seed = "regional-appearance";
  const city = generateCityOnDocument(createGridDocument({ size: "small", grid: "evolution", seed }), settings, seed)!;
  await page.route("**/ce-check.html", route =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" })
  );
  await page.goto("http://127.0.0.1:5199/ce-check.html");
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.evaluate(async input => {
    const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
    document.body.innerHTML =
      '<style>body{margin:0}.ce-3d{width:1000px;height:720px}.ce-view-toggle{position:absolute;top:8px;left:8px}</style><div id="host"></div><div id="map"></div>';
    const state = window as unknown as { regionalCity: CityDocument; regionalView: { sync(): void; dispose(): void } };
    state.regionalCity = input;
    state.regionalView = mountCity3d({
      canvasHost: document.querySelector("#host")!,
      map: document.querySelector("#map")!,
      getDocument: () => state.regionalCity,
      scope: {
        own() {},
        listen(target: EventTarget, type: string, handler: EventListener) {
          target.addEventListener(type, handler);
        }
      }
    });
  }, city);
  await page.locator(".ce-view-toggle").click();
  for (const profile of profiles) {
    await page.evaluate(profile => {
      const state = window as unknown as { regionalCity: CityDocument; regionalView: { sync(): void } };
      state.regionalCity.buildingAppearanceProfile = profile as CityDocument["buildingAppearanceProfile"];
      state.regionalView.sync();
    }, profile);
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    const checked = await page.locator(".ce-3d canvas").evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
      return { contextLost: gl.isContextLost(), glError: gl.getError() };
    });
    if (checked.contextLost || checked.glError) throw new Error(`Invalid CE city: ${profile}`);
    await page
      .locator(".ce-3d")
      .screenshot({ path: resolve(`docs/analytics/ce-regional-colors-${profile}-city3d.png`) });
    results.push({ profile, view: "CE full city and live profile update", ...checked });
  }
  await page.evaluate(() => (window as unknown as { regionalView: { dispose(): void } }).regionalView.dispose());
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    resolve("docs/analytics/ce-regional-colors-browser.json"),
    `${JSON.stringify({ date: new Date().toISOString(), browser: await browser.version(), errors, results }, null, 2)}\n`
  );
  console.log(JSON.stringify({ errors, checked: results.length }));
} finally {
  await browser?.close();
  await server.close();
}
