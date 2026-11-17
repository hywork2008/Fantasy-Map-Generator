/**
 * Playwright harness for docs/plan/japan-terrain-tiles.md (T2+). Run with the Playwright MCP
 * `browser_run_code_unsafe` (filename) on a page with a generated Japan-template map in the dev
 * server. Screenshots go to the Git-ignored docs/analytics/raw/japan-terrain-tiles/.
 */
async page => {
  const DIR = "docs/analytics/raw/japan-terrain-tiles/";
  const ROUND = "t4";
  // [site, tuning patch, view]; views: japan (whole map), region (~400 km), oblique (window), close, ground.
  // `heightScale` changes the 3D Options Height scale (default 50).
  const TILES = {
    enabled: true,
    maxScreenErrorPx: 2,
    maxTiles: 256,
    maxZoom: 5,
    farKm: 0,
    farZoom: 1,
    prefectures: [],
    mapColors: "none"
  };
  const RUNS = [
    ["sekigahara", { tiles: TILES, label: "far0" }, "oblique"],
    ["sekigahara", { tiles: { ...TILES, farKm: 200 }, label: "far200" }, "oblique"],
    ["sekigahara", { tiles: { ...TILES, farKm: 100 }, label: "far100" }, "oblique"],
    ["sekigahara", { tiles: { ...TILES, farKm: 100 }, label: "far100" }, "close"],
    ["tokyo", { tiles: { ...TILES, farKm: 100 }, label: "far100" }, "close"],
    ["sekigahara", { tiles: { ...TILES, farKm: 100, prefectures: ["JP-21", "JP-25"] }, label: "gifu-shiga" }, "japan"],
    ["sekigahara", { tiles: { ...TILES, farKm: 100, prefectures: ["JP-21", "JP-25"] }, label: "gifu-shiga" }, "oblique"],
    ["sekigahara", { tiles: { ...TILES, farKm: 100, mapColors: "states" }, label: "states" }, "oblique"],
    ["sekigahara", { tiles: { ...TILES, farKm: 100, mapColors: "states" }, label: "states" }, "japan"]
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
    const g = await import(`${base}utils/localTerrainGeoref.ts`);
    const w = (await import(`${base}context/worldContext.ts`)).worldContext;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let openKey = "";
    window.__tt = {
      async show(siteId, patch, view) {
        const { label: _label, heightScale, ...tuning } = patch;
        const scaleBefore = T.options.scale;
        T.options.scale = heightScale ?? 50;
        const meshesBefore = T.getTerrainTileStats()?.liveMeshes;
        const defaults = window.__fmgTileDefaults ?? (window.__fmgTileDefaults = { ...knobs.get() });
        knobs.set({ ...defaults, ...tuning });
        const site =
          { tokyo: { lon: 139.8, lat: 35.7 } }[siteId] ?? g.JAPAN_LOCAL_TERRAIN_SITES.find(s => s.id === siteId);
        const p = g.georefLonLatToMap(w.options.earthRegion, site.lon, site.lat, w.graphWidth, w.graphHeight);
        const key = `${siteId}|${JSON.stringify(tuning)}`;
        // A Height scale change alone must not rebuild the tiles (group scale only).
        const rescaled = key === openKey && scaleBefore !== T.options.scale;
        if (key !== openKey) {
          openKey = key;
          viewMode.openCampaignViewAt(p.x + 1e-6 * Math.random(), p.y);
          for (let i = 0; i < 60; i++) {
            await sleep(500);
            if (T.scene?.getObjectByName("campaign-ground") && !T.localTerrainLoading) break;
          }
          await sleep(1500);
        }
        const km = 1 / w.distanceScale;
        const tx = p.x - w.graphWidth / 2;
        const tz = p.y - w.graphHeight / 2;
        const cam = {
          japan: [0, w.graphHeight * 0.75, w.graphHeight * 0.55, 0, 0],
          region: [tx, 250 * km, tz + 300 * km, tx, tz],
          oblique: [tx, 67 * km, tz + 118 * km, tx, tz],
          close: [tx, 5 * km, tz + 12 * km, tx, tz],
          ground: [tx, 1 * km, tz + 4 * km, tx, tz - 2 * km]
        }[view];
        T.controls.maxDistance = 1e6;
        T.controls.minDistance = 0.01;
        T.camera.far = 1e5;
        // Same near/far ratio as the app (0.1 / 2000 at the default distance).
        T.camera.near = Math.max(0.001, Math.hypot(cam[0] - cam[3], cam[1], cam[2] - cam[4]) / 2000);
        T.camera.updateProjectionMatrix();
        T.controls.target.set(cam[3], 0, cam[4]);
        T.camera.position.set(cam[0], cam[1], cam[2]);
        T.terrainTiles?.resetStats();
        const t0 = performance.now();
        T.controls.update();
        T.controls.dispatchEvent({ type: "change" });
        let settledMs = null;
        for (let i = 0; i < 400; i++) {
          await sleep(25);
          const s = T.getTerrainTileStats();
          if (!s || (s.pendingBuilds === 0 && s.drawn > 0)) {
            settledMs = Math.round(performance.now() - t0);
            break;
          }
        }
        await sleep(2500);
        T.controls.dispatchEvent({ type: "change" });
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
        const ground = T.scene.getObjectByName("campaign-ground");
        return {
          tiles: T.getTerrainTileStats(),
          rescaled,
          meshesBefore,
          windowVertices: ground?.visible ? ground.geometry.attributes.position.count : 0,
          settledMs,
          fps: frames / 2,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : undefined
        };
      }
    };
  });

  const results = [];
  for (const [site, patch, view] of RUNS) {
    const name = `${ROUND}-${site}-${patch.label}-${view}`;
    const r = await page.evaluate(([s, p, v]) => window.__tt.show(s, p, v), [site, patch, view]);
    await page.screenshot({ path: `${DIR}${name}.png` });
    results.push({ name, ...r });
  }
  return results;
}
