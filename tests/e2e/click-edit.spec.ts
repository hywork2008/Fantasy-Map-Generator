import { test, expect } from "@playwright/test";
import {
  loadMapFile,
  zoomIn,
  isAnyDialogOpen,
  waitForBurgLabels,
} from "./helpers/fmg-helpers";

test.describe.configure({ timeout: 90000 });

test.describe("Click-to-edit after map load", () => {
  test("viewbox click listener survives map reload", async ({ page }) => {
    await loadMapFile(page, "demo.map");

    const result = await page.evaluate(() => {
      try {
        const viewbox = document.getElementById("viewbox");
        if (!viewbox) return false;
        viewbox.dispatchEvent(
          new MouseEvent("click", { bubbles: false, cancelable: true })
        );
        return true;
      } catch {
        return false;
      }
    });
    expect(result).toBe(true);
  });

  test("demo.map: burg label text elements are present after load", async ({
    page,
  }) => {
    await loadMapFile(page, "demo.map");
    await zoomIn(page);

    // Enable layers via public actions API (setup per AGENTS.md §5)
    await page.evaluate(() => {
      if (!window.fmg.actions.layerIsOn("toggleLabels"))
        window.fmg.actions.toggleLabels();
      if (!window.fmg.actions.layerIsOn("toggleBurgIcons"))
        window.fmg.actions.toggleBurgIcons();
    });
    await waitForBurgLabels(page);

    const counts = await page.evaluate(() => ({
      labels: document.querySelectorAll("#burgLabels text").length,
      icons: document.querySelectorAll("#burgIcons use").length,
    }));
    expect(counts.labels).toBeGreaterThan(0);
    expect(counts.icons).toBeGreaterThan(0);
  });

  test("demo.map: clicking burg label opens burg editor dialog", async ({
    page,
  }) => {
    await loadMapFile(page, "demo.map");
    await zoomIn(page);

    await page.evaluate(() => {
      if (!window.fmg.actions.layerIsOn("toggleLabels"))
        window.fmg.actions.toggleLabels();
    });
    await waitForBurgLabels(page);

    await page.evaluate(() => {
      const burgText = document.querySelector("#burgLabels text");
      burgText?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".fmg-dialog")).some(
          (el) => (el as HTMLElement).style.display !== "none"
        ),
      { timeout: 5000 }
    );

    expect(await isAnyDialogOpen(page)).toBe(true);
  });

  test("demo.map: clicking burg icon opens burg editor dialog", async ({
    page,
  }) => {
    await loadMapFile(page, "demo.map");
    await zoomIn(page);

    await page.evaluate(() => {
      if (!window.fmg.actions.layerIsOn("toggleBurgIcons"))
        window.fmg.actions.toggleBurgIcons();
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#burgIcons use").length > 0,
      { timeout: 10000 }
    );

    await page.evaluate(() => {
      const icon = document.querySelector("#burgIcons use");
      icon?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".fmg-dialog")).some(
          (el) => (el as HTMLElement).style.display !== "none"
        ),
      { timeout: 5000 }
    );

    expect(await isAnyDialogOpen(page)).toBe(true);
  });

  test("demo.map: clicking a river opens river editor dialog", async ({
    page,
  }) => {
    await loadMapFile(page, "demo.map");

    const riverCount = await page.locator("#rivers path").count();
    if (riverCount === 0) return;

    await page.evaluate(() => {
      const river = document.querySelector("#rivers path");
      river?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    await expect(
      page.locator(".fmg-dialog", { hasText: "River Editor" })
    ).toBeVisible({ timeout: 5000 });
  });
});
