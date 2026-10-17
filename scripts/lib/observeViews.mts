/**
 * Read-only observation views for the Approach Traffic Observatory
 * (docs/plan/approach-traffic-observatory.md §5–§6). Shared by the channel worker and `npm run sim`
 * so both produce the same sample from the same world. Nothing here writes to the world.
 */
import type { WorldContext } from "../../src/context/worldContext";
import { isEconomyContextReady } from "../../src/extensions/economy/context/economyApi";
import {
  getApproachLedgerDecays,
  getApproachTraffic,
  getCaravans,
  getMarkets,
  getMarketShipments,
  getTradeCorridors
} from "../../src/extensions/economy/context/trade";
import { delayRatio, liveCorridorNeeds } from "../../src/extensions/economy/generators/tradeCorridorLedger";
import type { Burg, Route } from "../../src/types/models";

export const SAMPLE_VERSION = 1;
export const SAMPLE_DETAILS = ["burgs", "routes", "approaches", "corridors", "markets"] as const;
export type SampleDetail = (typeof SAMPLE_DETAILS)[number];

export interface ObserveClock {
  year: number;
  month: number;
  day: number;
  tick: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const PAVED = new Set(["roads", "railways"]);

function routeLength(route: Route): number {
  let length = 0;
  for (let i = 1; i < route.points.length; i++)
    length += Math.hypot(route.points[i][0] - route.points[i - 1][0], route.points[i][1] - route.points[i - 1][1]);
  return length;
}

export function parseDetails(value: string | null | undefined): SampleDetail[] {
  if (!value) return [...SAMPLE_DETAILS];
  const wanted = value.split(",").filter(Boolean);
  const unknown = wanted.filter(name => !(SAMPLE_DETAILS as readonly string[]).includes(name));
  if (unknown.length)
    throw Object.assign(new Error(`Unknown detail '${unknown.join(",")}' (${SAMPLE_DETAILS.join(", ")})`), { status: 400 });
  return wanted as SampleDetail[];
}

export function createObserveViews(getWorld: () => WorldContext, clock: () => ObserveClock) {
  const economy = () => isEconomyContextReady();
  const liveBurgs = () => getWorld().pack.burgs.filter((b): b is Burg => Boolean(b?.i) && !b.removed);
  const liveRoutes = () => getWorld().pack.routes.filter(route => route && !route.merged && route.points?.length);

  function burgs() {
    return liveBurgs().map(b => ({
      id: b.i,
      pop: r3(b.population ?? 0),
      market: b.market ?? null,
      port: Boolean(b.port),
      walls: Boolean(b.walls),
      capital: Boolean(b.capital),
      state: b.state ?? 0
    }));
  }

  function routes() {
    const corridorsByRoute = new Map<number, number>();
    if (economy())
      for (const corridor of getTradeCorridors())
        for (const id of corridor.routeIds) corridorsByRoute.set(id, (corridorsByRoute.get(id) ?? 0) + 1);
    return liveRoutes().map(route => ({
      id: route.i,
      group: route.group,
      traffic: r3(route.traffic ?? 0),
      pavedShare: PAVED.has(route.group) ? 1 : 0,
      length: r3(routeLength(route)),
      corridors: corridorsByRoute.get(route.i) ?? 0
    }));
  }

  function approaches(burgId?: number) {
    if (!economy()) return [];
    return getApproachTraffic().filter(row => burgId === undefined || row.burgId === burgId);
  }

  /** Bearing (0 = north, clockwise) of an approach from its burg; null for sea and river. */
  function azimuthOf(approachId: string, burgId: number): number | null {
    const { pack } = getWorld();
    const burg = pack.burgs[burgId];
    const edge = /:edge:(\d+)$/.exec(approachId);
    if (edge && burg) {
      const p = pack.cells.p[Number(edge[1])];
      if (p) return Math.round(((Math.atan2(p[0] - burg.x, burg.y - p[1]) * 180) / Math.PI + 360) % 360);
    }
    const open = /:open:([nsew]+)$/.exec(approachId);
    if (open) return ["n", "ne", "e", "se", "s", "sw", "w", "nw"].indexOf(open[1]) * 45;
    return null;
  }

  /** Compact per-approach row of the sample (§6). */
  function approachSample() {
    return approaches().map(row => ({
      id: row.approachId,
      burg: row.burgId,
      route: row.routeId,
      mode: row.mode,
      azimuth: azimuthOf(row.approachId, row.burgId),
      in: row.inbound.cargoSlots,
      out: row.outbound.cargoSlots,
      through: row.through.departures,
      departures: r3(row.inbound.departures + row.outbound.departures),
      slots: r3(row.inbound.cargoSlots + row.outbound.cargoSlots),
      value: r3(row.inbound.value + row.outbound.value),
      goods: row.goodsSlots,
      partners: row.partners
    }));
  }

  function corridorSample() {
    if (!economy()) return [];
    return getTradeCorridors().map(c => ({
      a: c.burgA,
      b: c.burgB,
      departures: c.departures,
      slots: c.cargoSlots,
      value: c.value,
      mode: c.byMode,
      delay: r3(delayRatio(c)),
      threat: c.threat,
      routes: c.routeIds
    }));
  }

  function corridors(top?: number) {
    const rows = corridorSample().sort((x, y) => y.slots - x.slots);
    return { corridors: top ? rows.slice(0, top) : rows, needs: economy() ? liveCorridorNeeds() : [] };
  }

  function markets() {
    if (!economy()) return [];
    const members = new Map<number, number>();
    for (const b of liveBurgs()) if (b.market) members.set(b.market, (members.get(b.market) ?? 0) + 1);
    return getMarkets().map(m => ({ id: m.i, center: m.centerBurgId, burgs: members.get(m.i) ?? 0 }));
  }

  function world() {
    const { pack } = getWorld();
    const urban = liveBurgs().reduce((sum, b) => sum + (b.population ?? 0), 0);
    let rural = 0;
    for (const value of pack.cells.pop ?? []) rural += value;
    const treasury = pack.states.reduce((sum, s) => sum + (s?.i && !s.removed ? (s.treasury ?? 0) : 0), 0);
    return {
      population: r3(urban + rural),
      urbanPopulation: r3(urban),
      burgs: liveBurgs().length,
      routes: liveRoutes().length,
      treasury: r3(treasury),
      caravansActive: economy() ? getCaravans().length : 0,
      shipmentsInFlight: economy() ? getMarketShipments().length : 0
    };
  }

  function sample(details: readonly SampleDetail[] = SAMPLE_DETAILS, meta: Record<string, unknown> = {}) {
    const { year, month, day, tick } = clock();
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // `decays` counts the yearly ledger decays, so Δ = now − before × 0.7^(decays − decays before).
    const ledger = { decays: economy() ? getApproachLedgerDecays() : 0 };
    const out: Record<string, unknown> = { v: SAMPLE_VERSION, ...meta, date, tick, ledger, world: world() };
    if (details.includes("burgs")) out.burgs = burgs();
    if (details.includes("routes")) out.routes = routes();
    if (details.includes("approaches")) out.approaches = approachSample();
    if (details.includes("corridors")) out.corridors = corridorSample();
    if (details.includes("markets")) out.markets = markets();
    return out;
  }

  /** Map facts that change only with the route network (§6 static.json). */
  function staticInfo() {
    const { pack, seed } = getWorld();
    return {
      v: SAMPLE_VERSION,
      seed,
      cells: pack.cells.i.length,
      burgs: liveBurgs().map(b => ({ id: b.i, name: b.name, x: b.x, y: b.y, cell: b.cell, state: b.state ?? 0 })),
      routes: liveRoutes().map(route => ({ id: route.i, group: route.group, cells: route.cells ?? route.points.map(p => p[2]) }))
    };
  }

  /** Changes when Public Works promotes or merges a route (§10: approach ids follow route ids). */
  function networkKey(): string {
    return liveRoutes()
      .map(route => `${route.i}:${route.group}`)
      .join(",");
  }

  return { sample, routes, approaches, corridors, markets, staticInfo, networkKey };
}

export interface SampledAdvanceHost {
  advance(duration: { years?: number; months?: number; days?: number }): void;
}

/**
 * Advances in strides of `everyMonths`, waiting out Economy's post-advance settlement after each,
 * and calls `onStride` at every stride end. Years and months are walked as whole months; days are
 * a final stride.
 */
export async function advanceSampled(
  host: SampledAdvanceHost,
  duration: { years?: number; months?: number; days?: number },
  everyMonths: number,
  onStride: () => void | Promise<void>
): Promise<number> {
  if (!Number.isSafeInteger(everyMonths) || everyMonths < 1)
    throw Object.assign(new Error("sampleEvery.months must be a positive integer"), { status: 400 });
  let months = (duration.years ?? 0) * 12 + (duration.months ?? 0);
  let strides = 0;
  while (months > 0) {
    const step = Math.min(everyMonths, months);
    host.advance({ months: step });
    await new Promise(done => setImmediate(done));
    months -= step;
    strides++;
    await onStride();
  }
  if (duration.days) {
    host.advance({ days: duration.days });
    await new Promise(done => setImmediate(done));
    strides++;
    await onStride();
  }
  return strides;
}
