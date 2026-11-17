/**
 * Playwright tuning harness for docs/plan/japan-local-war-terrain.md.
 * Run with the Playwright MCP `browser_run_code_unsafe` (filename) on a page that has a generated
 * Japan-template map in the dev server. Edit RUNS for each round. Screenshots go to the
 * Git-ignored docs/analytics/raw/japan-local-terrain/.
 */
async page => {
  const DIR = "docs/analytics/raw/japan-local-terrain/";
  const ROUND = "r3";
  const U250 = { source: "dem", stepKm: 0.25, rings: [], label: "u250" };
  const B = { source: "dem", stepKm: 1, rings: [{ halfKm: 35, stepKm: 0.25 }], label: "r35-250_o1000" };
  const C = {
    source: "dem",
    stepKm: 1,
    rings: [
      { halfKm: 35, stepKm: 0.25 },
      { halfKm: 60, stepKm: 0.5 }
    ],
    label: "r35-250_r60-500_o1000"
  };
  const D = {
    source: "dem",
    stepKm: 1,
    rings: [
      { halfKm: 20, stepKm: 0.25 },
      { halfKm: 45, stepKm: 0.5 }
    ],
    label: "r20-250_r45-500_o1000"
  };
  const RUNS = [
    ["sekigahara", { ...U250, exaggeration: 3 }, "oblique"],
    ["sekigahara", { ...B, exaggeration: 3 }, "oblique"],
    ["sekigahara", { ...C, exaggeration: 3 }, "oblique"],
    ["sekigahara", { ...D, exaggeration: 3 }, "oblique"],
    ["sekigahara", { ...C, exaggeration: 4 }, "oblique"],
    ["sekigahara", { ...C, exaggeration: 3 }, "contact"],
    ["kawanakajima", { ...U250, exaggeration: 3 }, "oblique"],
    ["kawanakajima", { ...C, exaggeration: 3 }, "oblique"],
    ["kawanakajima", { ...D, exaggeration: 3 }, "oblique"],
    ["okehazama", { ...C, exaggeration: 4 }, "contact"],
    ["okehazama", { ...D, exaggeration: 5 }, "contact"]
  ];

  await page.evaluate(async () => {
    const url = re =>
      performance
        .getEntriesByType("resource")
        .map(e => e.name)
        .find(n => re.test(n));
    const base = "/Fantasy-Map-Generator/";
    const T = (await import(url(/three-d-renderer\.ts/) ?? `${base}renderers/three-d-renderer.ts`)).ThreeDRenderer;
    const viewMode = await import(url(/controllers\/viewMode\.ts/) ?? `${base}controllers/viewMode.ts`);
    const knobs = window.__fmgLocalTerrain;
    const lt = { setLocalTerrainTuning: knobs.set, getLocalTerrainTuning: knobs.get };
    const g = await import(`${base}utils/localTerrainGeoref.ts`);
    const w = (await import(`${base}context/worldContext.ts`)).worldContext;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.__lt = {
      async show(siteId, patch, view) {
        const { label: _label, ...tuning } = patch;
        lt.setLocalTerrainTuning({ footDays: 3, hillshade: true, rings: [], ...tuning });
        const site = g.JAPAN_LOCAL_TERRAIN_SITES.find(s => s.id === siteId);
        const p = g.georefLonLatToMap(w.options.earthRegion, site.lon, site.lat, w.graphWidth, w.graphHeight);
        viewMode.openCampaignViewAt(p.x + 1e-6 * Math.random(), p.y);
        for (let i = 0; i < 60; i++) {
          await sleep(500);
          if (T.scene?.getObjectByName("campaign-ground") && !T.localTerrainLoading) break;
        }
        await sleep(1500);
        const t0 = performance.now();
        const before = T.scene.getObjectByName("campaign-ground");
        T.redraw({ refreshTerrainTexture: false });
        while (T.scene.getObjectByName("campaign-ground") === before && performance.now() - t0 < 20000) await sleep(5);
        const buildMs = performance.now() - t0;
        const ground = T.scene.getObjectByName("campaign-ground").geometry;
        if (view === "oblique") {
          const tx = p.x - w.graphWidth / 2;
          const tz = p.y - w.graphHeight / 2;
          const half = (lt.getLocalTerrainTuning().footDays ?? 3) * 28 / w.distanceScale;
          T.controls.target.set(tx, 0, tz);
          T.camera.position.set(tx, half * 0.8, tz + half * 1.4);
          T.controls.update();
          T.render();
          await sleep(800);
        }
        for (const el of document.querySelectorAll("div"))
          if (el.textContent?.startsWith("3D Options") && el.offsetWidth < 400) el.style.visibility = "hidden";
        document.querySelectorAll(".ui-dialog,#optionsContainer").forEach(e => (e.style.visibility = "hidden"));
        let frames = 0;
        const f0 = performance.now();
        await new Promise(res => {
          const tick = () => {
            frames++;
            T.render();
            if (performance.now() - f0 < 2000) requestAnimationFrame(tick);
            else res();
          };
          requestAnimationFrame(tick);
        });
        return {
          vertices: ground.attributes.position.count,
          redrawMs: Math.round(buildMs),
          geometryMB: +((ground.attributes.position.array.byteLength * 3 + ground.index.array.byteLength) / 1e6).toFixed(1),
          fps: frames / 2,
          levels: T.localTerrain?.sampler?.levelSteps
        };
      }
    };
  });

  const results = [];
  for (const [site, patch, view] of RUNS) {
    const label = patch.label ?? `${patch.source}-${Math.round(patch.stepKm * 1000)}m`;
    const name = `${ROUND}-${site}-${label}-x${patch.exaggeration}-${view}`;
    const r = await page.evaluate(([s, p, v]) => window.__lt.show(s, p, v), [site, patch, view]);
    await page.screenshot({ path: `${DIR}${name}.png` });
    results.push({ name, ...r });
  }
  return results;
}
