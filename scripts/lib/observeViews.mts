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
  getGoods,
  getMarketShipments,
  getTradeCorridors
} from "../../src/extensions/economy/context/trade";
import { getGuildChapters, getGuildKnowledgeStocks } from "../../src/extensions/economy/context/knowledge";
import { getBurgMarketLedgers } from "../../src/extensions/economy/context/trade";
import { getGoodCargoSlotsPerUnit } from "../../src/extensions/economy/generators/tradeCargo";
import { getCharacters } from "../../src/extensions/characters/charactersContext";
import { inferRoleClass } from "../../src/extensions/characters/backstoryProfile";
import { delayRatio, liveCorridorNeeds } from "../../src/extensions/economy/generators/tradeCorridorLedger";
import type { Burg, Route } from "../../src/types/models";

export const SAMPLE_VERSION = 1;
export const SAMPLE_DETAILS = ["burgs", "routes", "approaches", "corridors", "markets", "wealth"] as const;
export type SampleDetail = (typeof SAMPLE_DETAILS)[number];

/**
 * Cargo classes for gate profiles (docs/plan/approach-commerce-quarters.md §4): what a gate's
 * traffic asks of the street behind it. First matching tag wins, in this order.
 */
export const CARGO_CLASSES = [
  { id: "livestock", tags: ["liveAnimal", "draft"] },
  { id: "perishable", tags: ["freshFood", "fruit", "aquatic"] },
  { id: "grain", tags: ["cereal", "stapleCrop", "legume", "tuber", "stapleFood"] },
  { id: "bulk", tags: ["construction", "mineral", "ore", "fuel", "ingot", "alloy", "metal"] },
  { id: "luxury", tags: ["luxury", "art", "gift", "ritual"] },
  { id: "manufactured", tags: ["clothing", "tools", "industrial", "military", "naval", "chemical"] },
  { id: "provisions", tags: ["food", "preservedFood", "beverage", "preservative", "crop", "perennialCrop"] }
] as const;
export type CargoClass = (typeof CARGO_CLASSES)[number]["id"] | "other";

