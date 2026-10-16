#!/usr/bin/env node
// Generates fresh maps headlessly and audits route/burg integrity.
// Usage: node scripts/auditRouteIntegrity.mjs [--seed 1,2,3] [--years 2] [--url http://127.0.0.1:5173/Fantasy-Map-Generator/] [--details]
// --years also advances simulated time, covering yearly port development.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = (
  flag("--seed") ?? "100000001,200000002,300000003,400000004,500000005"
).split(",");
const details = args.includes("--details");
const years = Number(flag("--years") ?? 0);

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

async function startServer() {
  const port = await freePort();
  const child = spawn(
    join(root, "node_modules/.bin/vite"),
    ["--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  const url = `http://127.0.0.1:${port}/Fantasy-Map-Generator/`;
  for (let i = 0; i < 480; i++) {
    try {
      if ((await fetch(url)).ok)
        return { url, stop: () => child.kill("SIGTERM") };
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill("SIGKILL");
  throw new Error("vite did not start");
}

function audit() {
  const { pack, distanceScale } = window.fmg.world;
  const { cells, burgs, routes } = pack;
  const km = (d) => Math.round(d * distanceScale * 10) / 10;
  const live = burgs.filter((b) => b?.i && !b.removed);
  const land = routes.filter((r) => r.group !== "searoutes");
  const sea = routes.filter((r) => r.group === "searoutes");
  const count = (list) => {
    const m = new Map();
    for (const r of list)
      for (const c of new Set(r.cells ?? r.points.map((p) => p[2])))
        m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  };
  const landCells = count(land);
  const seaCells = count(sea);
  const out = {
    burgs: live.length,
    pattern: window.fmg.world.options.initialSettlementPattern,
    ports: live.filter((b) => b.port).length,
    landRoutes: land.length,
    seaRoutes: sea.length,
    landDeadEnd: [],
    landEndOffBurg: [],
    junctionGap: [],
    portNoLane: [],
    seaDangling: [],
    riverLaneOverLand: [],
    placementMismatch: [],
  };
  const cellsOf = (r) => r.cells ?? r.points.map((p) => p[2]);
  for (const r of land) {
    const cs = cellsOf(r);
    for (const [c, pt] of [
      [cs[0], r.points[0]],
      [cs.at(-1), r.points.at(-1)],
    ]) {
      const b = burgs[cells.burg[c]];
      if (!cells.burg[c] && landCells.get(c) === 1)
        out.landDeadEnd.push({ route: r.i, group: r.group, cell: c });
      if (b && pt && Math.hypot(pt[0] - b.x, pt[1] - b.y) > 0.5) {
        // Another point of the route (or another route) may still reach the burg.
        const reached = land.some((o) =>
          o.points.some((p) => Math.hypot(p[0] - b.x, p[1] - b.y) < 0.05),
        );
        if (!reached)
          out.landEndOffBurg.push({
            route: r.i,
            burg: b.name,
            km: km(Math.hypot(pt[0] - b.x, pt[1] - b.y)),
          });
      }
    }
  }
  // A route ending in a non-town cell must meet a point of another route there (no gap at the junction).
  const pointsByCell = new Map();
  for (const r of land)
    for (const q of r.points) {
      if (!pointsByCell.has(q[2])) pointsByCell.set(q[2], []);
      pointsByCell.get(q[2]).push([r, q]);
    }
  for (const r of land)
    for (const e of [r.points[0], r.points.at(-1)]) {
      const b = burgs[cells.burg[e[2]]];
      if (b && Math.hypot(e[0] - b.x, e[1] - b.y) < 1e-3) continue;
      const others = (pointsByCell.get(e[2]) ?? []).filter(([o]) => o !== r);
      if (!others.length) continue; // reported as landDeadEnd
      const d = Math.min(...others.map(([, q]) => Math.hypot(q[0] - e[0], q[1] - e[1])));
      if (d > 0.05) out.junctionGap.push({ route: r.i, cell: e[2], km: km(d) });
    }
  for (const b of live) {
    if (b.port && !seaCells.has(b.cell) && out.pattern !== "frontier") {
      const haven = cells.haven[b.cell];
      const statePartners = live.filter(
        o => o !== b && o.port === b.port && o.state === b.state && cells.haven[o.cell]
      ).length;
      const river = pack.rivers.find(rv => rv.i === cells.r[b.cell]);
      const downstreamPorts = river
        ? river.cells.slice(river.cells.indexOf(b.cell) + 1).filter(c => c >= 0 && burgs[cells.burg[c]]?.port).length
        : null;
      // By design (kept as-is): land-origin frontier maps have no shipping; without international
      // lanes a State's only coastal port has no partner; an inland river port needs a port downstream.
      const lonelyCoastal = haven && out.pattern !== "standard" && statePartners === 0;
      const lonelyInland = !haven && downstreamPorts === 0;
      if (!lonelyCoastal && !lonelyInland)
        out.portNoLane.push({ burg: b.name, river: cells.r[b.cell], haven, statePartners, downstreamPorts });
    }
    const fp = b.riverPlacement?.footprintMeters;
    if (fp) {
      const mpu = distanceScale * 1000;
      const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length / mpu;
      const cy = fp.reduce((s, p) => s + p[1], 0) / fp.length / mpu;
      const d = Math.hypot(cx - b.x, cy - b.y);
      if (d > 0.5) out.placementMismatch.push({ burg: b.name, km: km(d) });
    }
  }
  for (const r of sea) {
    const cs = cellsOf(r);
    for (const c of [cs[0], cs.at(-1)]) {
      const b = burgs[cells.burg[c]];
      if (!(b && b.port) && seaCells.get(c) === 1)
        out.seaDangling.push({ route: r.i, cell: c });
    }
    if (r.navigation === "river") {
      // The town-to-river hop at each end; long hops are drawn over land.
      for (const [a, b] of [
        [r.points[0], r.points[1]],
        [r.points.at(-1), r.points.at(-2)],
      ]) {
        const d = b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
        if (km(d) > 5) {
          const burg = burgs[cells.burg[a[2]]];
          out.riverLaneOverLand.push({
            route: r.i,
            km: km(d),
            burg: burg?.name,
            cell: a[2],
            hopCell: b[2],
            river: cells.r[a[2]],
            site: burg?.riverSiteStatus?.status,
            physical: burg?.riverPlacement?.physicalCellId,
            coast: burg?.riverPlacement?.coastConstrained,
          });
        }
      }
    }
  }
  return out;
}

const server = flag("--url")
  ? { url: flag("--url"), stop() {} }
  : await startServer();
const browser = await chromium.launch();
try {
  for (const seed of seeds) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    await page.addInitScript(() =>
      localStorage.setItem(
        "debug",
        JSON.stringify({ generationProfile: true }),
      ),
    );
    const url = new URL(server.url);
    url.searchParams.set("seed", seed);
    await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page.waitForFunction(
      () => {
        const p = window.fmg?.actions?.getGenerationProfile?.();
        const btn = [...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Generate entire map",
        );
        if (p && "review-waiting" in p.marks && btn && !btn.disabled)
          btn.click();
        return p && "map-ready" in p.marks;
      },
      null,
      { timeout: 300000, polling: 50 },
    );
    // Map-ready tasks (dual-port repair) run after the profile closes.
    await page.waitForTimeout(8000);
    if (years > 0) await page.evaluate(y => window.fmg.actions.advanceTime(y), years);
    const r = await page.evaluate(audit);
    const summary = Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]),
    );
    console.log(seed, JSON.stringify(summary));
    if (details)
      for (const [k, v] of Object.entries(r))
        if (Array.isArray(v) && v.length)
          console.log("  ", k, JSON.stringify(v.slice(0, 15)));
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
