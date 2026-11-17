/**
 * Playwright harness for docs/plan/alps-terrain-tiles.md.
 * Run with the Playwright MCP `browser_run_code_unsafe` (filename) on the dev server with `alps`
 * stored as the template (it generates the map itself). Screenshots go to the Git-ignored
 * docs/analytics/raw/alps-terrain/.
 */
async page => {
  const DIR = "docs/analytics/raw/alps-terrain/";
  const ROUND = "a3";
  // [site, camera height km, camera distance km south of the site]
  const RUNS = [
    ["zermatt", 10, 20],
    ["lauterbrunnen", 8, 16],
    ["aletsch", 10, 20],
    ["engadin", 10, 20],
    ["lugano", 10, 20],
    ["chamonix", 10, 20],
    ["dolomites", 10, 20],
    ["innsbruck", 10, 20]
  ];

  await page.goto("http://localhost:5173/Fantasy-Map-Generator/?seed=12345");
  await page.waitForTimeout(6000);
  const generate = page.getByRole("button", { name: "Generate entire map" });
  if (await generate.count()) await generate.click();
  for (let i = 0; i < 120; i++) {
    const ready = await page.evaluate(async () => {
      const w = (await import("/Fantasy-Map-Generator/context/worldContext.ts")).worldContext;
      return Array.isArray(w.pack?.burgs) && w.pack.burgs.length > 1;
    });
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(4000);

  const results = [];
  for (const [site, heightKm, backKm] of RUNS) {
    const result = await page.evaluate(
      async ({ site, heightKm, backKm }) => {
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
        const s = g.localTerrainSites(w.options.earthRegion.id).find(x => x.id === site);
        const p = g.georefLonLatToMap(w.options.earthRegion, s.lon, s.lat, w.graphWidth, w.graphHeight);
        viewMode.openCampaignViewAt(p.x + 1e-6 * Math.random(), p.y);
        await sleep(6000);
        // distanceScale is km per map pixel; world units are map pixels.
        const km = 1 / w.distanceScale;
        const tx = p.x - w.graphWidth / 2;
        const tz = p.y - w.graphHeight / 2;
        T.terrainTiles?.resetStats();
        // Alpine ground sits kilometres above sea level: aim at the ground, not at 0.
        const ground = T.terrainTiles?.metersAt(p.x, p.y, w.graphWidth, w.graphHeight) ?? 0;
        const groundY = (ground / 1000) * km * 3;
        T.controls.target.set(tx, groundY, tz);
        T.camera.position.set(tx, groundY + heightKm * km, tz + backKm * km);
        T.controls.update();
        T.controls.dispatchEvent({ type: "change" });
        await sleep(6000);
        document.querySelectorAll(".ui-dialog, #optionsContainer").forEach(d => (d.style.display = "none"));
        const stats = T.terrainTiles?.getStats();
        return {
          tilesLoaded: T.terrainTiles?.isLoaded() ?? false,
          drawn: stats?.drawn,
          drawnVertices: stats?.drawnVertices,
          byZoom: stats?.byZoom,
          maxUpdateMs: stats?.maxUpdateMs,
          meters: T.terrainTiles?.metersAt(p.x, p.y, w.graphWidth, w.graphHeight)
        };
      },
      { site, heightKm, backKm }
    );
    await page.screenshot({ path: `${DIR}${ROUND}-${site}.png` });
    results.push({ site, ...result });
  }
  return results;
}
