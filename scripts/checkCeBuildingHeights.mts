/** node --import tsx scripts/checkCeBuildingHeights.mts */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createUrbanMorphology } from "../src/utils/urbanMorphology";
import { buildBlockFabric, clearBlockFabricCache } from "../src/city-editor/generators/blockInfill";
import { DEFAULT_BUILDING_HEIGHT_POLICY, assignResidentialHeightDistribution } from "../src/city-editor/generators/buildingHeightPolicy";
import { createGridDocument } from "../src/city-editor/generators/document";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import { defaultPopulationSettings } from "../src/city-editor/generators/populationPlan";
import { synthSite } from "../src/city-editor/generators/site/synthSite";
import { withBuildingHeightPolicy } from "../src/city-editor/generators/updateBuildingHeights";
import { parseDocument, serializeDocument } from "../src/city-editor/services/io/documentCodec";
import type { CityDocument } from "../src/city-editor/types/document";
import { createCityMassing } from "../src/city3d/three/cityMeshes";

const settings = defaultGenerationSettings();
settings.buildingHeightPolicy = undefined;
settings.historicalPeriod = "lateMedieval";
settings.config.coast = "none";
settings.config.rivers = [];
settings.config.relief = false;
settings.config.features.citadel = false;
settings.config.features.port = false;
const standaloneSettings = { ...settings, config: structuredClone(settings.config), population: defaultPopulationSettings(3000), layout: "organic" as const, elevationPreset: "slope" as const };
const standalone = generateCityOnDocument(createGridDocument({ size: "small", grid: "hex", seed: "height-standalone" }), standaloneSettings, "height-standalone");
assert(standalone, "Standalone fixture failed to generate");
const expanded = generateCityOnDocument(createGridDocument({ size: "small", grid: "hex", seed: "height-standalone" }), { ...standaloneSettings, buildingHeightPolicy: DEFAULT_BUILDING_HEIGHT_POLICY }, "height-standalone");
assert(expanded, "Low-rise area calibration failed");
const coreCount = (city: CityDocument) => Object.values(city.mesh.faces).filter(face => face.properties.settlement === "core").length;
assert(coreCount(expanded) > coreCount(standalone));
assert.equal(expanded.populationReport!.unplacedPopulation, 0);
const generatedStandalone = { legacyCoreCells: coreCount(standalone), variedCoreCells: coreCount(expanded), areaScale: expanded.populationPlan?.areaScale, housing: expanded.housingCapacity, population: expanded.populationReport };

