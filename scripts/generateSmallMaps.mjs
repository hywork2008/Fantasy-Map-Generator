#!/usr/bin/env node
// Generates Province/Islet-scope maps (or a whole world, --scope world, e.g. for long-distance trade runs) (docs/plan/map-scope-small-worlds.md) in headless Chromium
// and saves those that meet --require as .fmg files, e.g. a minimal set for `npm run ce:perf`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { startDevServer } from "./lib/viteDevServer.mjs";

const REQUIREMENTS = ["burg", "sea-port", "river-port", "river-burg", "river", "road", "province"];
const usage = `Usage: npm run fmg:small -- <out-dir> [--scope province|islet|world] [--count 1] [--seed 1,2,3 | --start-seed 1000 --tries 50]
         [--cells 500] [--islet-land 0..6] [--require ${REQUIREMENTS.join(",")}] [--max-burgs N]
         [--local-storage settings.json] [--width 1920] [--height 1080] [--url http://host/Fantasy-Map-Generator/]
         [--timeout-ms 120000] [--headed] [--wait-extensions] [--lab '{"riverDensity":4}' | --lab default]`;
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
const log = message => console.error(`[fmg:small] ${message}`);

/** Waits for the generation started by page load, continuing the Build-map review like a user. */
function waitForMap(page, timeoutMs, waitExtensions) {
  return page.evaluate(
    ({ timeoutMs, waitExtensions }) =>
      new Promise(resolveMap => {
        const deadline = performance.now() + timeoutMs;
        const poll = () => {
          const profile = window.fmg?.actions?.getGenerationProfile?.();
          const marks = profile?.marks ?? {};
          if ("failed" in marks) return resolveMap("failed");
          // --wait-extensions: extension map-ready tasks (economy, nobility) finish after "map-ready".
          if ("map-ready" in marks && (!waitExtensions || window.__fmgMapReadyTasksDone)) return resolveMap("generated");
          const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Generate entire map");
          if ("review-waiting" in marks && button && !button.disabled) button.click();
          if (performance.now() > deadline) return resolveMap("timeout");
          setTimeout(poll, 20);
        };
        poll();
      }),
    { timeoutMs, waitExtensions }
  );
}

/** What the map offers for CE/route verification; ports follow src/utils/burgPorts.ts. */
function summarizeMap(page) {
  return page.evaluate(() => {
    const { world } = window.fmg;
    const { pack, grid } = world;
    const live = list => (list ?? []).filter(item => item?.i && !item.removed);
    const burgs = live(pack.burgs).map(burg => {
      const onRiver = Boolean(pack.cells.r?.[burg.cell]);
      const harbor = burg.port ? pack.features[burg.port] : null;
      return {
        i: burg.i,
        name: burg.name,
        population: burg.population,
        capital: Boolean(burg.capital),
        seaPort: burg.seaPort ?? Boolean(harbor && harbor.type === "ocean"),
        riverPort: burg.riverPort ?? Boolean(burg.port && onRiver),
        onRiver
      };
    });
    const routeGroups = {};
    for (const route of pack.routes ?? []) routeGroups[route.group] = (routeGroups[route.group] ?? 0) + 1;
    return {
      seed: world.seed,
      scope: grid.scope ?? null,
      graph: { width: world.graphWidth, height: world.graphHeight },
      cells: {
        grid: grid.points.length,
        gridLand: Array.from(grid.cells.h).filter(h => h >= 20).length,
        pack: pack.cells.i.length,
        packLand: Array.from(pack.cells.h).filter(h => h >= 20).length
      },
      counts: {
        burgs: burgs.length,
        states: live(pack.states).length,
        provinces: live(pack.provinces).length,
        cultures: live(pack.cultures).length,
        rivers: pack.rivers?.length ?? 0
      },
      routeGroups,
      burgs
    };
  });
}

function missingRequirements(summary, required, maxBurgs) {
  const { burgs, counts, routeGroups } = summary;
  const has = {
    burg: burgs.length > 0,
    "sea-port": burgs.some(b => b.seaPort),
    "river-port": burgs.some(b => b.riverPort),
    "river-burg": burgs.some(b => b.onRiver),
    river: counts.rivers > 0,
    road: (routeGroups.roads ?? 0) > 0,
    province: counts.provinces > 0
  };
  const missing = required.filter(key => !has[key]);
  if (maxBurgs !== undefined && burgs.length > maxBurgs) missing.push(`burgs<=${maxBurgs}`);
  return missing;
}

