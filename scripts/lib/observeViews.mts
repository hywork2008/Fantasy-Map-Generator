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
  getExportStagingLots,
  getMarketById,
  getMarkets,
  getGoods,
  getMarketShipments,
  getTradeCorridors
} from "../../src/extensions/economy/context/trade";
import { getGuildChapters, getGuildKnowledgeStocks } from "../../src/extensions/economy/context/knowledge";
import { getMintLedgers } from "../../src/extensions/economy/context/fiscal";
import { getStateMoneyStocks } from "../../src/extensions/economy/generators/stateMoneySupply";
import { getBurgMarketLedgers } from "../../src/extensions/economy/context/trade";
import { getGoodCargoSlotsPerUnit } from "../../src/extensions/economy/generators/tradeCargo";
import { getCharacters } from "../../src/extensions/characters/charactersContext";
import { inferRoleClass } from "../../src/extensions/characters/backstoryProfile";
import { delayRatio, liveCorridorNeeds } from "../../src/extensions/economy/generators/tradeCorridorLedger";
import {
  type LotDispatchEvent,
  type LotDispatchOutcome,
  setLotDispatchObserver,
  setTradeStageObserver,
  type TradeStageEvent
} from "../../src/extensions/economy/generators/tradeStageObserver";
import { TradeLogisticsSettings } from "../../src/extensions/economy/generators/tradeLogisticsSettings";
import { setGoodFlowObserver, type GoodFlowRecord } from "../../src/extensions/economy/generators/goodsBalanceLedger";
import { DEMAND_TARGET_FACTORS } from "../../src/extensions/economy/generators/goods-generator";
import { townStanding } from "../../src/extensions/economy/generators/luxuryDemand";
import { characterLuxuryBudget } from "../../src/extensions/economy/generators/characterLuxuryPurchases";
import {
  computeLivingCost,
  resolveLifestyleTier,
  SURPLUS_WEALTH_SPEND_SHARE,
  WEALTH_RESERVE_YEARS
} from "../../src/extensions/economy/generators/characterLivingCosts";
import { isLuxuryDemandGood, LUXURY_TIERS, luxuryCoverageOf, luxuryTierOf } from "../../src/extensions/economy/generators/luxuryTiers";
import { housesPresentIn, merchantIntelligenceSummary } from "../../src/extensions/economy/generators/merchantIntelligence";
import { getTradeCapitalMoney, takeTradeSettlementStats } from "../../src/extensions/economy/generators/merchantTradeCapital";
import type { Good } from "../../src/extensions/economy/generators/goodsGeneratorTypes";
import type { Burg, Route } from "../../src/types/models";

