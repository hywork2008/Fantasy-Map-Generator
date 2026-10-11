// River-Port Lab L2 (docs/plan/river-port-lab.md §3): a pool of headless Chromium pages, each
// generating lab maps in place via window.fmg.lab.generate. Pages are reused and reloaded every
// `recycleAfter` maps (or after an error) to bound memory.
import { chromium } from "playwright";
import { startDevServer } from "./viteDevServer.mjs";

// Locked options (a localStorage entry is a lock) so randomizeOptions() keeps the lab setup.
const STORAGE = {
  debug: JSON.stringify({ generationProfile: true }),
  mapScope: "province",
  initialSettlementPattern: "standard"
};

export async function startLabPool({ workers = 1, url, recycleAfter = 50, log = () => {} } = {}) {
  const server = url ? { url, stop: () => {} } : await startDevServer();
  const browser = await chromium.launch({ headless: true });
  const idle = [];
  const waiting = [];

  async function openPage(slot) {
    await slot.context?.close().catch(() => {});
    slot.context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await slot.context.addInitScript(entries => {
      if (sessionStorage.getItem("fmg-lab-init")) return;
      sessionStorage.setItem("fmg-lab-init", "1");
      localStorage.clear();
      for (const [key, val] of Object.entries(entries)) localStorage.setItem(key, val);
    }, STORAGE);
    slot.page = await slot.context.newPage();
    slot.errors = [];
    slot.page.on("pageerror", error => slot.errors.push(error.message));
    await slot.page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await slot.page.waitForFunction(() => window.fmg?.lab?.generate, null, { timeout: 120000 });
    slot.generated = 0;
  }

  const slots = await Promise.all(
    Array.from({ length: workers }, async (_, id) => {
      const slot = { id };
      await openPage(slot);
      return slot;
    })
  );
  idle.push(...slots);
  log(`lab pool: ${workers} page(s) on ${server.url}`);

  const acquire = () => (idle.length ? Promise.resolve(idle.pop()) : new Promise(resolve => waiting.push(resolve)));
  const release = slot => (waiting.length ? waiting.shift()(slot) : idle.push(slot));

  /** Generates one lab map; resolves to window.fmg.lab.generate's result plus page errors. */
  async function generate(request) {
    const slot = await acquire();
    try {
      if (slot.generated >= recycleAfter) await openPage(slot);
      slot.errors = [];
      const result = await slot.page.evaluate(request => window.fmg.lab.generate(request), request);
      slot.generated++;
      return { ...result, pageErrors: slot.errors.slice(0, 5) };
    } catch (error) {
      // The page may be mid-generation or broken: start the next request from a fresh one.
      await openPage(slot).catch(reloadError => log(`lab page ${slot.id} reload failed: ${reloadError.message}`));
      throw error;
    } finally {
      release(slot);
    }
  }

  async function close() {
    await browser.close().catch(() => {});
    server.stop();
  }

  return { generate, close, workers };
}
