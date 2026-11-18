/**
 * Playwright harness for docs/plan/japan-terrain-tiles.md (T7): compares the local terrain field
 * (snapped FMG rivers and the DEM coast) read from the prefecture rasters (japan-local/) with the
 * same field read from the terrain tiles. Run with the Playwright MCP `browser_run_code_unsafe`
 * (filename) on a page with a generated Japan-template map. Raw courses stay in `window.__t7Raw`;
 * save them to the Git-ignored docs/analytics/raw/japan-terrain-tiles/ with browser_evaluate.
 */
async page => {
  // "dist": finer levels moved away (japan-local/manifest.local.json, japan-tiles z4/z5 and
  // index.local.json); "local": everything installed.
  const SET = "local";
  const SITES = ["sekigahara", "kawanakajima", "tokyo"];
  // Coast grid step in km over the window.
  const COAST_STEP_KM = 0.5;

  const result = await page.evaluate(
    async ([sites, coastStepKm]) => {
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
      const defaults = window.__fmgFieldDefaults ?? (window.__fmgFieldDefaults = structuredClone(knobs.get()));
      // distanceScale is km per map pixel.
      const kmPerPx = w.distanceScale;

      // Opens the site with one field source and waits until its levels are in and the field is stable.
      const capture = async (siteId, fieldSource) => {
        knobs.set({ ...defaults, tiles: { ...defaults.tiles, enabled: true, fieldSource } });
        const site =
          { tokyo: { lon: 139.8, lat: 35.7 } }[siteId] ?? g.JAPAN_LOCAL_TERRAIN_SITES.find(s => s.id === siteId);
        const p = g.georefLonLatToMap(w.options.earthRegion, site.lon, site.lat, w.graphWidth, w.graphHeight);
        viewMode.openCampaignViewAt(p.x + 1e-6 * Math.random(), p.y);
        let last = "";
        for (let i = 0; i < 40; i++) {
          await sleep(750);
          const field = T.getLocalTerrainField();
          const key = field ? JSON.stringify(field.stats) : "";
          if (field && key === last && !T.localTerrainLoading) break;
          last = key;
        }
        const field = T.getLocalTerrainField();
        const half = 84 / kmPerPx;
        const bounds = { minX: p.x - half, maxX: p.x + half, minY: p.y - half, maxY: p.y + half };
        const step = coastStepKm / kmPerPx;
        const water = [];
        for (let y = bounds.minY; y <= bounds.maxY; y += step)
          for (let x = bounds.minX; x <= bounds.maxX; x += step) water.push(field.waterAt(x, y) ? 1 : 0);
        return {
          stats: field.stats,
          rivers: field.rivers.filter(r => r.widths).map(r => r.points.map(([x, y]) => [x, y])),
          water,
          bounds
        };
      };

      const out = [];
      for (const siteId of sites) {
        const a = await capture(siteId, "prefectures");
        const b = await capture(siteId, "tiles");
        // Noise floor: the prefecture field again after a round trip through the tiles field.
        const again = await capture(siteId, "prefectures");
        const inside = ([x, y]) =>
          x >= a.bounds.minX && x <= a.bounds.maxX && y >= a.bounds.minY && y <= a.bounds.maxY;
        // Rivers keep their input order and point count; compare point by point inside the window.
        const compare = (left, right) => {
          const shifts = [];
          let rivers = 0;
          for (let i = 0; i < Math.min(left.length, right.length); i++) {
            const ra = left[i];
            const rb = right[i];
            if (ra.length !== rb.length) continue;
            let any = false;
            for (let k = 0; k < ra.length; k++) {
              if (!inside(ra[k])) continue;
              any = true;
              shifts.push(Math.hypot(ra[k][0] - rb[k][0], ra[k][1] - rb[k][1]) * kmPerPx);
            }
            if (any) rivers++;
          }
          shifts.sort((x, y) => x - y);
          const q = f => (shifts.length ? shifts[Math.min(shifts.length - 1, Math.floor(f * shifts.length))] : 0);
          return {
            rivers,
            points: shifts.length,
            mean: +(shifts.reduce((s, v) => s + v, 0) / Math.max(1, shifts.length)).toFixed(3),
            p50: +q(0.5).toFixed(3),
            p95: +q(0.95).toFixed(3),
            max: +q(1).toFixed(3),
            over1km: shifts.filter(v => v > 1).length
          };
        };
        // The DEM coast alone (no river painting): tri-state landAt of both samplers.
        const prefSampler = T.localTerrainSamplers.get([...T.localTerrainSamplers.keys()].find(k => k.endsWith("|levels")));
        const tileSampler = T.tileFieldSampler?.sampler;
        await prefSampler.ensureLevels(a.bounds);
        await tileSampler.ensureLevels(a.bounds);
        const land = {};
        const step = coastStepKm / kmPerPx;
        for (let y = a.bounds.minY; y <= a.bounds.maxY; y += step)
          for (let x = a.bounds.minX; x <= a.bounds.maxX; x += step) {
            const k = `${prefSampler.landAt(x, y)}|${tileSampler.landAt(x, y)}`;
            land[k] = (land[k] ?? 0) + 1;
          }
        const landCells = Object.values(land).reduce((s, v) => s + v, 0);
        const landSame = ["true|true", "false|false", "undefined|undefined"].reduce((s, k) => s + (land[k] ?? 0), 0);
        // Definite opposite answers (land vs sea); the rest differ only near the ±threshold band.
        const landOpposite = (land["true|false"] ?? 0) + (land["false|true"] ?? 0);
        let coastDiff = 0;
        let waterA = 0;
        let waterB = 0;
        for (let i = 0; i < a.water.length; i++) {
          if (a.water[i] !== b.water[i]) coastDiff++;
          waterA += a.water[i];
          waterB += b.water[i];
        }
        out.push({
          site: siteId,
          shiftKm: compare(a.rivers, b.rivers),
          shiftKmRepeat: compare(a.rivers, again.rivers),
          demCoast: {
            cells: landCells,
            differShare: +((landCells - landSame) / landCells).toFixed(4),
            opposite: landOpposite,
            table: land
          },
          // field.waterAt: DEM coast plus FMG rivers painted at their width.
          coast: {
            cells: a.water.length,
            differ: coastDiff,
            differShare: +(coastDiff / a.water.length).toFixed(4),
            waterPrefectures: waterA,
            waterTiles: waterB
          },
          statsPrefectures: a.stats,
          statsTiles: b.stats,
          raw: { prefectures: a.rivers, tiles: b.rivers, bounds: a.bounds }
        });
      }
      return out;
    },
    [SITES, COAST_STEP_KM]
  );

  // The MCP sandbox has no file access: keep the raw courses in the page and save them with
  // browser_evaluate(filename) as `() => window.__t7Raw`.
  await page.evaluate(([set, raw]) => {
    window.__t7Raw = { ...(window.__t7Raw ?? {}), [set]: raw };
  }, [SET, result.map(({ site, raw }) => ({ site, ...raw }))]);
  const summary = result.map(({ raw: _raw, ...rest }) => rest);
  return summary;
}
