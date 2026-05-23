import { expect, test } from "@playwright/test";

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 60000 });
  await page.waitForFunction(() => typeof (window as any).saveMap === "function", { timeout: 15000 });
  await page.waitForFunction(() => typeof (window as any).quickLoad === "function", { timeout: 15000 });
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    e =>
      !e.includes("fonts.googleapis.com") &&
      !e.includes("google-analytics") &&
      !e.includes("googletagmanager") &&
      !e.includes("Failed to load resource")
  );
}

test.describe("Quick load", () => {
  test("quickLoad should restore map from browser storage", async ({ context, page }) => {
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);

    const savedMapId = await page.evaluate(async () => {
      const id = (window as any).mapId;
      await (window as any).saveMap("storage");
      try {
        // mapHistory is a legacy global variable, not always attached to window
        const history = ((globalThis as any).mapHistory as any[]) || [];
        if (history.length) history[history.length - 1].created = Date.now();
      } catch {
        // keep default behavior if mapHistory is not accessible
      }
      return id;
    });

    await page.evaluate(() => {
      (window as any).mapId = "modified-map-id";
    });

    await page.evaluate(async () => {
      await (window as any).quickLoad();
    });

    await page.waitForFunction(() => (window as any).mapId !== "modified-map-id", { timeout: 60000 });

    const restored = await page.evaluate(expected => {
      const currentMapId = (window as any).mapId;
      const pack = (window as any).pack;
      return {
        currentMapId,
        changedFromTemp: currentMapId !== "modified-map-id",
        hasCells: !!pack?.cells?.i?.length,
        hasBurgs: !!pack?.burgs?.length,
        hasStates: !!pack?.states?.length,
        isSameAsSaved: currentMapId === expected
      };
    }, savedMapId);

    expect(restored.changedFromTemp, "quickLoad should replace temporary mapId").toBe(true);
    expect(restored.hasCells, "loaded map should have cells data").toBe(true);
    expect(restored.hasBurgs, "loaded map should have burgs data").toBe(true);
    expect(restored.hasStates, "loaded map should have states data").toBe(true);

    const criticalErrors = filterCriticalErrors(errors);
    expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});