export function cargoClassOf(tags: readonly string[] | undefined): CargoClass {
  for (const entry of CARGO_CLASSES) if (tags?.some(tag => (entry.tags as readonly string[]).includes(tag))) return entry.id;
  return "other";
}

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
    if (details.includes("wealth")) out.wealth = wealth();
    return out;
  }

  function goods() {
    if (!economy()) return [];
    return getGoods().map(good => ({
      id: good.i,
      name: good.name,
      tags: good.tags ?? [],
      value: good.value,
      unit: good.unit,
      slotsPerUnit: r3(getGoodCargoSlotsPerUnit(good)),
      cargoClass: cargoClassOf(good.tags)
    }));
  }

  /**
   * One row per gate with its share of the town's traffic, the direction of flow and the cargo
   * classes it carries (docs/plan/approach-commerce-quarters.md §4). Values are the ledger's
   * decayed stocks: a recent-years picture, not a single month.
   */
  function gates(burgId?: number) {
    const classOf = new Map(goods().map(good => [String(good.id), good.cargoClass]));
    const rows = approaches(burgId);
    const byBurg = new Map<number, typeof rows>();
    for (const row of rows) byBurg.set(row.burgId, [...(byBurg.get(row.burgId) ?? []), row]);
    const burgs = getWorld().pack.burgs;
    return [...byBurg].map(([id, list]) => {
      const load = (row: (typeof rows)[number]) => row.inbound.cargoSlots + row.outbound.cargoSlots + row.through.cargoSlots;
      const total = list.reduce((sum, row) => sum + load(row), 0);
      return {
        burg: id,
        name: burgs[id]?.name ?? "",
        population: r3(burgs[id]?.population ?? 0),
        totalSlots: r3(total),
        gates: list
          .map(row => {
            const classes: Record<string, number> = {};
            for (const [good, slots] of Object.entries(row.goodsSlots)) {
              const key = classOf.get(good) ?? "other";
              classes[key] = r3((classes[key] ?? 0) + slots);
            }
            const valueClasses: Record<string, number> = {};
            for (const [good, value] of Object.entries(row.goodsValue ?? {})) {
              const key = classOf.get(good) ?? "other";
              valueClasses[key] = r3((valueClasses[key] ?? 0) + value);
            }
            const ends = row.inbound.cargoSlots + row.outbound.cargoSlots;
            return {
              id: row.approachId,
              mode: row.mode,
              azimuth: azimuthOf(row.approachId, id),
              share: total > 0 ? r3(load(row) / total) : 0,
              inbound: row.inbound.cargoSlots,
              outbound: row.outbound.cargoSlots,
              through: row.through.cargoSlots,
              throughShare: load(row) > 0 ? r3(row.through.cargoSlots / load(row)) : 0,
              inboundShare: ends > 0 ? r3(row.inbound.cargoSlots / ends) : 0,
              departures: r3(row.inbound.departures + row.outbound.departures + row.through.departures),
              meanLoad: row.inbound.departures + row.outbound.departures > 0 ? r3(ends / (row.inbound.departures + row.outbound.departures)) : 0,
              cargoClasses: classes,
              cargoValue: valueClasses,
              partners: Object.keys(row.partners).length
            };
          })
          .sort((a, b) => b.share - a.share)
      };
    });
  }

  /**
   * Every money stock, by holder (docs/plan/initial-wealth-calibration.md): what each kind of
   * holder has, against its population, so start-up endowments can be set from where the
   * economy settles. Read-only.
   */
  function wealth() {
    const { pack } = getWorld();
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    const states = pack.states
      .filter(st => st?.i && !st.removed)
      .map(st => ({
        id: st.i,
        pop: r3((st.urban ?? 0) + (st.rural ?? 0)),
        treasury: r3(st.treasury ?? 0),
        purse: r3(st.householdPurse ?? 0),
        departments: r3(sum(Object.values(st.departmentBalances ?? {}).map(Number).filter(Number.isFinite)))
      }));
    const ledgers = economy() ? new Map(getBurgMarketLedgers().map(l => [l.burgId, l])) : new Map();
    const guilds = new Map<number, number>();
    if (economy()) {
      for (const stock of getGuildKnowledgeStocks()) guilds.set(stock.burgId, (guilds.get(stock.burgId) ?? 0) + (stock.treasury ?? 0));
      for (const chapter of getGuildChapters() as { burgId?: number; treasury?: number }[])
        if (chapter.burgId) guilds.set(chapter.burgId, (guilds.get(chapter.burgId) ?? 0) + (chapter.treasury ?? 0));
    }
    const burgs = liveBurgs().map(b => ({
      id: b.i,
      pop: r3(b.population ?? 0),
      treasury: r3(b.treasury ?? 0),
      households: r3(ledgers.get(b.i)?.householdWealth ?? 0),
      guilds: r3(guilds.get(b.i!) ?? 0),
      foodSecurity: r3(b.foodSecurity ?? 1)
    }));
    const markets = economy()
      ? getMarkets().map(m => ({
          id: m.i,
          balance: r3(m.marketTreasury?.balance ?? 0),
          payable: r3(m.marketTreasury?.ruralGrainPayable ?? 0),
          tradeCapital: r3((m.marketTreasury?.tradeWorkingCapital ?? 0) + (m.marketTreasury?.tradeCapitalLocked ?? 0)),
          ruralHouseholds: r3(m.foodLedger?.ruralHouseholdWealth ?? 0),
          urbanFoodStressQuarters: m.foodLedger?.urbanFoodStressQuarters ?? 0,
          food: m.foodLedger
            ? {
                produced: r3(m.foodLedger.foodProduced),
                ruralNeed: r3(m.foodLedger.ruralNeed),
                urbanNeed: r3(m.foodLedger.urbanNeed),
                stock: r3(
                  m.foodLedger.foodStockAge0 +
                    m.foodLedger.foodStockAge1 +
                    m.foodLedger.foodStockAge2 +
                    (m.foodLedger.foodStockAge3 ?? 0)
                ),
                carryover: r3(m.foodLedger.foodStockAge3 ?? 0),
                spoiled: r3(m.foodLedger.storageSpoiled ?? 0),
                exportReserve: r3(m.foodLedger.exportReserve ?? 0),
                unsold: r3(m.foodLedger.unsoldHarvest ?? 0),
                overflow: r3(m.foodLedger.storageOverflow),
                importNeed: r3(m.foodLedger.importNeed),
                imported: r3(m.foodLedger.satisfiedImport),
                targetStock: r3(m.foodLedger.targetStock)
              }
            : null,
          grainPrice: r3(m.goods[getGoods().find(g => g.tags?.includes("stapleFood"))?.i ?? -1]?.price ?? 0)
        }))
      : [];
    const byClass: Record<string, number[]> = {};
    for (const character of getCharacters()) {
      if ((character as { dead?: boolean; deathYear?: number }).dead || (character as { deathYear?: number }).deathYear) continue;
      (byClass[inferRoleClass(character)] ??= []).push(character.wealth ?? 0);
    }
    const characters = Object.fromEntries(
      Object.entries(byClass).map(([role, values]) => {
        const sorted = values.slice().sort((a, b) => a - b);
        const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
        return [role, { count: sorted.length, total: r3(sum(sorted)), median: r3(at(0.5)), p90: r3(at(0.9)), zero: sorted.filter(v => v <= 0).length }];
      })
    );
    const ruralPop = (pack.cells.pop ? Array.from(pack.cells.pop as ArrayLike<number>) : []).reduce((a, b) => a + b, 0);
    const urbanPop = sum(burgs.map(b => b.pop));
    return {
      totals: {
        urbanPop: r3(urbanPop),
        ruralPop: r3(ruralPop),
        stateTreasury: r3(sum(states.map(st => st.treasury))),
        statePurse: r3(sum(states.map(st => st.purse))),
        stateDepartments: r3(sum(states.map(st => st.departments))),
        burgTreasury: r3(sum(burgs.map(b => b.treasury))),
        urbanHouseholds: r3(sum(burgs.map(b => b.households))),
        guilds: r3(sum(burgs.map(b => b.guilds))),
        marketBalance: r3(sum(markets.map(m => m.balance))),
        marketPayable: r3(sum(markets.map(m => m.payable))),
        tradeCapital: r3(sum(markets.map(m => m.tradeCapital))),
        ruralHouseholds: r3(sum(markets.map(m => m.ruralHouseholds))),
        characters: r3(sum(Object.values(characters).map(c => c.total)))
      },
      characters,
      states,
      burgs,
      markets
    };
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

  return { sample, routes, approaches, corridors, markets, goods, gates, wealth, staticInfo, networkKey };
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

/** Holder types the money-flow recorder tracks; same stocks as `wealth().totals`. */
export const MONEY_HOLDERS = [
  "stateTreasury",
  "statePurse",
  "stateDepartments",
  "burgTreasury",
  "guilds",
  "urbanHouseholds",
  "ruralHouseholds",
  "marketBalance",
  "marketPayable",
  "tradeCapital",
  "characters"
] as const;
export type MoneyHolder = (typeof MONEY_HOLDERS)[number];
type MoneyTotals = Record<MoneyHolder, number>;

function moneyTotals(world: WorldContext): MoneyTotals {
  const totals = Object.fromEntries(MONEY_HOLDERS.map(h => [h, 0])) as MoneyTotals;
  for (const st of world.pack.states) {
    if (!st?.i || st.removed) continue;
    totals.stateTreasury += st.treasury ?? 0;
    totals.statePurse += st.householdPurse ?? 0;
    for (const value of Object.values(st.departmentBalances ?? {})) if (Number.isFinite(value)) totals.stateDepartments += Number(value);
  }
  for (const b of world.pack.burgs) if (b?.i && !b.removed) totals.burgTreasury += b.treasury ?? 0;
  if (isEconomyContextReady()) {
    for (const l of getBurgMarketLedgers()) totals.urbanHouseholds += l.householdWealth ?? 0;
    for (const g of getGuildKnowledgeStocks()) totals.guilds += g.treasury ?? 0;
    for (const c of getGuildChapters() as { treasury?: number }[]) totals.guilds += c.treasury ?? 0;
    for (const m of getMarkets()) {
      totals.marketBalance += m.marketTreasury?.balance ?? 0;
      totals.marketPayable += m.marketTreasury?.ruralGrainPayable ?? 0;
      totals.tradeCapital += (m.marketTreasury?.tradeWorkingCapital ?? 0) + (m.marketTreasury?.tradeCapitalLocked ?? 0);
      totals.ruralHouseholds += m.foodLedger?.ruralHouseholdWealth ?? 0;
    }
  }
  for (const ch of getCharacters()) totals.characters += ch.wealth ?? 0;
  return totals;
}

/**
 * Attributes every change in the money stocks to the innermost tick step running when it happened
 * (docs/plan/initial-wealth-calibration.md §5.1). Install it with `setTickStepObserver`; it only
 * reads the world. Changes made outside any measured step land under "(other)".
 */
export function createMoneyFlowRecorder(getWorld: () => WorldContext) {
  let last = moneyTotals(getWorld());
  const stack: string[] = [];
  let flows = new Map<string, MoneyTotals>();
  const attribute = (label: string) => {
    const now = moneyTotals(getWorld());
    let row = flows.get(label);
    for (const holder of MONEY_HOLDERS) {
      const delta = now[holder] - last[holder];
      if (Math.abs(delta) < 1e-9) continue;
      row ??= Object.fromEntries(MONEY_HOLDERS.map(h => [h, 0])) as MoneyTotals;
      row[holder] += delta;
    }
    if (row) flows.set(label, row);
    last = now;
  };
  return {
    observer: {
      enter(label: string) {
        attribute(stack.at(-1) ?? "(other)");
        stack.push(label);
      },
      exit(label: string) {
        attribute(label);
        stack.pop();
      }
    },
    /** The flows since the previous flush, per step and holder; `net` is money created (+) or destroyed (−). */
    flush() {
      attribute(stack.at(-1) ?? "(other)");
      const out = [...flows].map(([step, row]) => ({
        step,
        net: r3(MONEY_HOLDERS.reduce((sum, h) => sum + row[h], 0)),
        ...Object.fromEntries(MONEY_HOLDERS.filter(h => Math.abs(row[h]) >= 0.0005).map(h => [h, r3(row[h])]))
      }));
      flows = new Map();
      return out;
    },
    totals: () => moneyTotals(getWorld())
  };
}
