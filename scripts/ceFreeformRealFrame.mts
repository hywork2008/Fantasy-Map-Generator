/**
 * Frame check of the real City Editor 3D view with an imported freeform ledger.
 *   node --import tsx scripts/ceFreeformRealFrame.mts <ledger.json>
 * Env: CE_FREEFORM_HEADED=1 for a visible window.
 */
import { chromium } from "playwright";
import { createServer } from "vite";

const ledger = process.argv[2];
if (!ledger) throw new Error("usage: ceFreeformRealFrame.mts <ledger.json>");
const port = 5278;
const server = await createServer({
  configFile: "vite.config.ts",
  server: { host: "127.0.0.1", port, strictPort: true },
  logLevel: "error"
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: process.env.CE_FREEFORM_HEADED !== "1", args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => message.type() === "error" && errors.push(message.text()));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.goto(`http://127.0.0.1:${port}/Fantasy-Map-Generator/city-editor/`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTitle("Import city map or SVG reference").first().click();
  await (await chooser).setFiles(ledger);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "3D", exact: true }).first().click();
  await page.waitForTimeout(8000);
  const box = (await page.locator(".ce-3d canvas").first().boundingBox())!;
  const frames: number[] = [];
  await page.evaluate(() => {
    (window as unknown as { __f: number[] }).__f = [];
    let last = performance.now();
    const tick = (now: number) => {
      (window as unknown as { __f: number[] }).__f.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // Orbit so the scene redraws every frame.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 240; i++) {
    await page.mouse.move(cx + Math.sin(i / 20) * 200, cy + Math.cos(i / 30) * 60);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const intervals = await page.evaluate(() => (window as unknown as { __f: number[] }).__f);
  frames.push(...intervals.slice(5));
  frames.sort((a, b) => a - b);
  const pick = (f: number) => frames[Math.min(frames.length - 1, Math.ceil(frames.length * f) - 1)];
  await page.locator(".ce-performance summary").first().click();
  await page.waitForTimeout(1500);
  const panel = await page.locator(".ce-performance").first().innerText().catch(() => "");
  console.log(JSON.stringify({ frames: frames.length, p50: pick(0.5), p95: pick(0.95), max: frames.at(-1), errors, panel }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
