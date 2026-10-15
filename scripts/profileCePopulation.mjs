// Actual CE UI: leave generation options at their defaults, change population, click Generate.
// npm run dev, then: node scripts/profileCePopulation.mjs [URL] [output.json] [seed]
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, totalmem } from "node:os";
import { dirname } from "node:path";
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://127.0.0.1:5173/Fantasy-Map-Generator/city-editor/";
const output = process.argv[3] ?? "temp/population-validation/profile-215000.json";
const seed = process.argv[4] ?? "ppi409";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1485, height: 1070 } });
  await page.exposeFunction("profileProgress", entry => console.log(JSON.stringify(entry)));
  await page.addInitScript(() => {
    const r = window.__ceProfile = { events: [], renders: [], errors: [] };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          const at = performance.now();
          if (data.type === "progress") {
            r.events.push({ at, ...data.sample });
            window.profileProgress({ atMs: at - r.started, phase: data.sample.phase, attempt: data.sample.attempt, elapsedMs: data.sample.elapsedMs, failure: data.sample.failure?.reason });
          } else if (data.type === "complete") {
            r.completeAt = at;
            r.timing = data.timing;
            r.transferMs = performance.timeOrigin + at - data.timing.postedAt;
            r.report = data.document?.populationReport;
            r.frame = data.document?.frame;
            r.faces = data.document ? Object.keys(data.document.mesh.faces).length : 0;
            r.success = !!data.document;
          } else r.errors.push(data);
        });
      }
      postMessage(data, ...args) {
        if (window.__ceCaptureRequest) r.rawRequest = data;
        r.request = { settings: data.settings, seed: data.seed, frame: data.document.frame, faces: Object.keys(data.document.mesh.faces).length };
        r.workerPostAt = performance.now();
        return super.postMessage({ ...data, profile: true }, ...args);
      }
    };
    document.addEventListener("click", e => {
      if (e.target.closest("button")?.textContent.includes("🏘")) r.started = performance.now();
    }, true);
    // Diagnostic events do not bubble; capture observes events from the editor root.
    document.addEventListener("city-render-diagnostics", e => {
      if (r.started) r.renders.push({ at: performance.now(), ...e.detail });
    }, true);
    new MutationObserver(() => {
      if (r.completeAt && !document.querySelector('[aria-busy="true"]') && !r.uiDoneAt) {
        r.uiDoneAt = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => { r.paintedAt = performance.now(); }));
      }
    }).observe(document, { subtree: true, attributes: true, childList: true });
  });
  // CE_CAPTURE_REQUEST=path saves the exact Worker input for headless replay (scripts/benchmarkCeGiant.ts).
  if (process.env.CE_CAPTURE_REQUEST) await page.addInitScript(() => { window.__ceCaptureRequest = true; });
  await page.goto(url);
  const initialPopulation = await page.locator(".ce-population-input").inputValue();
  if (initialPopulation !== "15000") throw new Error(`Unexpected default: ${initialPopulation}`);
  await page.locator(".ce-generate-seed").fill(seed);
  await page.locator(".ce-generate-seed").dispatchEvent("change");
  await page.locator(".ce-population-input").fill("215000");
  await page.locator(".ce-population-input").dispatchEvent("change");
  const cdp = process.env.CE_CPU_PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 2000 });
    await cdp.send("Profiler.start");
  }
  await page.getByRole("button", { name: "🏘 Generate complete city", exact: true }).click();
  // Long runs report phase progress to stdout; a timeout preserves partial diagnostics.
  let error;
  try { await page.waitForFunction(() => window.__ceProfile.paintedAt, undefined, { timeout: 1_800_000 }); }
  catch (e) { error = String(e); }
  const result = await page.evaluate(() => ({ ...window.__ceProfile, observedAt: performance.now(), userAgent: navigator.userAgent }));
  // Also verify that dismissing the completion notice leaves the rendered city intact.
  if (result.success && result.paintedAt) {
    const before = await page.evaluate(() => ({
      svg: document.querySelector(".ce-map svg")?.outerHTML,
      renders: window.__ceProfile.renders.length,
      status: document.querySelector(".ce-status")?.textContent
    }));
    await page.waitForTimeout(2100);
    result.noticeCheck = await page.evaluate(before => ({
      svgPresent: !!before.svg,
      svgUnchanged: before.svg === document.querySelector(".ce-map svg")?.outerHTML,
      additionalRenderEvents: window.__ceProfile.renders.length - before.renders,
      statusBefore: before.status,
      statusAfter: document.querySelector(".ce-status")?.textContent
    }), before);
  }
  if (process.env.CE_CAPTURE_REQUEST) {
    const raw = await page.evaluate(() => window.__ceProfile.rawRequest);
    await mkdir(dirname(process.env.CE_CAPTURE_REQUEST), { recursive: true });
    await writeFile(process.env.CE_CAPTURE_REQUEST, JSON.stringify(raw));
    delete result.rawRequest;
  }
  result.initialPopulation = initialPopulation;
  result.error = error;
  result.source = { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() };
  result.environment = { platform: platform(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem() };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    await writeFile(output.replace(/\.json$/, ".cpuprofile"), JSON.stringify(profile));
  }
  await page.screenshot({ path: output.replace(/\.json$/, ".png") });
  console.log(JSON.stringify({ output, success: result.success, clickToPaintMs: result.paintedAt - result.started, structureMs: result.timing?.structureMs, report: result.report }));
} finally { await browser.close(); }
