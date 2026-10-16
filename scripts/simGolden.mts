#!/usr/bin/env tsx
/**
 * Simulation golden test (docs/plan/simulation-core-separation.md §8, S0).
 *
 * Loads a committed .fmg fixture (all four built-in extensions prepared) into headless Chromium,
 * advances time through `window.fmg.actions.advanceTime`, saves the world and hashes the decoded
 * archive section by section. The digests must stay identical across every simulation-core
 * refactor; a mismatch lists the diverged sections (e.g. `world.pack.burgs`).
 *
 * Usage:
 *   npm run test:sim-golden                        # verify against the stored golden
 *   npm run test:sim-golden -- --update            # rewrite the golden (explain why in the commit)
 *   npm run test:sim-golden -- --runs 2            # also require run-to-run reproducibility
 *   npm run test:sim-golden -- --create-fixture    # regenerate tests/fixtures/sim-golden.fmg
 *   [--days 30,365] [--url http://127.0.0.1:5173/Fantasy-Map-Generator/] [--headed]
 *   [--dump temp/sim-golden]   # write each checkpoint's .fmg per run, to diff a mismatch
 *   [--trace-random temp/sim-random.json]   # write the unbound Math.random call sites (must be none)
 *   --env node      # run in this process without DOM (Node Adapter, S6) against __golden__/node.json
 *   --env all       # browser and node, each against its own golden, then report browser vs node
 *
 * The browser and Node goldens are separate files: Chromium's V8 and Node's V8 return different
 * last bits for Math.exp/sin/log/pow (simulation-core-separation.md §20.3), so the two
 * environments cannot share digests. jsdom runs on Node's V8 and must match node.json bit for bit
 * (src/simulation/goldenParity.jsdom.test.ts).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { decodeAndValidateWorldArchive } from "../src/runtime/worldArchive";
import { diffWorldHashes, hashWorldDocument, type WorldHashReport } from "../src/simulation/goldenHash";
import { startDevServer } from "./lib/viteDevServer.mjs";

const root = resolve(import.meta.dirname, "..");
const FIXTURE = resolve(root, "tests/fixtures/sim-golden.fmg");
const GOLDENS = {
  browser: resolve(root, "src/simulation/__golden__/browser.json"),
  node: resolve(root, "src/simulation/__golden__/node.json")
} as const;
type GoldenEnv = keyof typeof GOLDENS;
const EXTENSIONS = ["characters", "economy", "nobility", "shipbuilding"];
const FIXTURE_SEED = "424242";
const VIEWPORT = { width: 1280, height: 720 };

const log = (message: string) => console.error(`[sim:golden] ${message}`);

interface GoldenFile {
  readonly fixture: string;
  readonly fixtureBytes: number;
  readonly extensions: readonly string[];
  readonly checkpoints: Record<string, WorldHashReport>;
}

function parseArgs(argv: string[]) {
  const options = {
    update: false,
    createFixture: false,
    runs: 1,
    days: [30, 365],
    url: undefined as string | undefined,
    headed: false,
    dump: undefined as string | undefined,
    traceRandom: undefined as string | undefined,
    envs: ["browser"] as GoldenEnv[]
  };
  const args = [...argv];
  const value = (flag: string) => {
    const next = args.shift();
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--update") options.update = true;
    else if (flag === "--create-fixture") options.createFixture = true;
    else if (flag === "--runs") options.runs = Number(value(flag));
    else if (flag === "--days") options.days = value(flag).split(",").map(Number);
    else if (flag === "--url") options.url = value(flag);
    else if (flag === "--headed") options.headed = true;
    else if (flag === "--dump") options.dump = resolve(value(flag));
    else if (flag === "--trace-random") options.traceRandom = resolve(value(flag));
    else if (flag === "--env") {
      const env = value(flag);
      if (env !== "browser" && env !== "node" && env !== "all") throw new Error("--env must be browser, node or all");
      options.envs = env === "all" ? ["browser", "node"] : [env];
    }
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isSafeInteger(options.runs) || options.runs < 1) throw new Error("--runs must be a positive integer");
  if (options.days.some(day => !Number.isSafeInteger(day) || day < 1)) throw new Error("--days must be positive");
  options.days.sort((a, b) => a - b);
  return options;
}

/** Locked options: a small province with a stable culture set so states and burgs always exist. */
function storageEntries(): Record<string, string> {
  return {
    debug: JSON.stringify({ generationProfile: true }),
    culturesSet: "european",
    mapScope: "province",
    mapScopeCells: "1500",
    initialSettlementPattern: "standard",
    // Keep the fixture's saved simulation RNG so every run replays the same timeline.
    "fmg-ui-preferences": JSON.stringify({ state: { simulationTimelineOnLoad: "continue" }, version: 0 }),
    "fmg-extensions": JSON.stringify({
      state: { enabledExtensions: Object.fromEntries(EXTENSIONS.map(id => [id, true])) },
      version: 0
    })
  };
}

