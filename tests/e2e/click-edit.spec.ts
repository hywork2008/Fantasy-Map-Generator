import { test, expect } from "@playwright/test";
import path from "path";

async function loadMap(page: any, filename: string) {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  // Wait for the file input to exist (static HTML element, appears quickly)
  await page.waitForSelector("#mapToLoad", { state: "attached" });

  // Set up a flag before uploading so we don't miss the map:generated event.
  // By the time waitForSelector resolves (~1s), the initial random map has already
  // finished generating (~200ms), so this listener only catches the file upload's event.
  await page.evaluate(() => {
    (window as any).__fmgMapLoaded = false;
    window.addEventListener(
      "map:generated",
      () => { (window as any).__fmgMapLoaded = true; },
      { once: true }
    );
  });

  await page.locator("#mapToLoad").setInputFiles(path.join(__dirname, `../fixtures/${filename}`));

  // Wait for showStatistics() to complete — it fires map:generated after all rendering is done
  await page.waitForFunction(
    () => Boolean((window as any).__fmgMapLoaded),
    undefined,
    { timeout: 60000 }
  );

  await page.waitForTimeout(500);
}

test.describe.configure({ timeout: 90000 });

// Capital burgs are hidden at scale < 1.5 by design. Zoom in before enabling
// burg layers so BurgLabelsRenderer / BurgIconsRenderer render at the higher scale.
async function zoomIn(page: any, z = 2) {
  await page.evaluate((scale: number) => {
    const w = window as any;
    w.zoomTo(w.graphWidth / 2, w.graphHeight / 2, scale, 0);
  }, z);
  // Wait for requestAnimationFrame (zoomRaf) + invokeActiveZooming debounce (100ms)
  await page.waitForTimeout(200);
}

function isAnyDialogOpen(page: any) {
  return page.evaluate(() => {
    // Dialogs use class "fmg-dialog". When open, display is "" (not set inline).
    // When closed, display is "none" (set inline by React).
    return Array.from(document.querySelectorAll(".fmg-dialog")).some(
      el => (el as HTMLElement).style.display !== "none"
    );
  });
}

test.describe("Click-to-edit after map load", () => {
  test("viewbox click listener survives map reload", async ({ page }) => {
    await loadMap(page, "demo.map");

    const result = await page.evaluate(() => {
      try {
        const viewbox = document.getElementById("viewbox");
        if (!viewbox) return false;
        viewbox.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true }));
        return true;
      } catch {
        return false;
      }
    });
    expect(result).toBe(true);
  });

  test("demo.map: burg label text elements are present after load", async ({ page }) => {
    await loadMap(page, "demo.map");
    await zoomIn(page);

    await page.evaluate(() => {
      if (!(window as any).layerIsOn("toggleLabels")) (window as any).toggleLabels();
      if (!(window as any).layerIsOn("toggleBurgIcons")) (window as any).toggleBurgIcons();
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#burgLabels text").length > 0,
      undefined,
      { timeout: 10000 }
    );

    const counts = await page.evaluate(() => ({
      labels: document.querySelectorAll("#burgLabels text").length,
      icons: document.querySelectorAll("#burgIcons use").length,
    }));
    expect(counts.labels).toBeGreaterThan(0);
    expect(counts.icons).toBeGreaterThan(0);
  });

  test("demo.map: clicking burg label opens burg editor dialog", async ({ page }) => {
    await loadMap(page, "demo.map");
    await zoomIn(page);

    await page.evaluate(() => {
      if (!(window as any).layerIsOn("toggleLabels")) (window as any).toggleLabels();
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#burgLabels text").length > 0,
      undefined,
      { timeout: 10000 }
    );

    await page.evaluate(() => {
      const burgText = document.querySelector("#burgLabels text");
      burgText?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);

    expect(await isAnyDialogOpen(page)).toBe(true);
  });

  test("demo.map: clicking burg icon opens burg editor dialog", async ({ page }) => {
    await loadMap(page, "demo.map");
    await zoomIn(page);

    await page.evaluate(() => {
      if (!(window as any).layerIsOn("toggleBurgIcons")) (window as any).toggleBurgIcons();
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#burgIcons use").length > 0,
      undefined,
      { timeout: 10000 }
    );

    await page.evaluate(() => {
      const icon = document.querySelector("#burgIcons use");
      icon?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);

    expect(await isAnyDialogOpen(page)).toBe(true);
  });

  test("demo.map: clicking a river opens river editor dialog", async ({ page }) => {
    await loadMap(page, "demo.map");

    const riverCount = await page.locator("#rivers path").count();
    if (riverCount === 0) return;

    const river = page.locator("#rivers path").first();
    await river.click({ force: true });
    await page.waitForTimeout(500);

    expect(await isAnyDialogOpen(page)).toBe(true);
  });
});
