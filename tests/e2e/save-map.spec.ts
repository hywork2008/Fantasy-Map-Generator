import { expect, test } from "@playwright/test";
import { Readable } from "stream";
import path from "path";

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 60000 });
  await page.waitForFunction(() => typeof (window as any).saveMap === "function", { timeout: 15000 });
}

async function streamToString(stream: Readable | null): Promise<string> {
  if (!stream) throw new Error("Download stream is null");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
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

test.describe("Map save", () => {
  test("saveMap('machine') should download .map with required metadata", async ({ context, page }) => {
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(async () => {
        await (window as any).saveMap("machine");
      })
    ]);

    const suggested = download.suggestedFilename();
    expect(suggested.endsWith(".map"), `Unexpected filename: ${suggested}`).toBe(true);

    const content = await streamToString(await download.createReadStream());
    const lines = content.split("\r\n");

    expect(lines.length, "Saved .map should contain multiple sections").toBeGreaterThan(10);

    const params = (lines[0] || "").split("|");
    expect(params.length, "params line should contain version/seed/map metadata").toBeGreaterThanOrEqual(7);

    const version = params[0];
    const seed = params[3];
    const mapId = params[6];

    expect(version.length, "version should be present").toBeGreaterThan(0);
    expect(seed.length, "seed should be present").toBeGreaterThan(0);
    expect(mapId.length, "mapId should be present").toBeGreaterThan(0);

    const settings = (lines[1] || "").split("|");
    const mapName = settings[20] || "";
    expect(mapName.length, "mapName should be present in settings section").toBeGreaterThan(0);

    const criticalErrors = filterCriticalErrors(errors);
    expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });

  test("saved .map should load back without reGraph errors", async ({ context, page }) => {
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(async () => {
        await (window as any).saveMap("machine");
      })
    ]);

    const savedPath = path.join(test.info().outputDir, download.suggestedFilename());
    await download.saveAs(savedPath);

    const fileInput = page.locator("#mapToLoad");
    await fileInput.setInputFiles(savedPath);

    await page.waitForFunction(() => (window as any).mapId !== undefined, {
      timeout: 120000
    });
    await page.waitForTimeout(500);

    const mapData = await page.evaluate(() => {
      const pack = (window as any).pack;
      return {
        hasStates: pack.states && pack.states.length > 1,
        hasBurgs: pack.burgs && pack.burgs.length > 1,
        hasCells: pack.cells && pack.cells.i && pack.cells.i.length > 0,
        mapId: (window as any).mapId
      };
    });

    expect(mapData.hasStates).toBe(true);
    expect(mapData.hasBurgs).toBe(true);
    expect(mapData.hasCells).toBe(true);
    expect(mapData.mapId).toBeDefined();

    const criticalErrors = filterCriticalErrors(errors);
    expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});
