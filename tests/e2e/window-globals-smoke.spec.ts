import { test, expect } from "@playwright/test";

async function openMapAndWaitForGlobals(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", {waitUntil: "domcontentloaded"});
  // modules/index.ts and compat globals are loaded asynchronously after initial HTML parse
  await page.waitForFunction(() => typeof (window as any).fmg?.saveMap === "function", {timeout: 15000});
  await page.waitForFunction(() => typeof (window as any).fmg?.invokeActiveZooming === "function", {
    timeout: 15000
  });
}

function filterCriticalStartupErrors(errors: string[]): string[] {
  return errors.filter(
    message =>
      !message.includes("fonts.googleapis.com") &&
      !message.includes("google-analytics") &&
      !message.includes("googletagmanager") &&
      !message.includes("Failed to load resource") &&
      !message.includes("deprecated") &&
      !message.includes("Name is too short! Random name will be selected")
  );
}

/**
 * Smoke test for window globals registration
 * Ensures all functions required by HTML onclick handlers are present
 * Priority: HIGHEST - detects import/export registration failures early
 */
test.describe("Window globals smoke test", () => {
  test("startup should not emit uncaught initialization errors", async ({ page }) => {
    const startupErrors: string[] = [];

    page.on("pageerror", error => startupErrors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") startupErrors.push(`console.error: ${msg.text()}`);
    });

    await openMapAndWaitForGlobals(page);
    await page.waitForTimeout(1000);

    const critical = filterCriticalStartupErrors(startupErrors);
    expect(critical, `Unexpected startup errors: ${critical.join("; ")}`).toEqual([]);
  });

  test("all toggle functions should be available on window.fmg", async ({ page }) => {
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
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, toggleFunctions);

    expect(missing, `Missing toggle functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all preset functions should be available on window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const presetFunctions = [
      "handleLayersPresetChange",
      "savePreset",
      "removePreset"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, presetFunctions);

    expect(missing, `Missing preset functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all options functions should be available on window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const optionsFunctions = [
      "showSupporters",
      "regeneratePrompt",
      "getMapName",
      "copyLinkToClickboard",
      "showElementLockTip",
      "openURL",
      "wiki",
      "connectToDropbox",
      "loadURL",
      "openExportToPngTiles"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, optionsFunctions);

    expect(missing, `Missing options functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all load functions should be available on window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const loadFunctions = [
      "quickLoad",
      "loadFromDropbox",
      "createSharableDropboxLink"
    ];

    const missing = await page.evaluate((required) => {
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, loadFunctions);

    expect(missing, `Missing load functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all style/UI functions should be available on window.fmg", async ({
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
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, styleFunctions);

    expect(missing, `Missing style/UI functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all save functions should be available on window.fmg", async ({
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
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, saveFunctions);

    expect(missing, `Missing save functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("all export functions should be available on window.fmg", async ({
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
      return required.filter((fn) => typeof (window as any).fmg?.[fn] !== "function");
    }, exportFunctions);

    expect(missing, `Missing export functions: ${missing.join(", ")}`).toEqual([]);
  });

  test("invokeActiveZooming should be available on window.fmg only", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const exposure = await page.evaluate(() => ({
      root: typeof (window as any).invokeActiveZooming,
      fmg: typeof (window as any).fmg?.invokeActiveZooming
    }));

    expect(exposure.root, "window.invokeActiveZooming should not be defined").toBe("undefined");
    expect(exposure.fmg, "window.fmg.invokeActiveZooming should be a function").toBe("function");
  });

  test("UITour should be exposed as function-level API on window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const exposure = await page.evaluate(() => ({
      startType: typeof (window as any).fmg?.startUITour,
      uiTourType: typeof (window as any).fmg?.UITour
    }));

    expect(exposure.startType, "window.fmg.startUITour should be a function").toBe("function");
    expect(exposure.uiTourType, "window.fmg.UITour should not be defined").toBe("undefined");
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

  test("Names should not be exposed as class-like API on window.fmg", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const exposure = await page.evaluate(() => ({
      namesType: typeof (window as any).fmg?.Names,
      getMapNameType: typeof (window as any).fmg?.getMapName
    }));

    expect(exposure.namesType, "window.fmg.Names should not be defined").toBe("undefined");
    expect(exposure.getMapNameType, "window.fmg.getMapName should be a function").toBe("function");
  });

  test("3d functions should be available on window.fmg only", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const result = await page.evaluate(() => ({
      windowHas: typeof (window as any).ThreeD,
      fmgThreeDHas: typeof (window as any).fmg?.ThreeD,
      hasCreate: typeof (window as any).fmg?.create3d === "function",
      hasUpdate: typeof (window as any).fmg?.update3d === "function",
      hasStop: typeof (window as any).fmg?.stop3d === "function"
    }));

    expect(result.windowHas, "ThreeD should not be defined on window root").toBe("undefined");
    expect(result.fmgThreeDHas, "window.fmg.ThreeD should not be defined").toBe("undefined");
    expect(result.hasCreate, "window.fmg.create3d should be a function").toBe(true);
    expect(result.hasUpdate, "window.fmg.update3d should be a function").toBe(true);
    expect(result.hasStop, "window.fmg.stop3d should be a function").toBe(true);
  });

  test("cloud functions should be available on window.fmg only", async ({
    page
  }) => {
    await openMapAndWaitForGlobals(page);

    const result = await page.evaluate(() => ({
      windowHas: typeof (window as any).Cloud,
      fmgCloudHas: typeof (window as any).fmg?.Cloud,
      hasInit: typeof (window as any).fmg?.initializeDropbox === "function",
      hasList: typeof (window as any).fmg?.listDropboxFiles === "function",
      hasLink: typeof (window as any).fmg?.getDropboxLink === "function"
    }));

    expect(result.windowHas, "Cloud should not be defined on window root").toBe("undefined");
    expect(result.fmgCloudHas, "window.fmg.Cloud should not be defined").toBe("undefined");
    expect(result.hasInit, "window.fmg.initializeDropbox should be a function").toBe(true);
    expect(result.hasList, "window.fmg.listDropboxFiles should be a function").toBe(true);
    expect(result.hasLink, "window.fmg.getDropboxLink should be a function").toBe(true);
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
