/**
 * Playwright overlay for docs/plan/japan-terrain-tiles.md (T7): draws, over a hillshade of the
 * three-day window, the FMG river courses before snapping (grey), snapped on the prefecture
 * rasters (red) and snapped on the terrain tiles (blue), plus the DEM coast where the two
 * samplers disagree (yellow: prefectures land / tiles sea, magenta: the reverse). Run with the
 * Playwright MCP `browser_run_code_unsafe` (filename); images go to the Git-ignored
 * docs/analytics/raw/japan-terrain-tiles/.
 */
async page => {
  const DIR = "docs/analytics/raw/japan-terrain-tiles/";
  const ROUND = "t7";
  const SET = "local";
  const SITES = ["sekigahara", "kawanakajima", "tokyo"];
  const SIZE = 900;

  for (const siteId of SITES) {
    await page.evaluate(
      async ([id, size]) => {
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
        const site =
          { tokyo: { lon: 139.8, lat: 35.7 } }[id] ?? g.JAPAN_LOCAL_TERRAIN_SITES.find(s => s.id === id);
        const p = g.georefLonLatToMap(w.options.earthRegion, site.lon, site.lat, w.graphWidth, w.graphHeight);
        const capture = async patch => {
          knobs.set({ ...defaults, ...patch, tiles: { ...defaults.tiles, enabled: true, ...patch.tiles } });
          viewMode.openCampaignViewAt(p.x + 1e-6 * Math.random(), p.y);
          let last = "";
          for (let i = 0; i < 40; i++) {
            await sleep(750);
            const field = T.getLocalTerrainField();
            const key = field ? JSON.stringify(field.stats) : "";
            if (field && key === last && !T.localTerrainLoading) break;
            last = key;
          }
          return T.getLocalTerrainField().rivers.filter(r => r.widths).map(r => r.points);
        };
        const raw = await capture({ riverSnapKm: 0, tiles: { fieldSource: "prefectures" } });
        const pref = await capture({ tiles: { fieldSource: "prefectures" } });
        const tiles = await capture({ tiles: { fieldSource: "tiles" } });
        const prefSampler = T.localTerrainSamplers.get([...T.localTerrainSamplers.keys()].find(k => k.endsWith("|levels")));
        const tileSampler = T.tileFieldSampler.sampler;

        const half = 84 / kmPerPx;
        const b = { minX: p.x - half, maxX: p.x + half, minY: p.y - half, maxY: p.y + half };
        await prefSampler.ensureLevels(b);
        await tileSampler.ensureLevels(b);
        document.getElementById("t7-overlay")?.remove();
        const canvas = document.createElement("canvas");
        canvas.id = "t7-overlay";
        canvas.width = size;
        canvas.height = size;
        Object.assign(canvas.style, { position: "fixed", left: "0", top: "0", zIndex: 99999, background: "#000" });
        document.body.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        const sx = x => ((x - b.minX) / (b.maxX - b.minX)) * size;
        const sy = y => ((y - b.minY) / (b.maxY - b.minY)) * size;
        const image = ctx.createImageData(size, size);
        const cell = (b.maxX - b.minX) / size;
        const heights = new Float32Array(size * size);
        for (let j = 0; j < size; j++)
          for (let i = 0; i < size; i++)
            heights[j * size + i] = prefSampler.metersAt(b.minX + (i + 0.5) * cell, b.minY + (j + 0.5) * cell, 250);
        for (let j = 0; j < size; j++)
          for (let i = 0; i < size; i++) {
            const x = b.minX + (i + 0.5) * cell;
            const y = b.minY + (j + 0.5) * cell;
            const h = heights[j * size + i];
            const hx = heights[j * size + Math.min(size - 1, i + 1)] - heights[j * size + Math.max(0, i - 1)];
            const hy = heights[Math.min(size - 1, j + 1) * size + i] - heights[Math.max(0, j - 1) * size + i];
            const shade = Math.max(0.25, Math.min(1, 0.7 - (hx + hy) / ((cell * kmPerPx * 1000) * 6)));
            const a = prefSampler.landAt(x, y);
            const c = tileSampler.landAt(x, y);
            let rgb = h > 0 ? [150, 150, 140] : [40, 60, 90];
            if (a === true && c === false) rgb = [255, 220, 0];
            else if (a === false && c === true) rgb = [255, 0, 255];
            const k = (j * size + i) * 4;
            const s = a === true && c === false ? 1 : a === false && c === true ? 1 : shade;
            image.data[k] = rgb[0] * s;
            image.data[k + 1] = rgb[1] * s;
            image.data[k + 2] = rgb[2] * s;
            image.data[k + 3] = 255;
          }
        ctx.putImageData(image, 0, 0);
        const draw = (rivers, color, width) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          for (const river of rivers) {
            ctx.beginPath();
            river.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
            ctx.stroke();
          }
        };
        draw(raw, "rgba(255,255,255,0.6)", 1.5);
        draw(pref, "rgba(255,40,40,0.95)", 3);
        draw(tiles, "rgba(40,140,255,0.95)", 1.5);
        ctx.fillStyle = "#fff";
        ctx.font = "16px sans-serif";
        ctx.fillText(`${id}: white = FMG unsnapped, red = prefectures, blue = tiles (168 km)`, 10, 22);
      },
      [siteId, SIZE]
    );
    await page.locator("#t7-overlay").screenshot({ path: `${DIR}${ROUND}-${SET}-${siteId}-overlay.png` });
  }
  await page.evaluate(() => document.getElementById("t7-overlay")?.remove());
  return "ok";
}
