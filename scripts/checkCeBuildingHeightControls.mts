/** node --import tsx scripts/checkCeBuildingHeightControls.mts */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5218, strictPort: true, hmr: false, watch: null } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript('globalThis.__name = value => value; localStorage.setItem("fmg-language", "ja");');
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5218/src/city-editor/index.html");
  const click = async (key: string) => {
    const label = await page.evaluate(async key => (await import("/src/i18n/editorMessages.ts")).editorText(key as any), key);
    await page.getByRole("button", { name: label, exact: true }).click();
  };
  const save = async () => {
    const pending = page.waitForEvent("download");
    await click("cityEditor.messages.exportEditableCityMapJSON");
    const file = await pending;
    return JSON.parse(readFileSync((await file.path())!, "utf8"));
  };
  const mode = page.locator(".ce-building-height-mode");
  assert.equal(await mode.inputValue(), "varied");
  await mode.selectOption("uniform");
  assert.equal(await mode.inputValue(), "uniform");
  const set = async (selector: string, value: string) => { await page.locator(selector).fill(value); await page.locator(selector).press("Tab"); };
  await set(".ce-city-height-storeys", "3");
  await set(".ce-city-height-meters", "12");
  await page.locator(".ce-cells path[data-pick]").nth(10).dispatchEvent("click");
  await set(".ce-cell-height-storeys", "1");
  await set(".ce-cell-height-meters", "4.5");
  const uniform = await save();
  assert.equal(uniform.buildingHeightPolicy, undefined);
  assert.deepEqual(uniform.buildingHeightLimit, { maxStoreys: 3, maxHeightMeters: 12 });
  assert(Object.values(uniform.mesh.faces).some((face: any) => face.properties.buildingHeightLimit?.maxHeightMeters === 4.5));
  await click("cityEditor.messages.undo");
  await page.locator(".ce-cells path[data-pick]").nth(10).dispatchEvent("click");
  assert.equal(await page.locator(".ce-cell-height-meters").inputValue(), "");
  await click("cityEditor.messages.redo");
  await page.locator(".ce-cells path[data-pick]").nth(10).dispatchEvent("click");
  assert.equal(await page.locator(".ce-cell-height-meters").inputValue(), "4.5");
  await mode.selectOption("varied");
  const varied = await save();
  assert.equal(varied.buildingHeightPolicy.version, 1);
  assert.deepEqual(varied.buildingHeightLimit, uniform.buildingHeightLimit);
  const chooser = page.waitForEvent("filechooser");
  await click("cityEditor.messages.importCityMapOrSVGReference");
  await (await chooser).setFiles({ name: "height-zoning.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(varied)) });
  assert.equal(await mode.inputValue(), "varied");
  const loaded = await save();
  assert.deepEqual(loaded.buildingHeightLimit, varied.buildingHeightLimit);
  assert.deepEqual(loaded.mesh, varied.mesh);
  const limitedCell = Object.values(loaded.mesh.faces).find((face: any) => face.properties.buildingHeightLimit) as any;
  await page.locator(".ce-cells path[data-pick]").evaluateAll((nodes, id) => {
    const node = nodes.find(node => JSON.parse(decodeURIComponent(node.getAttribute("data-pick")!)).id === id);
    if (!node) throw new Error("Saved zoning cell was not rendered");
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, limitedCell.id);
  assert.equal(await page.locator(".ce-cell-height-storeys").inputValue(), "1");
  assert.equal(await page.locator(".ce-cell-height-meters").inputValue(), "4.5");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "docs/analytics/ce-building-height-controls.png" });
  writeFileSync("docs/analytics/ce-building-height-controls-check.json", JSON.stringify({ defaultMode: "varied", uniformMode: "uniform", cityLimit: loaded.buildingHeightLimit, cellLimits: Object.values(loaded.mesh.faces).filter((face: any) => face.properties.buildingHeightLimit).map((face: any) => ({ id: face.id, limit: face.properties.buildingHeightLimit })), undoRedo: true, jsonRoundTrip: true, errors }, null, 2) + "\n");
  console.log("Height mode, city/cell limits, undo/redo and JSON round-trip: OK");
} finally {
  await browser?.close();
  await server.close();
}
