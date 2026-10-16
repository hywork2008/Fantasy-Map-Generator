// Generates FMG maps in headless Chromium and dumps per-state statistics for the nobility holdings review.
// Usage: node nobilityStats.mjs <out.jsonl> <seeds,comma> '<localStorage json>'
import { appendFileSync } from "node:fs";
import { chromium } from "/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/node_modules/playwright/index.mjs";
import { startDevServer } from "/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/scripts/lib/viteDevServer.mjs";

const [out, seedArg, storageJson] = process.argv.slice(2);
const seeds = seedArg.split(",");
const storage = { debug: JSON.stringify({ generationProfile: true }), ...JSON.parse(storageJson) };

const server = await startDevServer();
const browser = await chromium.launch({ headless: true });
try {
  for (const seed of seeds) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(entries => {
      if (sessionStorage.getItem("init")) return;
      sessionStorage.setItem("init", "1");
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, storage);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const url = new URL(server.url);
    url.searchParams.set("seed", seed);
    url.searchParams.set("width", "1920");
    url.searchParams.set("height", "1080");
    const t0 = performance.now();
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 300000 });
    const status = await page.evaluate(
      () =>
        new Promise(res => {
          const deadline = performance.now() + 400000;
          const poll = () => {
            const marks = window.fmg?.actions?.getGenerationProfile?.()?.marks ?? {};
            if ("failed" in marks) return res("failed");
            if ("map-ready" in marks) return res("generated");
            const b = [...document.querySelectorAll("button")].find(b => b.textContent === "Generate entire map");
            if ("review-waiting" in marks && b && !b.disabled) b.click();
            if (performance.now() > deadline) return res("timeout");
            setTimeout(poll, 50);
          };
          poll();
        })
    );
    if (status !== "generated") {
      console.error(`seed=${seed} ${status} ${errors.slice(0, 2).join(" | ")}`);
      await context.close();
      continue;
    }
    const s = await page.evaluate(() => {
      const { world } = window.fmg;
      const { pack, grid } = world;
      const o = world.options ?? {};
      const ds = world.distanceScale ?? o.distanceScale;
      const popRate = o.populationRate ?? 1000;
      const urb = o.urbanization ?? 1;
      const c = pack.cells;
      const n = c.i.length;
      const area = i => c.area[i] * ds * ds;
      let landKm2 = 0, land = 0, populated = 0, burgCells = 0;
      for (let i = 0; i < n; i++) {
        if (c.h[i] < 20) continue;
        land++;
        landKm2 += area(i);
        if (c.s[i] > 0 && c.culture[i]) populated++;
        if (c.burg[i]) burgCells++;
      }
      const burgs = pack.burgs.filter(b => b?.i && !b.removed);
      const sameCell = new Map();
      for (const b of burgs) sameCell.set(b.cell, (sameCell.get(b.cell) ?? 0) + 1);
      const dupCells = [...sameCell.values()].filter(v => v > 1).length;
      const states = pack.states.filter(s => s?.i && !s.removed).map(st => {
        let cells = 0, km2 = 0, rural = 0, frontierCells = 0;
        for (let i = 0; i < n; i++) {
          if (c.state[i] !== st.i || c.h[i] < 20) continue;
          cells++;
          km2 += area(i);
          rural += (c.pop[i] ?? 0) * popRate;
        }
        const sb = burgs.filter(b => b.state === st.i);
        const pops = sb.map(b => b.population * popRate * urb).sort((a, b) => b - a);
        const provs = pack.provinces.filter(p => p?.i && !p.removed && p.state === st.i);
        const culture = pack.cultures[st.culture];
        return {
          i: st.i, name: st.name, form: st.form, formName: st.formName,
          cultureBase: culture?.base, cultureName: culture?.name,
          cells, km2: Math.round(km2), rural: Math.round(rural), urban: Math.round(pops.reduce((a, b) => a + b, 0)),
          burgs: sb.length, provinces: provs.length,
          provinceForms: provs.map(p => p.formName),
          burgPop: {
            lt1k: pops.filter(p => p < 1000).length,
            k1_5: pops.filter(p => p >= 1000 && p < 5000).length,
            k5_20: pops.filter(p => p >= 5000 && p < 20000).length,
            ge20k: pops.filter(p => p >= 20000).length,
            max: Math.round(pops[0] ?? 0)
          },
          walled: sb.filter(b => b.walls).length,
          citadel: sb.filter(b => b.citadel).length,
          temple: sb.filter(b => b.temple).length
        };
      });
      return {
        seed: world.seed, template: world.mapHistory?.at?.(-1)?.template, lsTemplate: localStorage.getItem('template'), mapSize: o.mapSize, distanceScale: ds,
        historicalPeriod: o.historicalPeriod, culturesSet: o.culturesSet,
        settlement: o.initialSettlementPattern, saturation: o.initialPopulationSaturation, points: o.points,
        gridCells: grid.points.length, packCells: n, landCells: land, landKm2: Math.round(landKm2),
        meanLandCellKm2: Math.round(landKm2 / land), populatedCells: populated, burgCells, burgs: burgs.length, dupCells,
        characters: (() => { const ch = (pack.characters ?? []).filter(c => !c.dead); const by = {}; for (const c of ch) for (const t of c.titles ?? []) by[t.entityType + ':' + t.name] = (by[t.entityType + ':' + t.name] ?? 0) + 1; return { living: ch.length, total: (pack.characters ?? []).length, byTitle: by }; })(),
        states: states.sort((a, b) => b.km2 - a.km2)
      };
    });
    if (process.env.ADV) {
      s.tick = await page.evaluate(async () => {
        const a = window.fmg.actions;
        a.resetTickProfile?.();
        const t = performance.now();
        await a.advanceTime(0, 6, 0);
        const ms = performance.now() - t;
        const prof = a.getTickProfile?.();
        const living = (window.fmg.world.pack.characters ?? []).filter(c => !c.dead).length;
        return { ms: Math.round(ms), living, prof: JSON.parse(JSON.stringify(prof ?? null)) };
      });
    }
    if (process.env.SHOT) await page.screenshot({ path: `shot-${seed}.png` });
    s.elapsedMs = Math.round(performance.now() - t0);
    s.errors = errors.slice(0, 3);
    appendFileSync(out, JSON.stringify(s) + "\n");
    console.error(
      `seed=${seed} tpl=${s.template} ds=${s.distanceScale?.toFixed?.(2)} land=${s.landCells} (${s.landKm2}km2, ${s.meanLandCellKm2}/cell) burgs=${s.burgs} states=${s.states.length} ${s.elapsedMs}ms`
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}
