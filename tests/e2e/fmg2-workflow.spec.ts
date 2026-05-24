/**
 * E2E tests for the fmg-2 workflow (based on fmg-2-pupp.js recorded interactions).
 * Covers: Configure World, view modes, Load pane, Reset Zoom, Tools tab regenerate buttons,
 * Add Label, Add Marker, Create Route, Submap tool, Transform tool.
 */
import { expect, test } from "@playwright/test";

function isIgnorableError(message: string): boolean {
  return (
    message.includes("fonts.googleapis.com") ||
    message.includes("google-analytics") ||
    message.includes("googletagmanager") ||
    message.includes("Failed to load resource") ||
    message.includes("Unexpected token 'export'") ||
    // External 3D/WebGL context failures are acceptable in headless environment
    message.includes("WebGL") ||
    message.includes("canvas3d") ||
    // Cloud/Dropbox requires network auth — expected to be unavailable in tests
    message.includes("Dropbox") ||
    message.includes("dropbox")
  );
}

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => (window as any).mapId !== undefined, {timeout: 60000});
}

async function ensureOptionsOpen(page: import("@playwright/test").Page) {
  const options = page.locator("#options");
  if (await options.isVisible()) return;
  await page.locator("#optionsTrigger").click();
  await expect(options).toBeVisible({timeout: 5000});
}

async function clickById(page: import("@playwright/test").Page, id: string) {
  const locator = page.locator(`#${id}`);
  await expect(locator, `Expected #${id} to be visible before click`).toBeVisible({timeout: 10000});
  await locator.click();
}

async function closeLatestDialog(page: import("@playwright/test").Page) {
  const closeButtons = page.locator("#dialogs .ui-dialog:visible button.ui-dialog-titlebar-close");
  const count = await closeButtons.count();
  if (!count) return;
  await closeButtons.last().click();
  await page.waitForTimeout(100);
}

