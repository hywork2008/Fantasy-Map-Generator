/** node --import tsx scripts/checkCeHousingControls.mts */
import { readFileSync, writeFileSync } from "node:fs";
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  await page.addInitScript('globalThis.__name = value => value; localStorage.setItem("fmg-language", "ja");');
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5199/src/city-editor/index.html");
  const clickMessage = async (key: string) => {
    const caption = await page.evaluate(
      async key => (await import("/src/i18n/editorMessages.ts")).editorText(key as any),
      key
    );
    await page.getByRole("button", { name: caption, exact: true }).click();
  };
  const save = async () => {
    const downloaded = page.waitForEvent("download");
    await clickMessage("cityEditor.messages.exportEditableCityMapJSON");
    const file = await downloaded;
    return JSON.parse(readFileSync((await file.path())!, "utf8"));
  };
  await page.locator(".ce-housing-culture").selectOption("mediterranean");
  await page.locator(".ce-housing-climate").selectOption("temperate");
  await page.locator(".ce-map-size").selectOption("small");
  await clickMessage("cityEditor.messages.generateANewGrid");
  if ((await page.locator(".ce-housing-culture").inputValue()) !== "mediterranean")
    throw new Error("Grid reset lost housing choices");
  await page.locator(".ce-document-building-pattern").selectOption("medieval");
  await page.locator(".ce-document-historical-period").selectOption("highMedieval");
  await page.locator(".ce-generate-seed").fill("regional-appearance");
  await page.locator(".ce-generate-seed").dispatchEvent("change");
  await page.locator(".ce-complete-generation").click();
  await page.waitForFunction(() => document.querySelectorAll(".ce-building").length > 0, { timeout: 90000 });
  const before = await save();
  if (before.buildingAppearanceProfile !== "mediterranean" || before.buildingAppearanceClimate !== "temperate")
    throw new Error("Generation lost housing settings");
  const colors = async () =>
    page
      .locator(".ce-building:not(.ce-building--landmark)")
      .evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).fill))].sort());
  const southern = await colors();
  await page.screenshot({ path: "docs/analytics/ce-housing-controls-mediterranean.png" });
  await page.locator(".ce-housing-culture").selectOption("northern-wooded");
  await page.locator(".ce-housing-climate").selectOption("wet-forest");
  const northern = await colors();
  if (JSON.stringify(northern) === JSON.stringify(southern)) throw new Error("Housing colors did not update");
  const after = await save();
  if (!after.buildingAppearanceContext.forest || !after.buildingAppearanceContext.wetland)
    throw new Error("Climate override was not applied");
  for (const field of ["mesh", "elements", "featureGroups"])
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) throw new Error(`Appearance changed ${field}`);
  await clickMessage("cityEditor.messages.undo");
  if ((await page.locator(".ce-housing-climate").inputValue()) !== "temperate")
    throw new Error("Undo did not restore climate");
  await clickMessage("cityEditor.messages.redo");
  if ((await page.locator(".ce-housing-climate").inputValue()) !== "wet-forest")
    throw new Error("Redo did not restore climate");
  await page.locator(".ce-view-toggle").click();
  await page.screenshot({ path: "docs/analytics/ce-housing-controls-northern-3d.png" });
  const chooser = page.waitForEvent("filechooser");
  await clickMessage("cityEditor.messages.importCityMapOrSVGReference");
  await (await chooser).setFiles({
    name: "housing.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(after))
  });
  await page.waitForFunction(
    () => (document.querySelector(".ce-housing-climate") as HTMLSelectElement)?.value === "wet-forest"
  );
  if ((await page.locator(".ce-housing-culture").inputValue()) !== "northern-wooded")
    throw new Error("Import did not restore culture");
  const regenerated = page.evaluate(
    () =>
      new Promise<void>(resolve =>
        document
          .querySelector("#city-editor-root")!
          .addEventListener("city-generation-diagnostics", () => resolve(), { once: true })
      )
  );
  await page.locator(".ce-complete-generation").click();
  await regenerated;
  const rerolled = await save();
  if (
    rerolled.buildingAppearanceProfile !== "northern-wooded" ||
    rerolled.buildingAppearanceClimate !== "wet-forest" ||
    !rerolled.buildingAppearanceContext.forest
  )
    throw new Error("Regeneration lost housing settings");
  const gl = await page.locator(".ce-3d canvas").evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
    return { error: gl.getError(), lost: gl.isContextLost() };
  });
  if (errors.length || gl.error || gl.lost) throw new Error(JSON.stringify({ errors, gl }));
  const report = {
    date: new Date().toISOString(),
    errors,
    gl,
    southern,
    northern,
    profile: after.buildingAppearanceProfile,
    climate: after.buildingAppearanceClimate,
    checks: [
      "new grid",
      "generation",
      "immediate 2D colors",
      "unchanged geometry",
      "undo",
      "redo",
      "3D",
      "JSON import",
      "regeneration"
    ]
  };
  writeFileSync("docs/analytics/ce-housing-controls-browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