const fmgSeed = "fabric-growth";
const input = createGridDocument({ size: "tiny", grid: "hex", seed: fmgSeed });
const descriptor = synthSite("smallTown", settings.config, fmgSeed, input.frame);
descriptor.historicalPeriod = "lateMedieval";
descriptor.urbanMorphology = createUrbanMorphology({ seed: fmgSeed, burgId: 1, year: 1500, population: descriptor.burg.population, capital: false, walls: true, polityAge: 178, generationYears: 30.5, polityPower: 0.5, defensePressure: 0.2, period: "lateMedieval", religious: false, extramuralBurial: false, plaza: false });
const fmg = generateCityOnDocument(input, { ...settings, descriptor }, fmgSeed);
assert(fmg?.urbanGrowth, "FMG-path fixture failed to generate");
const crowded = structuredClone(fmg);
crowded.urbanGrowth!.requiredDwellings = 100000;
crowded.urbanGrowth!.insideStoreys = 4;
const cases = [{ id: "standalone", legacy: standalone }, { id: "fmg-descriptor", legacy: fmg }, { id: "crowded", legacy: crowded }];
const metrics: object[] = [];
for (const sample of cases) {
  const start = performance.now();
  const varied = withBuildingHeightPolicy(sample.legacy, DEFAULT_BUILDING_HEIGHT_POLICY);
  const updateMs = performance.now() - start;
  assert.deepEqual(varied.mesh, sample.legacy.mesh);
  assert.deepEqual(varied.featureGroups, sample.legacy.featureGroups);
  assert(parseDocument(serializeDocument(varied)), `${sample.id}: round-trip failed`);
  for (const [mode, city] of [["legacy", sample.legacy], ["varied", varied]] as const) {
    const lots = buildBlockFabric(city).buildings;
    const histogram: Record<string, number> = {};
    for (const lot of lots) {
      if (lot.landmark || (lot.role && lot.role !== "main")) continue;
      for (const [key, count] of Object.entries(lot.residentialCluster?.templateCounts ?? { [`${lot.storeys ?? 1}f`]: 1 })) {
        const storeys = key.split(":")[0];
        histogram[storeys] = (histogram[storeys] ?? 0) + count;
      }
    }
    const mesh = createCityMassing(lots);
    const triangles = mesh.pickables.reduce((sum, part) => sum + part.geometry.attributes.position.count / 3, 0);
    const bufferBytes = mesh.pickables.reduce((sum, part) => sum + Object.values(part.geometry.attributes).reduce((n, attribute) => n + attribute.array.byteLength, 0), 0);
    mesh.dispose();
    if (mode === "varied") {
      const physicalLots = lots.map(lot => ({ ...lot, residentialCluster: undefined }));
      assignResidentialHeightDistribution(city, physicalLots);
      const times = Array.from({ length: 5 }, () => { const t = performance.now(); assignResidentialHeightDistribution(city, physicalLots); return performance.now() - t; }).sort((a, b) => a - b);
      metrics.push({ id: sample.id, mode, histogram, updateMs, distributionMsPer1000Lots: times[2] / Math.max(1, lots.length) * 1000, lots: lots.length, triangles, bufferBytes, housing: city.housingCapacity, population: city.populationReport });
    } else metrics.push({ id: sample.id, mode, histogram, lots: lots.length, triangles, bufferBytes, housing: city.housingCapacity, population: city.populationReport });
    clearBlockFabricCache(city);
  }
}
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5217, strictPort: true, hmr: false, watch: null } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.addInitScript('globalThis.__name = value => value; localStorage.setItem("fmg-language", "ja");');
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5217/src/city-editor/index.html");
  const click = async (key: string) => {
    const label = await page.evaluate(async key => (await import("/src/i18n/editorMessages.ts")).editorText(key as any), key);
    await page.getByRole("button", { name: label, exact: true }).click();
  };
  const save = async () => {
    const pending = page.waitForEvent("download");
    await click("cityEditor.messages.exportEditableCityMapJSON");
    const download = await pending;
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync((await download.path())!, "utf8")) as CityDocument;
  };
  for (const sample of cases) {
    const chooser = page.waitForEvent("filechooser");
    await click("cityEditor.messages.importCityMapOrSVGReference");
    await (await chooser).setFiles({ name: `${sample.id}.json`, mimeType: "application/json", buffer: Buffer.from(serializeDocument(sample.legacy)) });
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>(".ce-update-building-heights")?.disabled === false);
    const toggle = page.locator(".ce-view-toggle");
    if ((await toggle.textContent())?.includes("3D")) await toggle.click();
    const capture = async (mode: string) => {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.waitForTimeout(300);
      const style = await page.addStyleTag({ content: ".ce-panel { visibility: hidden !important; }" });
      await page.screenshot({ path: `docs/analytics/ce-building-heights-${sample.id}-${mode}.png` });
      await style.evaluate(node => node.remove());
    };
    await capture("legacy");
    await page.locator(".ce-update-building-heights").click();
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>(".ce-update-building-heights")?.disabled === true);
    await capture("varied");
    const saved = await save();
    assert.deepEqual(saved.buildingHeightPolicy, DEFAULT_BUILDING_HEIGHT_POLICY);
    assert.deepEqual(saved.mesh, sample.legacy.mesh);
    await click("cityEditor.messages.undo");
    assert.equal(await page.locator(".ce-update-building-heights").isEnabled(), true);
    await click("cityEditor.messages.redo");
    assert.equal(await page.locator(".ce-update-building-heights").isDisabled(), true);
    const gl = await page.evaluate(() => [...document.querySelectorAll("canvas")].map(canvas => {
      const gl = canvas.getContext("webgl2");
      return gl ? { lost: gl.isContextLost(), error: gl.getError() } : null;
    }).filter(Boolean));
    assert(gl.every(state => state && !state.lost && state.error === 0));
  }
  const expandedChooser = page.waitForEvent("filechooser");
  await click("cityEditor.messages.importCityMapOrSVGReference");
  await (await expandedChooser).setFiles({ name: "expanded-low-rise.json", mimeType: "application/json", buffer: Buffer.from(serializeDocument(expanded)) });
  await page.waitForFunction(() => (document.querySelector(".ce-generate-seed") as HTMLInputElement)?.value === "height-standalone");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForTimeout(300);
  const expandedStyle = await page.addStyleTag({ content: ".ce-panel { visibility: hidden !important; }" });
  await page.screenshot({ path: "docs/analytics/ce-building-heights-standalone-expanded.png" });
  await expandedStyle.evaluate(node => node.remove());
  assert.deepEqual(errors, []);
  writeFileSync("docs/analytics/ce-building-heights-check.json", JSON.stringify({ fixtureNote: "The FMG case uses a synthetic BurgSiteDescriptor, not a saved FMG world. The crowded case raises demand on the same fixed city. Browser uses headless Chromium; timings do not measure GPU FPS.", metrics, generatedStandalone, errors }, null, 2) + "\n");
  console.log(JSON.stringify({ cases: cases.length, metrics, generatedStandalone, errors }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