async function collectErrors(page: import("@playwright/test").Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

// ─── Configure World ───────────────────────────────────────────────────────────

test.describe("Configure World dialog", () => {
  test("opens and closes without runtime errors", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0; // ignore startup noise

    await ensureOptionsOpen(page);
    await clickById(page, "optionsTab");

    const btn = page.locator("#worldConfigurator, button:has-text('Configure World'), input[value*='Configure World']");
    if (await btn.count() === 0) {
      // Try clicking the Configure World button by text
      const optionsBtns = page.locator("#options").getByRole("button");
      const configBtn = optionsBtns.filter({hasText: /configure world/i});
      if ((await configBtn.count()) > 0) await configBtn.first().click();
    } else {
      await btn.first().click();
    }

    // Try directly clicking via evaluate if no locator found
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>("[onclick*='editWorld'], #editWorldButton");
      btn?.click();
    });

    await page.waitForTimeout(1000);

    const dialog = page.locator(".ui-dialog:visible").filter({hasText: /configure world/i});
    if ((await dialog.count()) > 0) {
      const closeBtn = dialog.locator("button.ui-dialog-titlebar-close");
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── View Mode Switching ───────────────────────────────────────────────────────

test.describe("View mode switching", () => {
  test("Standard view button does not throw", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);
    // viewStandard is the Standard view radio button
    const stdBtn = page.locator("#viewStandard");
    if (await stdBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await stdBtn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Load Pane ─────────────────────────────────────────────────────────────────

test.describe("Load pane", () => {
  test("opens Load dialog without Cloud ReferenceError", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });
    // Handle any unexpected dialog pop-ups automatically
    page.on("dialog", async dialog => dialog.dismiss());

    await openMap(page);
    errors.length = 0;

    // Load button is in the sticked menu
    const loadBtn = page.locator("#loadButton");
    if (await loadBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await loadBtn.click();
      await page.waitForTimeout(1500);
      await closeLatestDialog(page);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Reset Zoom ────────────────────────────────────────────────────────────────

test.describe("Reset Zoom", () => {
  test("clicking zoomReset does not throw", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    const resetBtn = page.locator("#zoomReset");
    if (await resetBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(500);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Tools Tab: Regenerate Buttons ────────────────────────────────────────────

const REGENERATE_FEATURES = [
  "regenerateBurgs",
  "regenerateCultures",
  "regenerateMarkers",
  "regeneratePopulation",
  "regenerateProvinces",
  "regenerateReligions",
  "regenerateRivers",
  "regenerateStates",
] as const;

test.describe("Tools tab regenerate buttons", () => {
  for (const featureId of REGENERATE_FEATURES) {
    test(`${featureId} does not throw ReferenceError`, async ({page, context}) => {
      test.setTimeout(90000);
      await context.clearCookies();
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
      page.on("console", msg => {
        if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
      });
      // Auto-dismiss confirmation alerts
      page.on("dialog", async dialog => dialog.accept());

      await openMap(page);
      errors.length = 0;

      await ensureOptionsOpen(page);
      await clickById(page, "toolsTab");
      await expect(page.locator("#toolsContent")).toBeVisible({timeout: 5000});

      const btn = page.locator(`#${featureId}`);
      if (await btn.isVisible({timeout: 3000}).catch(() => false)) {
        await btn.click();
        // Some regenerations open a confirmation dialog — accept it
        await page.waitForTimeout(500);
        const alertOk = page.locator(".ui-dialog:visible").getByRole("button", {name: /proceed|ok/i});
        if ((await alertOk.count()) > 0) await alertOk.first().click();
        await page.waitForTimeout(2000);
      }

      const criticalErrors = errors.filter(m => !isIgnorableError(m));
      expect(criticalErrors, `Runtime errors for ${featureId}: ${criticalErrors.join("; ")}`).toEqual([]);
    });
  }
});

// ─── Add Label ─────────────────────────────────────────────────────────────────

test.describe("Add Label tool", () => {
  test("activates add-label mode without ReferenceError", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);
    await clickById(page, "toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible({timeout: 5000});

    const addLabelBtn = page.locator("#addLabel");
    if (await addLabelBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await addLabelBtn.click();
      await page.waitForTimeout(500);
      // Deactivate by clicking again
      await addLabelBtn.click();
      await page.waitForTimeout(300);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Add Marker ────────────────────────────────────────────────────────────────

test.describe("Add Marker tool", () => {
  test("activates add-marker mode without ReferenceError", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);
    await clickById(page, "toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible({timeout: 5000});

    const addMarkerBtn = page.locator("#addMarker");
    if (await addMarkerBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await addMarkerBtn.click();
      await page.waitForTimeout(500);
      // Deactivate
      await addMarkerBtn.click();
      await page.waitForTimeout(300);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Create Route ──────────────────────────────────────────────────────────────

test.describe("Create Route tool", () => {
  test("opens route creator without TypeError", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);
    await clickById(page, "toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible({timeout: 5000});

    const addRouteBtn = page.locator("#addRoute");
    if (await addRouteBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await addRouteBtn.click();
      await page.waitForTimeout(1000);
      // Close the route creator dialog if it opened
      await closeLatestDialog(page);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Submap Tool ───────────────────────────────────────────────────────────────

test.describe("Submap tool", () => {
  test("opens submap tool without applyGraphSize TypeError", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);
    await clickById(page, "toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible({timeout: 5000});

    const submapBtn = page.locator("#openSubmapTool");
    if (await submapBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await submapBtn.click();
      await page.waitForTimeout(1500);
      await closeLatestDialog(page);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

// ─── Transform Tool ────────────────────────────────────────────────────────────

test.describe("Transform tool", () => {
  test("opens transform tool without closeDialogs TypeError", async ({page, context}) => {
    test.setTimeout(60000);
    await context.clearCookies();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);
    await clickById(page, "toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible({timeout: 5000});

    const transformBtn = page.locator("#openTransformTool");
    if (await transformBtn.isVisible({timeout: 3000}).catch(() => false)) {
      await transformBtn.click();
      await page.waitForTimeout(1500);
      await closeLatestDialog(page);
    }

    const criticalErrors = errors.filter(m => !isIgnorableError(m));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});