async function main() {
  const outArg = args.shift();
  if (!outArg || outArg.startsWith("--")) throw new Error(usage);
  let scope = "province";
  let count = 1;
  let seeds;
  let startSeed = 1000;
  let tries = 50;
  let cells;
  let isletLand;
  let required = [];
  let maxBurgs;
  let storageFile;
  let width = 1920;
  let height = 1080;
  let externalUrl;
  let timeoutMs = 120000;
  let headed = false;
  let waitExtensions = false;
  let lab;
  const value = flag => {
    const val = args.shift();
    if (!val || val.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return val;
  };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--scope") scope = value(flag);
    else if (flag === "--count") count = Number(value(flag));
    else if (flag === "--seed") seeds = value(flag).split(",");
    else if (flag === "--start-seed") startSeed = Number(value(flag));
    else if (flag === "--tries") tries = Number(value(flag));
    else if (flag === "--cells") cells = Number(value(flag));
    else if (flag === "--islet-land") isletLand = Number(value(flag));
    else if (flag === "--require") required = value(flag).split(",");
    else if (flag === "--max-burgs") maxBurgs = Number(value(flag));
    else if (flag === "--local-storage") storageFile = resolve(value(flag));
    else if (flag === "--width") width = Number(value(flag));
    else if (flag === "--height") height = Number(value(flag));
    else if (flag === "--url") externalUrl = value(flag);
    else if (flag === "--timeout-ms") timeoutMs = Number(value(flag));
    else if (flag === "--headed") headed = true;
    else if (flag === "--wait-extensions") waitExtensions = true;
    else if (flag === "--lab") {
      const val = value(flag);
      lab = { ...(val === "default" ? {} : JSON.parse(val)), enabled: true };
    }
    else throw new Error(`Unknown option: ${flag}\n${usage}`);
  }
  if (!["province", "islet", "world"].includes(scope)) throw new Error("--scope must be province, islet or world");
  const unknown = required.filter(key => !REQUIREMENTS.includes(key));
  if (unknown.length) throw new Error(`Unknown --require: ${unknown.join(",")}`);
  for (const [key, val] of Object.entries({ count, startSeed, tries, width, height, timeoutMs }))
    if (!Number.isSafeInteger(val) || val < 1) throw new Error(`Invalid ${key}`);
  if (seeds?.some(seed => !/^\d+$/.test(seed))) throw new Error("--seed requires numeric seeds");
  seeds ??= Array.from({ length: tries }, (_, i) => String(startSeed + i));

  const extra = storageFile ? JSON.parse(readFileSync(storageFile, "utf8")) : {};
  // Locked options (a localStorage entry is a lock): the scope survives randomizeOptions().
  const storage = {
    debug: JSON.stringify({ generationProfile: true }),
    // Lab statistics need comparable maps: Standard settlement (a randomized Frontier pattern can
    // leave a reshaped province without planned settlement nodes, hence no burgs). --local-storage wins.
    ...(lab ? { initialSettlementPattern: "standard" } : {}),
    ...extra,
    mapScope: scope,
    ...(cells !== undefined ? { mapScopeCells: String(cells) } : {}),
    ...(isletLand !== undefined ? { isletLandCells: String(isletLand) } : {}),
    // River-Port Lab (docs/plan/river-port-lab.md), read by src/debug/riverPortLab/labOptions.ts.
    ...(lab ? { riverPortLab: JSON.stringify(lab) } : {})
  };

  const outDir = resolve(outArg);
  mkdirSync(outDir, { recursive: true });
  const manifest = join(outDir, "small-maps.jsonl");
  const server = externalUrl ? { url: externalUrl, stop: () => {} } : await startDevServer();
  const browser = await chromium.launch({ headless: !headed });
  let saved = 0;
  try {
    for (const seed of seeds) {
      if (saved >= count) break;
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addInitScript(entries => {
        if (sessionStorage.getItem("fmg-small-init")) return;
        sessionStorage.setItem("fmg-small-init", "1");
        localStorage.clear();
        for (const [key, val] of Object.entries(entries)) localStorage.setItem(key, val);
      }, storage);
      await context.addInitScript(() =>
        document.addEventListener("fmg:map-ready-tasks-completed", () => (window.__fmgMapReadyTasksDone = true))
      );
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      const url = new URL(server.url);
      url.searchParams.set("seed", seed);
      url.searchParams.set("width", String(width));
      url.searchParams.set("height", String(height));
      const started = performance.now();
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const status = await waitForMap(page, timeoutMs, waitExtensions);
      const elapsedMs = Math.round(performance.now() - started);
      if (status !== "generated") {
        log(`seed=${seed} ${status} ${pageErrors.slice(0, 2).join(" | ")}`);
        await context.close();
        continue;
      }
      const summary = await summarizeMap(page);
      const missing = missingRequirements(summary, required, maxBurgs);
      const line = `seed=${seed} burgs=${summary.counts.burgs} rivers=${summary.counts.rivers} land=${summary.cells.gridLand}/${summary.cells.grid} ${elapsedMs}ms`;
      if (missing.length) {
        log(`${line} skipped (missing ${missing.join(",")})`);
        await context.close();
        continue;
      }
      const base64 = await page.evaluate(async () => {
        const blob = await window.fmg.actions.prepareWorldArchive();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      });
      const file = join(outDir, `${scope}-${seed}.fmg`);
      if (existsSync(file)) log(`overwriting ${file}`);
      writeFileSync(file, Buffer.from(base64, "base64"));
      appendFileSync(manifest, `${JSON.stringify({ file, elapsedMs, pageErrors, ...summary })}\n`);
      saved++;
      log(`${line} saved ${file}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  log(`Saved ${saved}/${count} maps to ${outDir}`);
  if (saved < count) process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  console.error(`[fmg:small] ${error?.message ?? String(error)}`);
  process.exitCode = 1;
}
