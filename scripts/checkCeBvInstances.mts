/** node --import tsx scripts/checkCeBvInstances.mts */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

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
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/bv-instances-check.html", route =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" })
  );
  await page.goto("http://127.0.0.1:5199/bv-instances-check.html");
  const result = await page.evaluate(async () => (await import("/scripts/lib/ceBvInstancesPreview.ts")).run());
  writeFileSync("docs/analytics/ce-bv-instances-preview.png", Buffer.from(result.image.split(",")[1], "base64"));
  await page.goto("http://127.0.0.1:5199/bv-instances-check.html");
  await page.evaluate(async () => {
    const { fixture } = await import("/scripts/lib/ceBvInstancesPreview.ts");
    const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
    document.body.innerHTML =
      '<style>body{margin:0}.ce-3d{width:1000px;height:720px}.ce-view-toggle{position:absolute;top:8px;left:8px}.ce-3d-readout{position:absolute;bottom:8px;left:8px;background:#fff;padding:8px;white-space:pre}</style><div id="host"></div><div id="map"></div>';
    const state = window as any;
    state.bvCity = fixture();
    state.bvView = mountCity3d({
      canvasHost: document.querySelector("#host")!,
      map: document.querySelector("#map")!,
      getDocument: () => state.bvCity,
      scope: {
        own() {},
        listen(target: EventTarget, type: string, handler: EventListener) {
          target.addEventListener(type, handler);
        }
      }
    });
  });
  await page.locator(".ce-view-toggle").click();
  await page.locator(".ce-3d canvas").click({ position: { x: 500, y: 360 } });
  const picked = await page.locator(".ce-3d-readout").textContent();
  if (!picked?.includes("temple:chapel-1")) throw new Error(`Wrong CE instance pick: ${picked}`);
  await page.locator(".ce-3d").screenshot({ path: "docs/analytics/ce-bv-instances-city.png" });
  for (const profile of ["legacy", "atlantic"]) {
    await page.evaluate(profile => {
      const state = window as any;
      state.bvCity = { ...state.bvCity, buildingAppearanceProfile: profile };
      state.bvView.sync();
    }, profile);
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
  }
  await page.locator(".ce-3d canvas").click({ position: { x: 500, y: 360 } });
  if (!(await page.locator(".ce-3d-readout").textContent())?.includes("temple:chapel-1"))
    throw new Error("Instance selection broke after refresh");
  const webgl = await page.locator(".ce-3d canvas").evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
    return { lost: gl.isContextLost(), error: gl.getError() };
  });
  await page.evaluate(() => (window as any).bvView.dispose());
  if (errors.length || webgl.lost || webgl.error) throw new Error(JSON.stringify({ errors, webgl }));
  const report = {
    date: new Date().toISOString(),
    ...result.report,
    errors,
    webgl,
    picked,
    refresh: ["legacy", "atlantic"]
  };
  writeFileSync("docs/analytics/ce-bv-instances-browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
