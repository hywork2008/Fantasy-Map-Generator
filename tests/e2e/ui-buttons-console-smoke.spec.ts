import { expect, test } from "@playwright/test";

type TabConfig = {
  tabButtonId: string;
  contentId: string;
};

const TABS: TabConfig[] = [
  { tabButtonId: "layersTab", contentId: "layersContent" },
  { tabButtonId: "styleTab", contentId: "styleContent" },
  { tabButtonId: "optionsTab", contentId: "optionsContent" },
  { tabButtonId: "toolsTab", contentId: "toolsContent" },
  { tabButtonId: "aboutTab", contentId: "aboutContent" }
];

const SKIPPED_BUTTON_IDS = new Set([
  // Enters customization mode and hides main options pane; tested separately in dedicated editor specs.
  "editHeightmapButton",
  // Intentionally reloads page.
  "optionsReset"
]);

const REGRESSION_ERROR_PATTERNS = [
  "Pack cells not found",
  "Cannot read properties of undefined (reading '4')",
  "cellsDensityMap is not defined"
];

function isIgnorableError(message: string): boolean {
  return (
    message.includes("fonts.googleapis.com") ||
    message.includes("google-analytics") ||
    message.includes("googletagmanager") ||
    message.includes("Failed to load resource") ||
    // Existing legacy script loading issue tracked separately from this UI smoke test
    message.includes("Unexpected token 'export'")
  );
}

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 60000 });
}

async function ensureOptionsOpen(page: import("@playwright/test").Page) {
  const options = page.locator("#options");
  if (await options.isVisible()) return;

  await page.locator("#optionsTrigger").click();
  if (await options.isVisible()) return;

  // Fallback for cases where synthetic click is required by legacy handlers.
  await page.evaluate(() => {
    const runtime = window as any;
    if (typeof runtime.showOptions === "function") {
      runtime.showOptions(new Event("click"));
    }
  });
  await expect(options).toBeVisible();
}

test.describe("UI button console smoke", () => {
  test("startup and submap/transform should not emit known regression errors", async ({ page, context }) => {
    test.setTimeout(120000);

    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    await page.waitForTimeout(250);

    await ensureOptionsOpen(page);
    await page.locator("#toolsTab").click();
    await expect(page.locator("#toolsContent")).toBeVisible();

    await page.locator("#openSubmapTool").click();
    await page.waitForTimeout(120);

    await page.locator("#openTransformTool").click();
    await page.waitForTimeout(120);

    const criticalErrors = errors.filter(message => !isIgnorableError(message));
    const matchedRegressionErrors = criticalErrors.filter(message =>
      REGRESSION_ERROR_PATTERNS.some(pattern => message.includes(pattern))
    );

    expect(matchedRegressionErrors, `Regression errors detected: ${matchedRegressionErrors.join("; ")}`).toEqual([]);
  });

  test("open menu, switch tabs, click visible buttons and keep console clean", async ({ page, context }) => {
    test.setTimeout(120000);

    await context.clearCookies();

    const errors: string[] = [];

    page.on("pageerror", error => {
      errors.push(`pageerror: ${error.message}`);
    });

    page.on("console", msg => {
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    page.on("dialog", async dialog => {
      await dialog.dismiss();
    });

    await openMap(page);

    // Reset collected errors to focus on interactions after initial map load.
    errors.length = 0;

    // Initial minimized state -> open menu
    await ensureOptionsOpen(page);

    let lastClicked = "";

    // Optional hide/show cycle to verify trigger flow
    await page.locator("#optionsHide").click();
    await expect(page.locator("#options")).toBeHidden();
    await ensureOptionsOpen(page);

    for (const { tabButtonId, contentId } of TABS) {
      await page.locator(`#${tabButtonId}`).click();
      await expect(page.locator(`#${contentId}`)).toBeVisible();
      await expect(page.locator("#sticked")).toBeVisible();

      const buttonIds = await page.evaluate((activeContentId: string) => {
        const content = document.getElementById(activeContentId);
        if (!content) return [] as string[];

        const isVisible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

        return Array.from(content.querySelectorAll("button[id]"))
          .filter(button => {
            const el = button as HTMLButtonElement;
            return !el.disabled && isVisible(el);
          })
          .map(button => (button as HTMLButtonElement).id);
      }, contentId);

      for (const id of buttonIds) {
        if (SKIPPED_BUTTON_IDS.has(id)) continue;

        lastClicked = `${tabButtonId}:${id}`;

        await page.evaluate((buttonId: string) => {
          const button = document.getElementById(buttonId) as HTMLButtonElement | null;
          if (button && !button.disabled) button.click();
        }, id);

        await page.waitForTimeout(60);

        // Some actions may close the menu; re-open to continue the sweep.
        try {
          await ensureOptionsOpen(page);
        } catch (error) {
          throw new Error(`Failed to reopen options after clicking ${lastClicked}: ${(error as Error).message}`);
        }
        await page.locator(`#${tabButtonId}`).click();
      }
    }

    // #sticked buttons are expected to stay available regardless of selected tab.
    // Keep this smoke test low-impact: avoid buttons that trigger generation / file dialogs.
    const stickedButtonIds = ["zoomReset"];
    for (const id of stickedButtonIds) {
      lastClicked = `sticked:${id}`;

      await page.evaluate((buttonId: string) => {
        const button = document.getElementById(buttonId) as HTMLButtonElement | null;
        if (button && !button.disabled) button.click();
      }, id);
      await page.waitForTimeout(60);
      try {
        await ensureOptionsOpen(page);
      } catch (error) {
        throw new Error(`Failed to reopen options after clicking ${lastClicked}: ${(error as Error).message}`);
      }
    }

    const criticalErrors = errors.filter(message => !isIgnorableError(message));
    expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});
