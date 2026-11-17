/**
 * Playwright tuning harness for docs/plan/japan-local-war-terrain.md.
 * Run with the Playwright MCP `browser_run_code_unsafe` (filename) on a page that has a generated
 * Japan-template map in the dev server. Edit RUNS for each round. Screenshots go to the
 * Git-ignored docs/analytics/raw/japan-local-terrain/.
 */
async page => {
  const DIR = "docs/analytics/raw/japan-local-terrain/";
  const ROUND = "r6";
  const BASE = { source: "dem", label: "default" };
  // Whole Japan in one window: centred on Honshu, wide enough to reach Hokkaido and Kyushu.
  const JAPAN = { source: "dem", footDays: 45, rings: [], maxSamplesPerSide: 2600 };
  const RUNS = [
    ["tokyo", { ...BASE, label: "fmgRivers" }, "oblique"],
    ["tokyo", { ...BASE, label: "fmgRivers" }, "close"],
    ["tokyo", { ...BASE, riverSource: "real", label: "realRivers" }, "oblique"],
    ["sekigahara", { ...BASE, label: "fmgRivers" }, "oblique"]
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
        const { label: _label, heightScale, ...tuning } = patch;
        T.options.scale = heightScale ?? 50;
        const defaults = window.__fmgLocalTerrainDefaults ?? (window.__fmgLocalTerrainDefaults = { ...lt.getLocalTerrainTuning() });
        lt.setLocalTerrainTuning({ ...defaults, ...tuning });
        const site =
          { honshu: { lon: 137.5, lat: 37.0 }, tokyo: { lon: 139.8, lat: 35.7 } }[siteId] ??
          g.JAPAN_LOCAL_TERRAIN_SITES.find(s => s.id === siteId);
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
        if (view === "close") {
          // About 12 km south of the site, 5 km up: the contact ring fills the view.
          const tx = p.x - w.graphWidth / 2;
          const tz = p.y - w.graphHeight / 2;
          const km = 1 / w.distanceScale;
          T.controls.target.set(tx, 0, tz);
          T.camera.position.set(tx, 5 * km, tz + 12 * km);
          T.controls.update();
          T.controls.dispatchEvent({ type: "change" });
          // Contact mode rebuilds the window after a 300 ms debounce; the camera is kept.
          await sleep(2500);
        }
        if (view === "japan") {
          const tx = p.x - w.graphWidth / 2;
          const tz = p.y - w.graphHeight / 2;
          T.controls.target.set(tx, 0, tz);
          T.camera.position.set(tx, w.graphHeight * 0.55, tz + w.graphHeight * 0.75);
          T.controls.update();
          T.controls.dispatchEvent({ type: "change" });
          await sleep(2500);
        }
        if (view === "oblique") {
          const tx = p.x - w.graphWidth / 2;
          const tz = p.y - w.graphHeight / 2;
          const half = (lt.getLocalTerrainTuning().footDays ?? 3) * 28 / w.distanceScale;
          T.controls.target.set(tx, 0, tz);
          T.camera.position.set(tx, half * 0.8, tz + half * 1.4);
          T.controls.update();
          T.controls.dispatchEvent({ type: "change" });
          await sleep(2500);
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
          vertices: T.scene.getObjectByName("campaign-ground").geometry.attributes.position.count,
          contact: T.campaignContact,
          stats: T.getLocalTerrainStats(),
          redrawMs: Math.round(buildMs),
          geometryMB: +((ground.attributes.position.array.byteLength * 3 + ground.index.array.byteLength) / 1e6).toFixed(1),
          fps: frames / 2,
          load: T.localTerrain?.sampler?.load,
          realRivers: T.localTerrain?.sampler?.realRivers?.length,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : undefined
        };
      }
    };
  });

  const results = [];
  for (const [site, patch, view] of RUNS) {
    const label = patch.label ?? `${patch.source}-${Math.round(patch.stepKm * 1000)}m`;
    const name = `${ROUND}-${site}-${label}-${view}`;
    const r = await page.evaluate(([s, p, v]) => window.__lt.show(s, p, v), [site, patch, view]);
    await page.screenshot({ path: `${DIR}${name}.png` });
    results.push({ name, ...r });
  }
  return results;
}
