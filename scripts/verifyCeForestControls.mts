/** F4 UI smoke check: node --import tsx scripts/verifyCeForestControls.mts */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import type { CityDocument } from "../src/city-editor/types/document";

const output = resolve("docs/analytics/ce-forest-f4");
mkdirSync(output, { recursive: true });
const city: CityDocument = JSON.parse(readFileSync("docs/analytics/raw/ce-forest-f0/small-flat.json", "utf8"));
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5202, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
  await page.goto("http://127.0.0.1:5202/src/city-editor/index.html");
  await page.locator(".ce-map svg").waitFor();
  const result = await page.evaluate(async original => {
    // @ts-expect-error Vite serves browser-only modules.
    const { editorText } = await import("/src/i18n/editorMessages.ts");
    const click = (key: string) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === editorText(key));
      if (!button) throw new Error(`Missing action ${key}`);
      button.click();
    };
    const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const drop = async (city: CityDocument) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(city)], "forest.json", { type: "application/json" }));
      document.querySelector(".ce-map")!.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
    };
    const select = (name: string, value: string) => {
      const control = document.querySelector<HTMLSelectElement>(`.ce-forest-${name}`)!;
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const area = () => Number(document.querySelector(".ce-forest-layer")?.getAttribute("data-forest-area-m2") ?? 0);
    let lastBlob: Blob | undefined;
    URL.createObjectURL = blob => { lastBlob = blob as Blob; return "blob:forest-check"; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
    const save = async (): Promise<CityDocument> => {
      click("cityEditor.messages.exportEditableCityMapJSON");
      return JSON.parse(await lastBlob!.text());
    };
    await drop(original);
    select("mode", "surroundings");
    select("density", "dense");
    const beforeApplyArea = area();
    document.querySelector<HTMLButtonElement>(".ce-forest-apply")!.click();
    const appliedArea = area();
    const saved = await save();
    click("cityEditor.messages.undo");
    const undoArea = area();
    click("cityEditor.messages.redo");
    const redoArea = area();
    select("representation", "all-trees");
    const representation = document.querySelector(".ce-forest-layer")!.getAttribute("data-forest-representation");
    const allTreesArea = area();
    click("cityEditor.messages.exportCityMapAsSVG");
    const svgExport = await lastBlob!.text();
    select("quality", "light");
    await drop(saved);
    const reloadArea = area();
    // Reveal the normal Generate window and select its landscape tab for the image.
    const panel = document.querySelector<HTMLElement>(".ce-generate")!;
    panel.hidden = false;
    panel.classList.remove("ce-panel--collapsed");
    panel.querySelector<HTMLElement>(".ce-panel-content")!.hidden = false;
    document.querySelector<HTMLButtonElement>('[data-generation-tab="elements"]')!.click();
    document.querySelector(".ce-forest-controls")!.scrollIntoView({ block: "nearest" });
    (window as any).forestControlsCheck = { save, select, nextFrame };
    return { beforeApplyArea, appliedArea, undoArea, redoArea, allTreesArea, reloadArea, representation, svgExportUsesAllTrees: svgExport.includes('data-forest-representation="all-trees"'), layoutPreserved: JSON.stringify(saved.mesh) === JSON.stringify(original.mesh), contentsPreserved: JSON.stringify(saved.elements) === JSON.stringify(original.elements), settings: saved.forestSettings, renderer: navigator.userAgent };
  }, city);
  assert.equal(result.beforeApplyArea, 0);
  assert.ok(result.appliedArea > 0);
  assert.equal(result.undoArea, 0);
  for (const area of [result.redoArea, result.allTreesArea, result.reloadArea]) assert.equal(area, result.appliedArea);
  assert.equal(result.layoutPreserved, true);
  assert.equal(result.contentsPreserved, true);
  assert.equal(result.representation, "all-trees");
  assert.equal(result.svgExportUsesAllTrees, true);
  await page.screenshot({ path: resolve(output, "landscape-controls.png") });
  await page.locator('[data-generation-tab="view"]').click();
  await page.locator(".ce-forest-view-controls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "view-controls.png") });
  await page.locator(".ce-view-toggle").click();
  await page.waitForTimeout(500);
  const three = await page.evaluate(async () => {
    const probe = (window as any).forestControlsCheck;
    const performancePanel = document.querySelector<HTMLDetailsElement>(".ce-performance")!;
    performancePanel.open = true;
    performancePanel.dispatchEvent(new Event("toggle"));
    const before = performancePanel.querySelector("pre")!.textContent;
    probe.select("quality", "auto");
    await probe.nextFrame();
    performancePanel.dispatchEvent(new Event("toggle"));
    return { light: before, auto: performancePanel.querySelector("pre")!.textContent };
  });
  assert.ok(three.light?.includes("light / light"));
  assert.ok(three.auto?.includes("auto / standard"));
  await page.screenshot({ path: resolve(output, "forest-3d-controls.png") });
  await page.reload();
  await page.locator(".ce-forest-quality").waitFor({ state: "attached" });
  assert.equal(await page.locator(".ce-forest-quality").inputValue(), "auto");
  assert.equal(await page.locator(".ce-forest-representation").inputValue(), "all-trees");
  assert.deepEqual(errors, []);
  writeFileSync(resolve(output, "results.json"), `${JSON.stringify({ capturedAt: new Date().toISOString(), ...result, three, errors }, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, errors }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
