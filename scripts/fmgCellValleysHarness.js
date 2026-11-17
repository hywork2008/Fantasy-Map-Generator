/**
 * Playwright harness for docs/plan/fmg-cell-valleys.md (V3).
 * Run with the Playwright MCP `browser_run_code_unsafe` (filename) on the dev server with a
 * Japan-template map stored as the template (it generates the map itself). Screenshots go to the
 * Git-ignored docs/analytics/raw/fmg-cell-valleys/.
 */
async page => {
  const DIR = "docs/analytics/raw/fmg-cell-valleys/";
  const ROUND = "v3";
  const RUNS = [
    // [site, label, valley patch, extra tuning]; the first run only warms the samplers and tiles.
    ["sekigahara", "warmup", {}, {}],
    ["sekigahara", "base", { spurs: false, gorge: false }, {}],
    ["sekigahara", "spurs", { spurs: true, gorge: false }, {}],
    ["sekigahara", "full", { spurs: true, gorge: true }, {}],
    ["sekigahara", "narrow", { spurs: true, gorge: true, widthScale: 0.7 }, {}],
    ["kawanakajima", "full", { spurs: true, gorge: true }, {}],
    ["kawanakajima", "off", { enabled: false }, {}],
    ["sekigahara", "cells-full", { spurs: true, gorge: true }, { source: "cells" }],
    ["sekigahara", "cells-off", { enabled: false }, { source: "cells" }]
  ];

  await page.goto("http://localhost:5173/Fantasy-Map-Generator/?seed=12345");
  await page.waitForTimeout(6000);
  const generate = page.getByRole("button", { name: "Generate entire map" });
  if (await generate.count()) await generate.click();
  for (let i = 0; i < 120; i++) {
    const ready = await page.evaluate(async () => {
      const w = (await import("/Fantasy-Map-Generator/context/worldContext.ts")).worldContext;
      return Array.isArray(w.pack?.rivers) && w.pack.rivers.length > 0 && Array.isArray(w.pack?.burgs);
    });
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(4000);

  const results = [];
  const targets = {};
  for (const [site, label, valley, extra] of RUNS) {
    const result = await page.evaluate(
      async ({ site, valley, extra, target }) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const base = "/Fantasy-Map-Generator/";
        const url = re =>
          performance
            .getEntriesByType("resource")
            .map(e => e.name)
            .filter(n => re.test(n))
            .pop();
        const T = (await import(url(/three-d-renderer\.ts/) ?? `${base}renderers/three-d-renderer.ts`)).ThreeDRenderer;
        const viewMode = await import(url(/controllers\/viewMode\.ts/) ?? `${base}controllers/viewMode.ts`);
        const g = await import(`${base}utils/localTerrainGeoref.ts`);
        const w = (await import(`${base}context/worldContext.ts`)).worldContext;
        const knobs = window.__fmgLocalTerrain;
        const defaults = window.__fmgValleyDefaults ?? (window.__fmgValleyDefaults = { ...knobs.get() });
        knobs.set({ ...defaults, ...extra, valley: { ...defaults.valley, enabled: true, ...valley } });
        const s = g.JAPAN_LOCAL_TERRAIN_SITES.find(x => x.id === site);
        const p = g.georefLonLatToMap(w.options.earthRegion, s.lon, s.lat, w.graphWidth, w.graphHeight);
        viewMode.openCampaignViewAt(p.x + 1e-6 * Math.random(), p.y);
        await sleep(6000);
        T.terrainTiles?.resetStats();
        const before = T.scene.getObjectByName("campaign-ground");
        const t0 = performance.now();
        T.redraw({ refreshTerrainTexture: false });
        while (T.scene.getObjectByName("campaign-ground") === before && performance.now() - t0 < 20000) await sleep(5);
        const redrawMs = performance.now() - t0;
        const km = w.distanceScale;
        // Highest FMG river cell within 40 km: where a river used to cross a ridge.
        let aim = target;
        if (!aim) {
          const L = T.terrainTiles;
          for (const r of w.pack.rivers)
            for (const c of r.cells ?? []) {
              const q = w.pack.cells.p[c];
              if (!q || Math.hypot(q[0] - p.x, q[1] - p.y) > 40 * km) continue;
              const raw = L?.rawMetersAt(q[0], q[1], 3, w.graphWidth, w.graphHeight) ?? w.pack.cells.h[c];
              if (!aim || raw > aim.raw) aim = { x: q[0], y: q[1], raw };
            }
        }
        const tx = aim.x - w.graphWidth / 2;
        const tz = aim.y - w.graphHeight / 2;
        T.controls.target.set(tx, 0, tz);
        T.camera.position.set(tx, 6 * km, tz + 14 * km);
        T.controls.update();
        T.controls.dispatchEvent({ type: "change" });
        await sleep(6000);
        document.querySelectorAll(".ui-dialog, #optionsContainer").forEach(d => (d.style.display = "none"));
        const ground = T.scene.getObjectByName("campaign-ground");
        return {
          aim,
          redrawMs: Math.round(redrawMs),
          groundVertices: ground?.geometry.attributes.position.count ?? 0,
          valley: T.getValleyStats(),
          tileMaxUpdateMs: T.terrainTiles?.getStats().maxUpdateMs
        };
      },
      { site, valley, extra, target: targets[site] }
    );
    targets[site] ??= result.aim;
    await page.screenshot({ path: `${DIR}${ROUND}-${site}-${label}.png` });
    results.push({ site, label, ...result, aim: undefined });
  }
  return results;
}
