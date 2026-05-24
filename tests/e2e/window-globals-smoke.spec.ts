import { test, expect } from "@playwright/test";

async function openMapAndWaitForGlobals(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", {waitUntil: "domcontentloaded"});
  // modules/index.ts and compat globals are loaded asynchronously after initial HTML parse
  await page.waitForFunction(() => typeof (window as any).saveMap === "function", {timeout: 15000});
  await page.waitForFunction(() => typeof (window as any).invokeActiveZooming === "function", {
    timeout: 15000
  });
}

/**
 * Smoke test for window globals registration
 * Ensures all functions required by HTML onclick handlers are present
 * Priority: HIGHEST - detects import/export registration failures early
 */
test.describe("Window globals smoke test", () => {
  test("all toggle functions should be available on window", async ({ page }) => {
    await openMapAndWaitForGlobals(page);

    const toggleFunctions = [
      "toggleHeight",
      "toggleTemperature",
      "toggleBiomes",
      "togglePrecipitation",
      "togglePopulation",
      "toggleCells",
      "toggleIce",
      "toggleCultures",
      "toggleReligions",
      "toggleStates",
      "toggleBorders",
      "toggleProvinces",
      "toggleGrid",
      "toggleCoordinates",
      "toggleCompass",
      "toggleRelief",
      "toggleLakes",
      "toggleTexture",
      "toggleRivers",
      "toggleRoutes",
      "toggleMilitary",
      "toggleMarkers",
      "toggleLabels",
      "toggleBurgIcons",
      "toggleRulers",
      "toggleScaleBar",
      "toggleZones",
      "toggleEmblems",
      "toggleVignette"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, toggleFunctions);

    expect(missing, `Missing toggle functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all preset functions should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const presetFunctions = [
      "handleLayersPresetChange",
      "savePreset",
      "removePreset"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, presetFunctions);

    expect(missing, `Missing preset functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all options functions should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const optionsFunctions = [
      "showSupporters",
      "regeneratePrompt",
      "copyLinkToClickboard",
      "showElementLockTip",
      "openURL",
      "wiki",
      "connectToDropbox",
      "loadURL",
      "openExportToPngTiles"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, optionsFunctions);

    expect(missing, `Missing options functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all load functions should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const loadFunctions = [
      "quickLoad",
      "loadFromDropbox",
      "createSharableDropboxLink"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, loadFunctions);

    expect(missing, `Missing load functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all style/UI functions should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const styleFunctions = [
      "requestStylePresetChange",
      "addStylePreset",
      "requestRemoveStylePreset",
      "editWorld",
      "textureProvideURL",
      "cleanupData",
      "exportToJson"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, styleFunctions);

    expect(missing, `Missing style/UI functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all save functions should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const saveFunctions = [
      "saveMap",
      "saveToStorage",
      "saveToMachine",
      "saveToDropbox",
      "initiateAutosave"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, saveFunctions);

    expect(missing, `Missing save functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all export functions should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const exportFunctions = [
      "exportToSvg",
      "exportToPng",
      "exportToJpeg",
      "exportToPngTiles",
      "saveGeoJsonCells",
      "saveGeoJsonRoutes",
      "saveGeoJsonRivers",
      "saveGeoJsonMarkers",
      "saveGeoJsonZones"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any)[fn] !== "function");
    }, exportFunctions);

    expect(missing, `Missing export functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("invokeActiveZooming should be available on window", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const isFunction = await page.evaluate(
      () => typeof (window as any).invokeActiveZooming === "function"
    );

    expect(isFunction, "invokeActiveZooming should be a function on window").toBe(true);
  });

  test("UITour.start should be available on window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const isFunction = await page.evaluate(
      () => typeof (window as any).fmg?.UITour?.start === "function"
    );

    expect(isFunction, "window.fmg.UITour.start should be a function").toBe(true);
  });

  test("regenerateMap should be exposed via window.fmg and New Map should work", async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await openMapAndWaitForGlobals(page);

    const exposure = await page.evaluate(() => ({
      root: typeof (window as any).regenerateMap,
      fmg: typeof (window as any).fmg?.regenerateMap
    }));

    expect(exposure.root, "window.regenerateMap should not be defined").toBe("undefined");
    expect(exposure.fmg, "window.fmg.regenerateMap should be a function").toBe("function");

    await page.locator("#optionsTrigger").click();
    await page.getByRole("button", { name: "New Map" }).click();
    await page.waitForTimeout(1000);

    const unexpectedErrors = consoleErrors.filter((err) => {
      return !err.includes("Name is too short! Random name will be selected") && !err.includes("deprecated");
    });

    expect(unexpectedErrors, `Unexpected console errors: ${unexpectedErrors.join("; ")}`).toEqual([]);
  });

  test("ThreeD should be available on window and window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const result = await page.evaluate(() => ({
      windowHas: typeof (window as any).ThreeD === "object" && (window as any).ThreeD !== null,
      fmgHas: typeof (window as any).fmg?.ThreeD === "object" && (window as any).fmg?.ThreeD !== null,
      hasCreate: typeof (window as any).ThreeD?.create === "function"
    }));

    expect(result.windowHas, "ThreeD should be an object on window").toBe(true);
    expect(result.fmgHas, "ThreeD should be an object on window.fmg").toBe(true);
    expect(result.hasCreate, "ThreeD.create should be a function").toBe(true);
  });

  test("Cloud should be available on window and window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const result = await page.evaluate(() => ({
      windowHas: typeof (window as any).Cloud === "object" && (window as any).Cloud !== null,
      fmgHas: typeof (window as any).fmg?.Cloud === "object" && (window as any).fmg?.Cloud !== null,
      hasProviders: typeof (window as any).Cloud?.providers === "object"
    }));

    expect(result.windowHas, "Cloud should be an object on window").toBe(true);
    expect(result.fmgHas, "Cloud should be an object on window.fmg").toBe(true);
    expect(result.hasProviders, "Cloud.providers should be an object").toBe(true);
  });

  test("no console errors should be present after globals registration", async ({
    page
  }) => {
    let consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await openMapAndWaitForGlobals(page);

    // Wait a moment for any initialization errors to appear
    await page.waitForTimeout(1000);

    // Filter out expected errors (if any)
    const unexpectedErrors = consoleErrors.filter((err) => {
      // Add patterns for expected errors that can be ignored
      return !err.includes("deprecated") && !err.includes("Name is too short! Random name will be selected");
    });

    expect(unexpectedErrors, `Unexpected console errors: ${unexpectedErrors.join("; ")}`).toEqual([]);
  });
});