async function newPage(browser: Browser, entries: Record<string, string>): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  // tsx keeps function names via an injected `__name` helper that page.evaluate closures lack.
  await context.addInitScript("globalThis.__name = globalThis.__name || (fn => fn);");
  await context.addInitScript(storage => {
    if (sessionStorage.getItem("fmg-sim-golden-init")) return;
    sessionStorage.setItem("fmg-sim-golden-init", "1");
    localStorage.clear();
    for (const [key, val] of Object.entries(storage)) localStorage.setItem(key, val);
    // world.mapId is set before the map-ready tasks finish; only this event marks a finished map.
    document.addEventListener("fmg:map-ready-tasks-completed", () => {
      const target = window as unknown as { __simGoldenReady?: number };
      target.__simGoldenReady = (target.__simGoldenReady ?? 0) + 1;
    });
  }, entries);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { page, errors };
}

async function waitForReady(page: Page, minimum: number): Promise<void> {
  await page.waitForFunction(
    count => ((window as unknown as { __simGoldenReady?: number }).__simGoldenReady ?? 0) >= count,
    minimum,
    { timeout: 300_000 }
  );
}

async function archiveBytes(page: Page): Promise<Buffer> {
  // Let renderer/UI observers of the last commit settle before capturing.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const base64 = await page.evaluate(async () => {
    const blob = await window.fmg.actions.prepareWorldArchive();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

async function hashArchive(bytes: Buffer): Promise<WorldHashReport> {
  const validated = await decodeAndValidateWorldArchive({
    blob: new Blob([bytes]),
    header: new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(4, bytes.byteLength))
  });
  return hashWorldDocument(validated.document as unknown as Record<string, unknown>);
}

async function createFixture(browser: Browser, baseUrl: string): Promise<void> {
  const { page, errors } = await newPage(browser, storageEntries());
  const url = new URL(baseUrl);
  url.searchParams.set("seed", FIXTURE_SEED);
  url.searchParams.set("width", String(VIEWPORT.width));
  url.searchParams.set("height", String(VIEWPORT.height));
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 120_000 });
  // Continue the Build-map review like a user would.
  await page.evaluate(() => {
    const poll = () => {
      const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Generate entire map");
      if (button && !button.disabled) button.click();
      else if (!window.fmg?.world?.mapId) setTimeout(poll, 50);
    };
    poll();
  });
  await waitForReady(page, 1);
  const summary = await page.evaluate(extensionIds => {
    const { pack } = window.fmg.world;
    const live = (list: Array<{ i?: number; removed?: boolean } | undefined> | undefined) =>
      (list ?? []).filter(item => item?.i && !item.removed).length;
    return {
      states: live(pack.states),
      burgs: live(pack.burgs),
      markets: (pack.burgs ?? []).filter(b => b && typeof b.market === "number" && b.market > 0).length,
      enabled: extensionIds.filter(id => window.fmg.extensionAPI.isExtensionEnabled(id))
    };
  }, EXTENSIONS);
  log(`fixture map: ${JSON.stringify(summary)}`);
  if (summary.enabled.length !== EXTENSIONS.length) throw new Error(`Extensions not enabled: ${summary.enabled}`);
  if (!summary.states || !summary.burgs || !summary.markets) throw new Error("Fixture map has no states/burgs/markets");
  const bytes = await archiveBytes(page);
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, bytes);
  log(`wrote ${FIXTURE} (${bytes.length} bytes)${errors.length ? `, page errors: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await page.context().close();
}