export const SAMPLE_VERSION = 1;
export const SAMPLE_DETAILS = ["burgs", "routes", "approaches", "corridors", "markets", "wealth", "luxury", "trade"] as const;
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
    const { pack } = getWorld();
    return getMarkets().map(m => {
      const center = pack.burgs[m.centerBurgId];
      return {
        id: m.i,
        center: m.centerBurgId,
        burgs: members.get(m.i) ?? 0,
        centerPop: r3(center?.population ?? 0),
        state: center?.state ?? 0,
        capital: Boolean(center?.capital)
      };
    });
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
    if (details.includes("luxury")) out.luxury = luxury();
    if (details.includes("trade")) out.trade = trade();
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
    // Money supply per State (docs/plan/money-supply-mint.md §7.1): real money where it is held,
    // the mint's issue and the price level.
    const moneyStocks = economy() ? getStateMoneyStocks() : new Map();
    const mints = economy() ? new Map(getMintLedgers().map(l => [l.stateId, l])) : new Map();
    const states = pack.states
      .filter(st => st?.i && !st.removed)
      .map(st => {
        const stock = moneyStocks.get(st.i);
        const mint = mints.get(st.i);
        return {
          id: st.i,
          pop: r3((st.urban ?? 0) + (st.rural ?? 0)),
          livePop: r3(stock?.population ?? 0),
          treasury: r3(st.treasury ?? 0),
          purse: r3(st.householdPurse ?? 0),
          departments: r3(sum(Object.values(st.departmentBalances ?? {}).map(Number).filter(Number.isFinite))),
          money: r3(stock?.money ?? 0),
          currencyDemand: r3(mint?.currencyDemand ?? 0),
          circulation: r3(mint?.circulation ?? 0),
          minted: r3(mint?.lastMintedValue ?? 0),
          totalMinted: r3(mint?.totalMintedValue ?? 0),
          wear: r3(mint?.lastWear ?? 0),
          priceLevel: r3(mint?.priceLevel ?? 1)
        };
      });
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

  // Luxury flows (docs/plan/luxury-value-demand.md §7) accumulate between luxury() calls through a
  // read-only tap on the goods ledger, so they are measured whether or not a balance interval is open.
  const luxuryTags = new Set<string>(CARGO_CLASSES.find(entry => entry.id === "luxury")!.tags);
  let luxuryCatalogue: readonly Good[] | null = null;
  let luxuryGoods = new Map<number, Good>();
  const trackedLuxuryGoods = () => {
    const catalogue = getGoods();
    if (catalogue !== luxuryCatalogue) {
      luxuryCatalogue = catalogue;
      luxuryGoods = new Map(
        catalogue.filter(g => isLuxuryDemandGood(g) || g.tags?.some(tag => luxuryTags.has(tag))).map(g => [g.i, g])
      );
    }
    return luxuryGoods;
  };
  type LuxuryFlow = { units: number; value: number };
  // Unit-count demand books town luxuries as burgDemand; the value demand as luxuryPurchase.
  const TOWN_LUXURY_PURCHASES = new Set(["sink:burgDemand", "sink:luxuryPurchase"]);
  let luxuryFlows = new Map<number, Map<string, LuxuryFlow>>();
  let luxuryBuyers = new Set<number>();
  let luxuryCovered = 0;
  let luxuryByStanding = new Map<string, number>();
  let luxurySince: ObserveClock | null = null;
  setGoodFlowObserver((flow: GoodFlowRecord) => {
    const good = trackedLuxuryGoods().get(flow.goodId);
    if (!good) return;
    const price = (flow.marketId !== undefined ? getMarketById(flow.marketId)?.goods[flow.goodId]?.price : undefined) ?? good.value;
    const byKey = luxuryFlows.get(flow.goodId) ?? new Map<string, LuxuryFlow>();
    luxuryFlows.set(flow.goodId, byKey);
    const key = `${flow.direction}:${flow.category}`;
    const row = byKey.get(key) ?? { units: 0, value: 0 };
    row.units += flow.units;
    row.value += flow.units * price;
    byKey.set(key, row);
    if (TOWN_LUXURY_PURCHASES.has(key) && isLuxuryDemandGood(good)) {
      luxuryCovered += flow.units * luxuryCoverageOf(good);
      if (flow.burgId) luxuryBuyers.add(flow.burgId);
      const burg = flow.burgId ? getWorld().pack.burgs[flow.burgId] : undefined;
      if (burg) {
        const standingKey = `${townStanding(burg)}:${luxuryTierOf(good)}`;
        luxuryByStanding.set(standingKey, (luxuryByStanding.get(standingKey) ?? 0) + flow.units * price);
      }
    }
  });

  /**
   * Luxury goods since the previous call: town purchases against the consumer target, spend by
   * price tier, every recorded flow, and per good its stock, price level and the market pairs a
   * merchant house could trade on. The first call only starts the interval.
   */
  function luxury() {
    const now = clock();
    const since = luxurySince;
    if (!since) {
      luxuryFlows = new Map();
      luxuryBuyers = new Set();
      luxuryCovered = 0;
      luxuryByStanding = new Map();
      luxurySince = now;
      return null;
    }
    const months = Math.max(0, now.year * 12 + now.month - (since.year * 12 + since.month));
    const flows = luxuryFlows;
    const buyers = luxuryBuyers;
    const covered = luxuryCovered;
    const byStanding = luxuryByStanding;
    luxuryFlows = new Map();
    luxuryBuyers = new Set();
    luxuryCovered = 0;
    luxuryByStanding = new Map();
    luxurySince = now;
    if (!economy()) return null;

    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    const median = (values: number[]) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    };
    const towns = liveBurgs().filter(b => b.market);
    const urbanPop = sum(towns.map(b => b.population ?? 0));
    const target = urbanPop * DEMAND_TARGET_FACTORS.luxury * months;

    const totals: Record<string, LuxuryFlow> = {};
    const emptyTiers = () =>
      Object.fromEntries(LUXURY_TIERS.map(tier => [tier, { units: 0, spend: 0 }])) as Record<
        string,
        { units: number; spend: number }
      >;
    const tiers = emptyTiers();
    const characterTiers = emptyTiers();
    for (const [goodId, byKey] of flows) {
      const good = luxuryGoods.get(goodId);
      for (const [key, row] of byKey) {
        const total = (totals[key] ??= { units: 0, value: 0 });
        total.units += row.units;
        total.value += row.value;
        if (TOWN_LUXURY_PURCHASES.has(key) && good && isLuxuryDemandGood(good)) {
          tiers[luxuryTierOf(good)].units += row.units;
          tiers[luxuryTierOf(good)].spend += row.value;
        }
        if (key === "sink:characterLuxury" && good && isLuxuryDemandGood(good)) {
          characterTiers[luxuryTierOf(good)].units += row.units;
          characterTiers[luxuryTierOf(good)].spend += row.value;
        }
      }
    }
    const spend = sum(LUXURY_TIERS.map(tier => tiers[tier].spend));
    const characterSpend = sum(LUXURY_TIERS.map(tier => characterTiers[tier].spend));
    const tierRows = (rows: typeof tiers, total: number) =>
      Object.fromEntries(
        LUXURY_TIERS.map(tier => [
          tier,
          { units: r3(rows[tier].units), spend: r3(rows[tier].spend), share: total > 0 ? r3(rows[tier].spend / total) : 0 }
        ])
      );

    // What each lifestyle tier would spend on luxuries per year at today's wealth (§4.1), so the
    // character spend can be told apart by rank.
    const byLifestyle: Record<string, { count: number; budgetPerYear: number }> = {};
    for (const character of getCharacters()) {
      if (character.dead || !(character.wealth && character.wealth > 0)) continue;
      const tier = resolveLifestyleTier(character);
      const living = computeLivingCost(character);
      const surplus = Math.max(0, character.wealth - living - living * 12 * WEALTH_RESERVE_YEARS) * SURPLUS_WEALTH_SPEND_SHARE;
      const budget = Math.min(character.wealth, characterLuxuryBudget(tier, living, surplus)) * 12;
      const row = (byLifestyle[tier] ??= { count: 0, budgetPerYear: 0 });
      row.count++;
      row.budgetPerYear += budget;
    }

    const markets = getMarkets();
    const goods = [...trackedLuxuryGoods().values()]
      .map(good => {
        const rows = markets.map(m => ({ id: m.i, stock: m.goods[good.i]?.stock ?? 0, price: m.goods[good.i]?.price ?? 0 }));
        const stocked = rows.filter(row => row.stock > 0.01);
        let gapPairs = 0;
        let gapPairsWithHouse = 0;
        for (const exporter of stocked)
          for (const importer of rows) {
            if (importer.id === exporter.id || !(importer.price > exporter.price * 1.3)) continue;
            gapPairs++;
            if (housesPresentIn(exporter.id, importer.id).length) gapPairsWithHouse++;
          }
        const byKey = flows.get(good.i);
        return {
          id: good.i,
          name: good.name,
          value: good.value,
          tier: isLuxuryDemandGood(good) ? luxuryTierOf(good) : null,
          stock: r3(sum(stocked.map(row => row.stock))),
          marketsStocked: stocked.length,
          priceRatio: r3(median(rows.filter(row => row.price > 0).map(row => row.price / (good.value || 1)))),
          flows: byKey ? Object.fromEntries([...byKey].map(([key, row]) => [key, r3(row.units)])) : {},
          gapPairs,
          gapPairsWithHouse
        };
      })
      .filter(row => row.stock > 0 || Object.keys(row.flows).length);

    let inTransit = 0;
    let withLuxury = 0;
    let luxuryValue = 0;
    for (const caravan of getCaravans()) {
      if (caravan.sellerType !== "market" || caravan.buyerType !== "market") continue;
      inTransit++;
      const items = caravan.payload.filter(item => luxuryGoods.has(item.goodId));
      if (!items.length) continue;
      withLuxury++;
      luxuryValue += sum(items.map(item => item.value ?? 0));
    }

    return {
      months,
      demand: {
        target: r3(target),
        covered: r3(covered),
        coverage: target > 0 ? r3(covered / target) : 0,
        spend: r3(spend),
        buyerBurgs: buyers.size,
        burgs: towns.length
      },
      tiers: tierRows(tiers, spend),
      /** Characters' purchases at their home markets (§4). */
      characters: {
        spend: r3(characterSpend),
        tiers: tierRows(characterTiers, characterSpend),
        byLifestyle: Object.fromEntries(
          Object.entries(byLifestyle).map(([tier, row]) => [tier, { count: row.count, budgetPerYear: r3(row.budgetPerYear) }])
        )
      },
      standings: towns.reduce<Record<string, { towns: number; pop: number }>>((acc, b) => {
        const row = (acc[townStanding(b)] ??= { towns: 0, pop: 0 });
        row.towns++;
        row.pop = r3(row.pop + (b.population ?? 0));
        return acc;
      }, {}),
      /** Town purchases by the town's standing and the good's price tier (§3.3). */
      townsByStanding: Object.fromEntries([...byStanding].map(([key, value]) => [key, r3(value)])),
      flows: Object.fromEntries(Object.entries(totals).map(([key, row]) => [key, { units: r3(row.units), value: r3(row.value) }])),
      caravans: { inTransit, withLuxury, luxuryValue: r3(luxuryValue) },
      burgTreasury: {
        zeroShare: towns.length ? r3(towns.filter(b => (b.treasury ?? 0) < 1).length / towns.length) : 0,
        perPopMedian: r3(median(towns.map(b => (b.treasury ?? 0) / Math.max(0.01, b.population ?? 0))))
      },
      goods
    };
  }

  // Global trade matching by stage (docs/plan/approach-commerce-quarters.md §4.4), between trade()
  // calls: how many exporter → importer pairs pass each gate, per cargo class, and how far the
  // struck deals travel. Luxuries are counted on their own as well as in their cargo class.
  const DURATION_BUCKETS = [7, 24, 60, Infinity] as const;
  type StageRow = Record<string, number>;
  let stageCounts = new Map<string, StageRow>();
  let dealRows = new Map<string, { deals: number; units: number; value: number; days: number[]; km: number[] }>();
  let goodClass: { catalogue: readonly Good[] | null; byId: Map<number, string> } = { catalogue: null, byId: new Map() };
  const classOfGood = (goodId: number) => {
    const catalogue = getGoods();
    if (catalogue !== goodClass.catalogue)
      goodClass = { catalogue, byId: new Map(catalogue.map(g => [g.i, cargoClassOf(g.tags)])) };
    return goodClass.byId.get(goodId) ?? "other";
  };
  setTradeStageObserver((event: TradeStageEvent) => {
    const keys = [classOfGood(event.goodId)];
    if (trackedLuxuryGoods().has(event.goodId)) keys.push("luxuryGoods");
    for (const key of keys) {
      const row = stageCounts.get(key) ?? {};
      row[event.stage] = (row[event.stage] ?? 0) + 1;
      // R0 (docs/plan/long-distance-merchant-reach-capital.md §8): which reach gate, and how short
      // of capital the refused bookings were.
      if (event.reason) row[`${event.stage}:${event.reason}`] = (row[`${event.stage}:${event.reason}`] ?? 0) + 1;
      if (event.stage === "noCapital") {
        const needed = event.capitalNeeded ?? 0;
        const available = event.capitalAvailable ?? 0;
        row.noCapitalNeeded = (row.noCapitalNeeded ?? 0) + needed;
        row.noCapitalAvailable = (row.noCapitalAvailable ?? 0) + available;
        // Cash enough but the coin shortage caps it / under a tenth of the need / partly short.
        const kind = (event.capitalCash ?? 0) >= needed ? "coin" : available < needed * 0.1 ? "empty" : "short";
        row[`noCapital:${kind}`] = (row[`noCapital:${kind}`] ?? 0) + 1;
      }
      stageCounts.set(key, row);
      if (event.stage !== "deal") continue;
      const deal = dealRows.get(key) ?? { deals: 0, units: 0, value: 0, days: [], km: [] };
      deal.deals++;
      deal.units += event.units ?? 0;
      deal.value += event.value ?? 0;
      deal.days.push(event.durationDays ?? 0);
      deal.km.push(event.distanceKm ?? 0);
      dealRows.set(key, deal);
    }
  });

  // Export-warehouse lots (§5.3, R0): how many loading passes (one per production cycle, about a
  // month) each has sat through since it was last loaded, and why each pass left it. The economy
  // catches up its months after an advance returns, so the clock cannot date the passes.
  const PASS_DAYS = 30.4;
  type LotTrack = { idlePasses: number; outcome: LotDispatchOutcome; passes: Record<string, number> };
  const lotTracks = new Map<number, LotTrack>();
  setLotDispatchObserver((event: LotDispatchEvent) => {
    let track = lotTracks.get(event.lotId);
    if (!track || event.outcome === "loaded") {
      track = { idlePasses: 0, outcome: event.outcome, passes: {} };
      lotTracks.set(event.lotId, track);
    }
    if (event.outcome !== "loaded") track.idlePasses++;
    track.outcome = event.outcome;
    track.passes[event.outcome] = (track.passes[event.outcome] ?? 0) + 1;
  });
  const LOT_AGE_BUCKETS = [90, 365, 730, Infinity] as const;
  function warehouseLots() {
    const logistics = TradeLogisticsSettings.getOptions();
    const maxWait = Math.max(logistics.maxWaitDaysLand, logistics.maxWaitDaysSea, logistics.maxWaitDaysShortSea);
    const lots = getExportStagingLots();
    const live = new Set(lots.map(lot => lot.id));
    for (const id of lotTracks.keys()) if (!live.has(id)) lotTracks.delete(id);
    const byAge: Record<string, { lots: number; locked: number }> = {};
    const staleByOutcome: Record<string, { lots: number; locked: number; units: number }> = {};
    const stale: unknown[] = [];
    const staleSamples: Record<string, number> = {};
    for (const lot of lots) {
      const track = lotTracks.get(lot.id);
      const age = (track?.idlePasses ?? 0) * PASS_DAYS;
      const bucket = LOT_AGE_BUCKETS.findIndex(limit => age < limit);
      const label = Number.isFinite(LOT_AGE_BUCKETS[bucket]) ? `<${LOT_AGE_BUCKETS[bucket]}d` : `>=${LOT_AGE_BUCKETS[bucket - 1]}d`;
      const row = (byAge[label] ??= { lots: 0, locked: 0 });
      row.lots++;
      row.locked = r3(row.locked + (lot.lockedCapital ?? 0));
      if (age <= maxWait + (lot.durationDays ?? 0)) continue;
      const outcome = track?.outcome ?? "untracked";
      const staleRow = (staleByOutcome[outcome] ??= { lots: 0, locked: 0, units: 0 });
      staleRow.lots++;
      staleRow.locked = r3(staleRow.locked + (lot.lockedCapital ?? 0));
      staleRow.units = r3(staleRow.units + lot.units);
      // Up to 10 examples per outcome.
      staleSamples[outcome] = (staleSamples[outcome] ?? 0) + 1;
      if (staleSamples[outcome] <= 10)
        stale.push({
        id: lot.id,
        from: lot.marketId,
        to: lot.destinationMarketId,
        good: getGoods().find(g => g.i === lot.goodId)?.name ?? lot.goodId,
        units: r3(lot.units),
        locked: r3(lot.lockedCapital ?? 0),
        days: lot.durationDays,
        age: Math.round(age),
        outcome,
        passes: track?.passes
      });
    }
    return {
      lots: lots.length,
      locked: r3(lots.reduce((sum, lot) => sum + (lot.lockedCapital ?? 0), 0)),
      byAge,
      staleByOutcome,
      stale
    };
  }

  /** Trade matching since the previous call (or since these views were created). */
  function trade() {
    const counts = stageCounts;
    const deals = dealRows;
    stageCounts = new Map();
    dealRows = new Map();
    const quantile = (values: number[], q: number) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
    };
    // Inter-market cargo payments (docs/plan/long-distance-merchant-reach-capital.md §5.1, §7.2).
    const settlement = takeTradeSettlementStats();
    const payablesOutstanding = getMarkets().reduce(
      (sum, m) => sum + Object.values(m.marketTreasury?.tradePayables ?? {}).reduce((a, b) => a + b, 0),
      0
    );
    return {
      settlement: {
        ...Object.fromEntries(Object.entries(settlement).map(([key, value]) => [key, r3(value)])),
        paidShare: settlement.saleValue > 0 ? r3((settlement.paidOnArrival + settlement.payableRepaid) / settlement.saleValue) : null,
        payablesOutstanding: r3(payablesOutstanding)
      },
      stages: Object.fromEntries(
        [...counts].map(([key, row]) => [key, Object.fromEntries(Object.entries(row).map(([k, v]) => [k, r3(v)]))])
      ),
      warehouse: warehouseLots(),
      /** Agents of each house (home market → markets with an agent) and pending price rumours (§4.3). */
      branches: merchantIntelligenceSummary(),
      deals: Object.fromEntries(
        [...deals].map(([key, row]) => [
          key,
          {
            deals: row.deals,
            units: r3(row.units),
            value: r3(row.value),
            days: { p50: r3(quantile(row.days, 0.5)), p90: r3(quantile(row.days, 0.9)), max: r3(Math.max(...row.days)) },
            km: { p50: r3(quantile(row.km, 0.5)), p90: r3(quantile(row.km, 0.9)), max: r3(Math.max(...row.km)) },
            byDuration: Object.fromEntries(
              DURATION_BUCKETS.map((limit, index) => {
                const low = index ? DURATION_BUCKETS[index - 1] : 0;
                const label = Number.isFinite(limit) ? `<${limit}d` : `>=${low}d`;
                return [label, row.days.filter(d => d >= low && d < limit).length];
              })
            )
          }
        ])
      )
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

  return { sample, routes, approaches, corridors, markets, goods, gates, wealth, luxury, trade, staticInfo, networkKey };
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
      totals.marketBalance += (m.marketTreasury?.balance ?? 0) + (m.marketTreasury?.tradeEscrow ?? 0);
      totals.marketPayable += m.marketTreasury?.ruralGrainPayable ?? 0;
      totals.tradeCapital += getTradeCapitalMoney(m.marketTreasury);
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
