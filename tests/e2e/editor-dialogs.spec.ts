import { test, expect } from "@playwright/test";
import path from "path";

async function loadDemoMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  const fileInput = page.locator("#mapToLoad");
  await fileInput.setInputFiles(path.join(__dirname, "../fixtures/demo.map"));
  await page.waitForFunction(() => (window as any).mapId !== undefined, {
    timeout: 120000,
  });
  await page.waitForTimeout(500);
}

/**
 * Simulate a click on an SVG element by dispatching a bubbling MouseEvent.
 * Returns the element's id, or null if no matching element was found.
 */
async function dispatchClickOn(
  page: import("@playwright/test").Page,
  selector: string
): Promise<string | null> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as SVGElement | null;
    if (!el) return null;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return el.id || "(no id)";
  }, selector);
}

async function openToolsTab(page: import("@playwright/test").Page) {
  const options = page.locator("#options");
  if (!(await options.isVisible())) {
    await page.locator("#optionsTrigger").click();
    await page.waitForTimeout(100);
  }

  const toolsContent = page.locator("#toolsContent");
  if (!(await toolsContent.isVisible())) {
    await page.locator("#toolsTab").click();
    await page.waitForTimeout(100);
  }
}

test.describe("Editor dialog interactions", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ------------------------------------------------------------------ burg --
  test("clicking a burg icon opens burgEditor dialog without ReferenceErrors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    // Wait until burg icons are rendered into the SVG
    await page.waitForFunction(
      () => document.querySelector("#burgIcons use") !== null,
      { timeout: 15000 }
    );

    pageErrors.length = 0; // Discard startup noise

    const burgId = await dispatchClickOn(page, "#burgIcons use");
    expect(burgId, "Expected a burg use element inside #burgIcons").not.toBeNull();

    await page.waitForTimeout(400);

    await expect(page.locator("#burgEditor"), "burgEditor dialog should be visible").toBeVisible();

    const refErrors = pageErrors.filter(e => e.includes("ReferenceError"));
    expect(
      refErrors,
      `ReferenceErrors after clicking burg: ${refErrors.join("; ")}`
    ).toEqual([]);
  });

  // ----------------------------------------------------------------- route --
  test("clicking a route path opens routeEditor dialog without ReferenceErrors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    // Ensure routes layer is visible so path elements are present in the DOM
    await page.evaluate(() => {
      const fmg = (window as any).fmg;
      if (typeof fmg?.layerIsOn === "function" && !fmg.layerIsOn("toggleRoutes")) {
        fmg.toggleRoutes();
      }
    });
    await page.waitForTimeout(300);

    // Wait until route paths are rendered
    const hasRoutes = await page.evaluate(
      () => document.querySelector("#routes path") !== null
    );

    if (!hasRoutes) {
      test.skip(true, "No route paths found in this map — skipping route editor test");
    }

    pageErrors.length = 0; // Discard startup noise

    const routeId = await dispatchClickOn(page, "#routes path");
    expect(routeId, "Expected a route path element inside #routes").not.toBeNull();

    await page.waitForTimeout(400);

    await expect(page.locator("#routeEditor"), "routeEditor dialog should be visible").toBeVisible();

    const refErrors = pageErrors.filter(e => e.includes("ReferenceError"));
    expect(
      refErrors,
      `ReferenceErrors after clicking route: ${refErrors.join("; ")}`
    ).toEqual([]);

    const routeGroupErrors = pageErrors.filter(e => e.includes("editRouteGroups is not defined"));
    expect(routeGroupErrors, `route group editor binding errors: ${routeGroupErrors.join("; ")}`).toEqual([]);
  });

  test("closing route editor does not throw unselect ReferenceError", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    await page.evaluate(() => {
      const fmg = (window as any).fmg;
      if (typeof fmg?.layerIsOn === "function" && !fmg.layerIsOn("toggleRoutes")) {
        fmg.toggleRoutes();
      }
    });
    await page.waitForTimeout(300);

    const hasRoutes = await page.evaluate(
      () => document.querySelector("#routes path") !== null
    );

    if (!hasRoutes) {
      test.skip(true, "No route paths found in this map — skipping route close test");
    }

    pageErrors.length = 0;

    const routeId = await dispatchClickOn(page, "#routes path");
    expect(routeId, "Expected a route path element inside #routes").not.toBeNull();
    await expect(page.locator("#routeEditor")).toBeVisible();

    await page
      .locator(".ui-dialog:has(#routeEditor) .ui-dialog-titlebar-close")
      .click();
    await page.waitForTimeout(350);

    const errors = pageErrors.filter(
      e => e.includes("unselect is not defined") || e.includes("ReferenceError")
    );
    expect(errors, `Errors after closing route editor: ${errors.join("; ")}`).toEqual([]);
  });

  // ----------------------------------------------------------------- river --
  test("clicking a river path opens riverEditor dialog without tip ReferenceError", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    await page.evaluate(() => {
      const fmg = (window as any).fmg;
      if (typeof fmg?.layerIsOn === "function" && !fmg.layerIsOn("toggleRivers")) {
        fmg.toggleRivers();
      }
    });
    await page.waitForTimeout(300);

    const hasRivers = await page.evaluate(
      () => document.querySelector("#rivers path") !== null
    );

    if (!hasRivers) {
      test.skip(true, "No river paths found in this map — skipping river editor test");
    }

    pageErrors.length = 0;

    const riverId = await dispatchClickOn(page, "#rivers path");
    expect(riverId, "Expected a river path element inside #rivers").not.toBeNull();

    await page.waitForTimeout(400);

    await expect(page.locator("#riverEditor"), "riverEditor dialog should be visible").toBeVisible();

    const errors = pageErrors.filter(
      e => e.includes("ReferenceError") || e.includes("tip is not defined")
    );
    expect(errors, `Errors after clicking river: ${errors.join("; ")}`).toEqual([]);
  });

  // ---------------------------------------- burgs overview dialog close ---
  test("closing burgs overview dialog does not throw restoreDefaultEvents/clearMainTip errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);
    pageErrors.length = 0; // Discard startup noise

    await openToolsTab(page);

    // Open burgs overview
    await page.locator("#overviewBurgsButton").click();
    await expect(page.locator("#burgsOverview"), "burgsOverview dialog should open").toBeVisible();
    await page.waitForTimeout(200);

    // Close via jQuery UI dialog titlebar close button
    await page
      .locator(".ui-dialog:has(#burgsOverview) .ui-dialog-titlebar-close")
      .click();
    await page.waitForTimeout(400);

    const errors = pageErrors.filter(
      e => e.includes("restoreDefaultEvents") || e.includes("clearMainTip") || e.includes("ReferenceError")
    );
    expect(
      errors,
      `Errors after closing burgs overview: ${errors.join("; ")}`
    ).toEqual([]);
  });

  // ----------------------------------------------- biome editor tooltip ---
  test("hovering biome name input does not throw FillBox tip ReferenceError", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);
    pageErrors.length = 0;

    await openToolsTab(page);
    await page.locator("#editBiomesButton").click();
    await expect(page.locator("#biomesEditor"), "biomesEditor dialog should open").toBeVisible();
    await page.waitForSelector("#biomesBody input.biomeName", { timeout: 10000 });

    await page.locator("#biomesBody input.biomeName").first().hover();
    await page.waitForTimeout(250);

    const errors = pageErrors.filter(
      e => e.includes("FillBox.showTip") || e.includes("tip is not defined") || e.includes("ReferenceError")
    );
    expect(errors, `Errors after hovering biome name input: ${errors.join("; ")}`).toEqual([]);
  });

  // ------------------------------------------------ state label click ---
  test("clicking a state name label opens label editor without showMainTip ReferenceError", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    await page.waitForFunction(
      () => document.querySelector("#labels #states textPath tspan") !== null,
      { timeout: 15000 }
    );

    pageErrors.length = 0;

    const stateLabelId = await dispatchClickOn(page, "#labels #states textPath tspan");
    expect(stateLabelId, "Expected a state label tspan inside #labels #states").not.toBeNull();

    await page.waitForTimeout(400);
    await expect(page.locator("#labelEditor"), "labelEditor dialog should be visible").toBeVisible();

    const errors = pageErrors.filter(
      e => e.includes("showMainTip is not defined") || e.includes("ReferenceError")
    );
    expect(errors, `Errors after clicking state label: ${errors.join("; ")}`).toEqual([]);
  });

  // ------------------------------------------------ scale bar click ---
  test("clicking scale bar opens units editor without editUnits ReferenceError", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);
    pageErrors.length = 0;

    const scaleBarId = await dispatchClickOn(page, "#scaleBar");
    expect(scaleBarId, "Expected #scaleBar to exist").not.toBeNull();

    await page.waitForTimeout(300);
    await expect(page.locator("#unitsEditor"), "unitsEditor dialog should be visible").toBeVisible();

    const errors = pageErrors.filter(
      e => e.includes("editUnits is not defined") || e.includes("ReferenceError")
    );
    expect(errors, `Errors after clicking scale bar: ${errors.join("; ")}`).toEqual([]);
  });

  // ------------------------------------------------ lake click/close ---
  test("clicking lake and closing Edit Lake dialog does not throw getHeight ReferenceError", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    await page.evaluate(() => {
      const fmg = (window as any).fmg;
      if (typeof fmg?.layerIsOn === "function" && !fmg.layerIsOn("toggleLakes")) {
        fmg.toggleLakes();
      }
    });
    await page.waitForTimeout(300);

    const hasLakes = await page.evaluate(
      () => document.querySelector("#lakes path") !== null
    );

    if (!hasLakes) {
      test.skip(true, "No lake paths found in this map — skipping lake editor test");
    }

    pageErrors.length = 0;

    const lakeId = await dispatchClickOn(page, "#lakes path");
    expect(lakeId, "Expected a lake path element inside #lakes").not.toBeNull();

    await page.waitForTimeout(350);
    await expect(page.locator("#lakeEditor"), "lakeEditor dialog should be visible").toBeVisible();

    await page
      .locator(".ui-dialog:has(#lakeEditor) .ui-dialog-titlebar-close")
      .click();
    await page.waitForTimeout(300);

    const errors = pageErrors.filter(
      e => e.includes("getHeight is not defined") || e.includes("ReferenceError")
    );
    expect(errors, `Errors after lake dialog flow: ${errors.join("; ")}`).toEqual([]);
  });

  // ------------------------------------------------- ice click ---
  test("clicking ice and closing Edit Glacier dialog does not throw runtime errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await loadDemoMap(page);

    await page.evaluate(() => {
      const fmg = (window as any).fmg;
      if (typeof fmg?.layerIsOn === "function" && !fmg.layerIsOn("toggleIce")) {
        fmg.toggleIce();
      }
    });
    await page.waitForTimeout(300);

    const hasIce = await page.evaluate(
      () => document.querySelector("#ice *[data-id]") !== null
    );

    if (!hasIce) {
      test.skip(true, "No ice elements found in this map — skipping ice editor test");
    }

    pageErrors.length = 0;

    const iceId = await dispatchClickOn(page, "#ice *[data-id]");
    expect(iceId, "Expected an ice element with data-id inside #ice").not.toBeNull();

    await page.waitForTimeout(350);
    await expect(page.locator("#iceEditor"), "iceEditor dialog should be visible").toBeVisible();

    await page
      .locator(".ui-dialog:has(#iceEditor) .ui-dialog-titlebar-close")
      .click();
    await page.waitForTimeout(350);

    const errors = pageErrors.filter(
      e =>
        e.includes("closeDialogs is not a function") ||
        e.includes("clearMainTip is not a function") ||
        e.includes("TypeError") ||
        e.includes("ReferenceError")
    );
    expect(errors, `Errors after clicking ice: ${errors.join("; ")}`).toEqual([]);
  });
});