/**
 * Track R guard (simulation-core-separation.md §13): after the map has loaded, every simulation
 * draw must go through the simulation RNG (timeEngine/runWithSimulationRandom bind `Math.random` to
 * it). Any call that still reaches the page's ambient `Math.random` is recorded by the first stack
 * frame outside the shared probability helpers (`rand`, `P`, `gauss`, …) and fails the run.
 */
async function installRandomTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const counts: Record<string, number> = {};
    (window as unknown as { __simRandomTrace?: Record<string, number> }).__simRandomTrace = counts;
    const ambient = Math.random;
    const helper = /\/utils\/probabilityUtils\.ts|\/node_modules\//;
    Math.random = () => {
      const frames = (new Error().stack ?? "").split("\n").slice(2);
      const frame = frames.find(line => !helper.test(line)) ?? frames[0] ?? "unknown";
      const via = frames[0] && helper.test(frames[0]) ? ` via ${frames[0].trim().split(" ")[1]}` : "";
      const key = `${frame
        .trim()
        .replace(/^at /, "")
        .replace(/https?:\/\/[^/]+\/Fantasy-Map-Generator\//, "src/")
        .replace(/\?[^:)]*/, "")}${via}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return ambient();
    };
  });
}

/** One full run: load the fixture, hash after load and at every requested day. */
async function runOnce(browser: Browser, baseUrl: string, days: readonly number[], dumpDir?: string, tracePath?: string) {
  const capture = async (name: string) => {
    const bytes = await archiveBytes(page);
    if (dumpDir) writeFileSync(resolve(dumpDir, `${name}.fmg`), bytes);
    return hashArchive(bytes);
  };
  const { page, errors } = await newPage(browser, storageEntries());
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  // Load while the app waits at its first Build-map review, so no map is generated first.
  await page.getByRole("button", { name: "Generate entire map", exact: true }).waitFor({ state: "visible", timeout: 120_000 });
  await page.locator("#fileInputs #mapToLoad").setInputFiles(FIXTURE);
  await waitForReady(page, 1);
  await installRandomTrace(page);

  const checkpoints: Record<string, WorldHashReport> = {};
  checkpoints["day-0"] = await capture("day-0");
  let elapsed = 0;
  for (const day of days) {
    const started = performance.now();
    await page.evaluate(delta => window.fmg.actions.advanceTime(0, 0, delta), day - elapsed);
    log(`advanced ${day - elapsed} days in ${Math.round(performance.now() - started)} ms`);
    elapsed = day;
    checkpoints[`day-${day}`] = await capture(`day-${day}`);
  }
  const counts = await page.evaluate(
    () => (window as unknown as { __simRandomTrace: Record<string, number> }).__simRandomTrace
  );
  const unboundRandom = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (tracePath) writeFileSync(tracePath, `${JSON.stringify({ days, sites: Object.fromEntries(unboundRandom) }, null, 2)}\n`);
  await page.context().close();
  return { checkpoints, errors, unboundRandom };
}

function compare(label: string, expected: Record<string, WorldHashReport>, actual: Record<string, WorldHashReport>) {
  const failures: string[] = [];
  for (const [name, report] of Object.entries(actual)) {
    const reference = expected[name];
    if (!reference) {
      failures.push(`${label} ${name}: no golden entry (run with --update)`);
      continue;
    }
    if (reference.digest === report.digest) continue;
    const sections = diffWorldHashes(reference, report);
    failures.push(`${label} ${name}: ${sections.length} section(s) differ: ${sections.slice(0, 20).join(", ")}`);
  }
  return failures;
}

/**
 * Node Adapter run (S6) in a fresh child process, as each browser run uses a fresh page: module
 * state left by one load must not leak into the next run (simulation-core-separation.md §20.4).
 */
async function runNodeOnce(days: readonly number[], dumpDir?: string) {
  const args = [resolve(root, "scripts/lib/simGoldenNodeRun.mts"), FIXTURE, days.join(","), ...(dumpDir ? [dumpDir] : [])];
  const output = await new Promise<string>((done, fail) => {
    const child = spawn(resolve(root, "node_modules/.bin/tsx"), args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      const text = String(chunk);
      stderr = (stderr + text).slice(-4000);
      for (const line of text.split("\n")) if (line.startsWith("[sim:golden]")) console.error(line);
    });
    child.on("error", fail);
    child.on("exit", code => (code === 0 ? done(stdout) : fail(new Error(`node run exited ${code}:\n${stderr}`))));
  });
  const result = JSON.parse(output) as { checkpoints: Record<string, WorldHashReport>; unboundRandom: [string, number][] };
  return { ...result, errors: [] as string[] };
}

type Run = Awaited<ReturnType<typeof runOnce>>;

/** Verifies (or with --update rewrites) one environment's golden; returns the failures. */
function settle(env: GoldenEnv, runs: readonly Run[], update: boolean): string[] {
  const failures: string[] = [];
  for (const [index, run] of runs.entries())
    if (run.unboundRandom.length)
      failures.push(
        `${env} run ${index + 1}: ${run.unboundRandom.reduce((sum, [, n]) => sum + n, 0)} Math.random call(s) outside the simulation RNG: ` +
          run.unboundRandom
            .slice(0, 10)
            .map(([site, n]) => `${n}× ${site}`)
            .join("; ")
      );
  for (let i = 1; i < runs.length; i++)
    failures.push(...compare(`${env} reproducibility run ${i + 1} vs 1:`, runs[0].checkpoints, runs[i].checkpoints));
  for (const [index, run] of runs.entries())
    if (run.errors.length) log(`${env} run ${index + 1} page errors: ${run.errors.slice(0, 5).join(" | ")}`);

  const path = GOLDENS[env];
  if (update) {
    if (failures.length) throw new Error(`Refusing to update a non-reproducible golden:\n${failures.join("\n")}`);
    const golden: GoldenFile = {
      fixture: "tests/fixtures/sim-golden.fmg",
      fixtureBytes: readFileSync(FIXTURE).length,
      extensions: EXTENSIONS,
      checkpoints: runs[0].checkpoints
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(golden, null, 2)}\n`);
    log(`wrote ${path}`);
    return [];
  }
  if (!existsSync(path)) return [...failures, `Missing ${path}; run with --env ${env} --update`];
  const golden = JSON.parse(readFileSync(path, "utf8")) as GoldenFile;
  for (const [index, run] of runs.entries())
    failures.push(...compare(`${env} run ${index + 1} vs golden:`, golden.checkpoints, run.checkpoints));
  if (!failures.length) log(`OK [${env}]: ${Object.keys(runs[0].checkpoints).join(", ")} match the golden`);
  return failures;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const needsBrowser = options.createFixture || options.envs.includes("browser");
  const server = !needsBrowser
    ? { url: "", stop: () => {} }
    : options.url
      ? { url: options.url, stop: () => {} }
      : await startDevServer();
  const browser = needsBrowser ? await chromium.launch({ headless: !options.headed }) : null;
  try {
    if (options.createFixture && browser) {
      await createFixture(browser, server.url);
      if (!options.update) return;
    }
    if (!existsSync(FIXTURE)) throw new Error(`Missing ${FIXTURE}; run with --create-fixture`);

    const results = new Map<GoldenEnv, Run[]>();
    for (const env of options.envs) {
      const runs: Run[] = [];
      for (let i = 0; i < options.runs; i++) {
        log(`${env} run ${i + 1}/${options.runs}`);
        const dumpDir = options.dump ? resolve(options.dump, options.envs.length > 1 ? env : "", `run-${i + 1}`) : undefined;
        if (dumpDir) mkdirSync(dumpDir, { recursive: true });
        runs.push(
          env === "node"
            ? await runNodeOnce(options.days, dumpDir)
            : await runOnce(browser!, server.url, options.days, dumpDir, i === 0 ? options.traceRandom : undefined)
        );
      }
      results.set(env, runs);
    }
    const failures = options.envs.flatMap(env => settle(env, results.get(env)!, options.update));
    const browserRun = results.get("browser")?.[0];
    const nodeRun = results.get("node")?.[0];
    if (browserRun && nodeRun)
      for (const [name, report] of Object.entries(nodeRun.checkpoints)) {
        const other = browserRun.checkpoints[name];
        const sections = other ? diffWorldHashes(other, report) : ["(missing)"];
        log(
          `browser vs node ${name}: ${sections.length ? `${sections.length} section(s) differ (libm, §20.3): ${sections.join(", ")}` : "identical"}`
        );
      }
    if (failures.length) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    server.stop();
  }
}

await main();
