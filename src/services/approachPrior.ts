/**
 * Generation-time gate estimate (docs/plan/approach-commerce-quarters.md §5, C4).
 * Pure: the descriptor and `observe/gates?prior=1` both call it. The ledger path in
 * `approachProfiles` is unchanged. Crossing roads are never invented here.
 */

import { approachIdForLeg } from "./approachId";
import { type ApproachProfile, type CargoClass, WAGON_CARGO_SLOTS } from "./approachProfile";

/** Ledger retention. Callers pass `APPROACH_ANNUAL_RETENTION`; this is only the default. */
const DEFAULT_RETENTION = 0.7;
const MAX_ROUTE_STEPS = 256;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface ApproachPriorTown {
  id: string;
  population: number;
  marketId: string;
  /** Market centre. Through-traffic is measured on paths that leave this town. */
  center?: boolean;
}

export interface ApproachPriorLink {
  fromId: string;
  toId: string;
  /** Approach on `fromId` used for this hop. */
  approachId: string;
  length: number;
}

export interface ApproachPriorGood {
  id: string;
  cargoClass: CargoClass;
  homeStock: number;
  partnerStock: number;
  /** Gate that reaches the partner market. Omit to give every flow gate the same mix. */
  approachId?: string;
  /** Catalogue value of one stock unit. Cargo value uses the shortage weight times this. */
  unitValue?: number;
}

export interface ApproachPriorInput {
  townId: string;
  towns: readonly ApproachPriorTown[];
  links: readonly ApproachPriorLink[];
  goods?: readonly ApproachPriorGood[];
  /**
   * Used when the route graph cannot reach a same-market town. Not a shortcut edge:
   * the population is end flow on that gate and does not create pass-through.
   */
  directApproach?: (townId: string) => string | null;
  retention?: number;
}

export interface ApproachPriorResult {
  profiles: Map<string, ApproachProfile>;
  /** One year of estimated flow: end + through population, before shares are normalised. */
  baseline: number;
}

interface DirectedHop {
  toId: string;
  approachId: string;
  length: number;
}

interface GateFlow {
  end: number;
  through: number;
}

/** Same-market population beyond each gate, plus pass-through on the path out of the market centre. */
export function approachPrior(input: ApproachPriorInput): ApproachPriorResult {
  const home = input.towns.find(town => town.id === input.townId);
  const empty: ApproachPriorResult = { profiles: new Map(), baseline: 0 };
  if (!home) return empty;
  const market = input.towns.filter(town => town.marketId === home.marketId);
  const hops = new Map<string, DirectedHop[]>();
  for (const link of input.links) {
    if (!(link.length >= 0) || !link.approachId) continue;
    const list = hops.get(link.fromId) ?? [];
    const existing = list.find(hop => hop.toId === link.toId);
    if (
      !existing ||
      link.length < existing.length ||
      (link.length === existing.length && link.approachId < existing.approachId)
    ) {
      if (existing) {
        existing.length = link.length;
        existing.approachId = link.approachId;
      } else list.push({ toId: link.toId, approachId: link.approachId, length: link.length });
    }
    if (!existing) hops.set(link.fromId, list);
  }

  const end = new Map<string, number>();
  const through = new Map<string, number>();
  const add = (bucket: Map<string, number>, approachId: string | undefined, amount: number) => {
    if (!approachId || !(amount > 0)) return;
    bucket.set(approachId, (bucket.get(approachId) ?? 0) + amount);
  };
  for (const other of market) {
    if (other.id === home.id || !(other.population > 0)) continue;
    const nodes = shortest(hops, home.id, other.id);
    if (!nodes) {
      add(end, input.directApproach?.(other.id) ?? undefined, other.population);
      continue;
    }
    add(end, hopApproach(hops, nodes[0], nodes[1]), other.population);
  }
  const center = market.find(town => town.center);
  if (center && center.id !== home.id) {
    for (const dest of market) {
      if (dest.id === center.id || dest.id === home.id || !(dest.population > 0)) continue;
      const nodes = shortest(hops, center.id, dest.id);
      if (!nodes) continue;
      const at = nodes.indexOf(home.id);
      if (at <= 0 || at >= nodes.length - 1) continue;
      const entry = hopApproach(hops, nodes[at], nodes[at - 1]);
      const exit = hopApproach(hops, nodes[at], nodes[at + 1]);
      if (entry && exit && entry === exit) add(through, entry, dest.population);
      else {
        add(through, entry, dest.population);
        add(through, exit, dest.population);
      }
    }
  }

  const flow = new Map<string, GateFlow>();
  for (const [approachId, amount] of end) flow.set(approachId, { end: amount, through: through.get(approachId) ?? 0 });
  for (const [approachId, amount] of through) {
    if (!flow.has(approachId)) flow.set(approachId, { end: 0, through: amount });
  }
  const cargo = cargoByGate(input.goods ?? [], [...flow.keys()]);
  for (const approachId of cargo.keys()) {
    if (!flow.has(approachId)) flow.set(approachId, { end: 0, through: 0 });
  }
  let baseline = 0;
  for (const gate of flow.values()) baseline += gate.end + gate.through;
  if (!flow.size) return empty;

  const retention = input.retention ?? DEFAULT_RETENTION;
  const profiles = new Map<string, ApproachProfile>();
  for (const [approachId, gate] of flow) {
    const slots = gate.end + gate.through;
    const goods = cargo.get(approachId);
    const traded = (goods?.inbound ?? 0) + (goods?.outbound ?? 0);
    const partner = axisPartner(approachId, through);
    profiles.set(approachId, {
      share: baseline > 0 ? r3(slots / baseline) : 0,
      throughShare: slots > 0 ? r3(gate.through / slots) : 0,
      ...(partner ? { axisPartner: partner } : {}),
      inboundShare: traded > 0 ? r3((goods?.inbound ?? 0) / traded) : 0.5,
      cargo: goods?.cargo ?? {},
      cargoValue: goods?.cargoValue ?? {},
      wagonsPerYear: r3((slots * (1 - retention)) / WAGON_CARGO_SLOTS),
      source: "prior"
    });
  }
  return { profiles, baseline };
}

/**
 * Blend while the ledger's implied annual flow is below one year of the prior.
 * Weight = ledgerAnnual / (ledgerAnnual + baseline). At or above the baseline the ledger
 * profile is returned unchanged, including `source: "ledger"`.
 */
export function blendApproachProfiles(
  ledger: ReadonlyMap<string, ApproachProfile>,
  prior: ReadonlyMap<string, ApproachProfile>,
  ledgerAnnual: number,
  baseline: number
): Map<string, ApproachProfile> {
  if (!prior.size || !(baseline > 0)) return copyProfiles(ledger);
  if (!ledger.size || !(ledgerAnnual > 0)) return copyProfiles(prior);
  if (ledgerAnnual >= baseline) return copyProfiles(ledger);
  const weight = ledgerAnnual / (ledgerAnnual + baseline);
  const ids = new Set<string>([...ledger.keys(), ...prior.keys()]);
  const rawShare = new Map<string, number>();
  let shareSum = 0;
  for (const id of ids) {
    const share = weight * (ledger.get(id)?.share ?? 0) + (1 - weight) * (prior.get(id)?.share ?? 0);
    rawShare.set(id, share);
    shareSum += share;
  }
  const profiles = new Map<string, ApproachProfile>();
  for (const id of ids) {
    const led = ledger.get(id);
    const pri = prior.get(id);
    const mix = (pick: (profile: ApproachProfile) => number) =>
      r3(weight * (led ? pick(led) : 0) + (1 - weight) * (pri ? pick(pri) : 0));
    // Ratios are weighted by each side's flow through this gate; a side without the gate adds none.
    const ledFlow = led ? weight * led.share : 0;
    const priFlow = pri ? (1 - weight) * pri.share : 0;
    const ratioWeight = ledFlow + priFlow > 0 ? ledFlow / (ledFlow + priFlow) : led ? (pri ? weight : 1) : 0;
    const mixRatio = (pick: (profile: ApproachProfile) => number) =>
      r3(ratioWeight * (led ? pick(led) : 0) + (1 - ratioWeight) * (pri ? pick(pri) : 0));
    const partner = axisFromHeavier(weight, led?.axisPartner, pri?.axisPartner, ids);
    profiles.set(id, {
      share: shareSum > 0 ? r3((rawShare.get(id) ?? 0) / shareSum) : 0,
      throughShare: mixRatio(profile => profile.throughShare),
      ...(partner ? { axisPartner: partner } : {}),
      inboundShare: mixRatio(profile => profile.inboundShare),
      cargo: mixRecord(led?.cargo, pri?.cargo, ratioWeight),
      cargoValue: mixRecord(led?.cargoValue, pri?.cargoValue, ratioWeight),
      wagonsPerYear: mix(profile => profile.wagonsPerYear),
      source: "blend"
    });
  }
  return profiles;
}

export interface PriorGraph {
  cells: {
    burg?: ArrayLike<number>;
    routes?: Record<number, Record<number, number>>;
    p: ArrayLike<readonly [number, number] | undefined>;
  };
  burgs: ArrayLike<
    | {
        i?: number;
        cell?: number;
        x?: number;
        y?: number;
        population?: number;
        market?: number;
        removed?: boolean;
      }
    | undefined
  >;
}

export interface ApproachPriorWorld {
  burgId: number;
  pack: PriorGraph;
  marketByCell?: ArrayLike<number>;
  markets: readonly {
    i: number;
    centerBurgId: number;
    goods: Record<number, { stock?: number; price?: number }>;
  }[];
  goods?: readonly { i: number; tags?: readonly string[]; value?: number }[];
  /** Same-market town the route graph does not reach. End flow only. */
  directApproach?: (fromBurgId: number, toBurgId: number) => string | null;
  classOf?: (tags: readonly string[] | undefined) => CargoClass;
  retention?: number;
}

/** Route-walk links and partner-market stocks for one burg, then `approachPrior`. */
export function approachPriorFromWorld(input: ApproachPriorWorld): ApproachPriorResult {
  const burg = input.pack.burgs[input.burgId];
  if (!burg?.i || burg.removed) return { profiles: new Map(), baseline: 0 };
  const marketId = townMarket(input, input.burgId);
  if (!marketId) return { profiles: new Map(), baseline: 0 };
  const home = input.markets.find(market => market.i === marketId);
  const towns: ApproachPriorTown[] = [];
  const townIds = new Set<number>();
  for (const other of input.pack.burgs) {
    if (!other?.i || other.removed) continue;
    const otherMarket = townMarket(input, other.i);
    if (otherMarket !== marketId) continue;
    townIds.add(other.i);
    towns.push({
      id: String(other.i),
      population: other.population ?? 0,
      marketId: String(marketId),
      ...(other.i === home?.centerBurgId ? { center: true } : {})
    });
  }
  const classOf = input.classOf ?? (() => "other" as CargoClass);
  return approachPrior({
    townId: String(input.burgId),
    towns,
    links: priorRouteLinks(input.pack, townIds),
    goods: partnerGoods(input, marketId, home, classOf),
    ...(input.directApproach
      ? { directApproach: (townId: string) => input.directApproach!(input.burgId, Number(townId)) }
      : {}),
    retention: input.retention
  });
}

export interface PriorHop {
  approachId: string;
  otherBurgId: number;
  length: number;
}

/** First burg along each route leaving `burgId`. A removed burg is walked past. */
export function priorNeighborHops(pack: PriorGraph, burgId: number): PriorHop[] {
  const burg = pack.burgs[burgId];
  const start = burg?.cell;
  if (start === undefined || !burg) return [];
  const exits = pack.cells.routes?.[start];
  if (!exits) return [];
  const hops = new Map<string, PriorHop>();
  for (const [cellText, routeId] of Object.entries(exits)) {
    const exit = Number(cellText);
    if (!Number.isFinite(exit)) continue;
    const found = nearestBurg(pack, burgId, start, exit, Number(routeId));
    if (!found) continue;
    const approachId = approachIdForLeg(burgId, start, Number(routeId), [
      [burg.x ?? 0, burg.y ?? 0, start],
      [0, 0, exit]
    ]);
    const previous = hops.get(approachId);
    if (!previous || found.length < previous.length) {
      hops.set(approachId, { approachId, otherBurgId: found.id, length: found.length });
    }
  }
  return [...hops.values()];
}

/** Directed hops whose other end is in `townIds` (one market). */
export function priorRouteLinks(pack: PriorGraph, townIds: ReadonlySet<number>): ApproachPriorLink[] {
  const links: ApproachPriorLink[] = [];
  for (const id of townIds) {
    for (const hop of priorNeighborHops(pack, id)) {
      if (!townIds.has(hop.otherBurgId)) continue;
      links.push({
        fromId: String(id),
        toId: String(hop.otherBurgId),
        approachId: hop.approachId,
        length: hop.length
      });
    }
  }
  return links;
}

function townMarket(input: ApproachPriorWorld, burgId: number): number {
  const burg = input.pack.burgs[burgId];
  if (!burg) return 0;
  return burg.market || input.marketByCell?.[burg.cell ?? -1] || 0;
}

function partnerGoods(
  input: ApproachPriorWorld,
  marketId: number,
  home: ApproachPriorWorld["markets"][number] | undefined,
  classOf: (tags: readonly string[] | undefined) => CargoClass
): ApproachPriorGood[] {
  const catalogue = new Map((input.goods ?? []).map(good => [good.i, good]));
  const goods: ApproachPriorGood[] = [];
  for (const hop of priorNeighborHops(input.pack, input.burgId)) {
    const otherMarketId = townMarket(input, hop.otherBurgId);
    if (!otherMarketId || otherMarketId === marketId) continue;
    const partner = input.markets.find(market => market.i === otherMarketId);
    if (!partner) continue;
    const ids = new Set<string>([...Object.keys(home?.goods ?? {}), ...Object.keys(partner.goods)]);
    for (const id of ids) {
      const goodId = Number(id);
      const homeStock = home?.goods[goodId]?.stock ?? 0;
      const partnerStock = partner.goods[goodId]?.stock ?? 0;
      if (!(partnerStock > homeStock) && !(homeStock > partnerStock)) continue;
      const good = catalogue.get(goodId);
      goods.push({
        id,
        cargoClass: classOf(good?.tags),
        homeStock,
        partnerStock,
        approachId: hop.approachId,
        unitValue: good?.value ?? partner.goods[goodId]?.price ?? 0
      });
    }
  }
  return goods;
}

function nearestBurg(
  pack: PriorGraph,
  fromBurgId: number,
  start: number,
  exit: number,
  routeId: number
): { id: number; length: number } | null {
  const points = pack.cells.p;
  const origin = points[start];
  const first = points[exit];
  if (!origin || !first) return null;
  const queue: { cell: number; prev: number; length: number }[] = [
    { cell: exit, prev: start, length: Math.hypot(first[0] - origin[0], first[1] - origin[1]) }
  ];
  const seen = new Set<number>([start]);
  let best: { id: number; length: number } | null = null;
  let steps = 0;
  while (queue.length && steps < MAX_ROUTE_STEPS) {
    steps++;
    queue.sort((a, b) => a.length - b.length);
    const step = queue.shift();
    if (!step || seen.has(step.cell)) continue;
    seen.add(step.cell);
    const occupant = pack.cells.burg?.[step.cell] ?? 0;
    const occupied = occupant ? pack.burgs[occupant] : undefined;
    if (occupant && occupant !== fromBurgId && !occupied?.removed) {
      if (!best || step.length < best.length) best = { id: occupant, length: step.length };
      continue;
    }
    if (best && step.length >= best.length) continue;
    for (const [nextText, nextRoute] of Object.entries(pack.cells.routes?.[step.cell] ?? {})) {
      if (Number(nextRoute) !== routeId) continue;
      const next = Number(nextText);
      if (next === step.prev || seen.has(next)) continue;
      const from = points[step.cell];
      const to = points[next];
      if (!from || !to) continue;
      queue.push({
        cell: next,
        prev: step.cell,
        length: step.length + Math.hypot(to[0] - from[0], to[1] - from[1])
      });
    }
  }
  return best;
}

function shortest(hops: ReadonlyMap<string, readonly DirectedHop[]>, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([from]);
  while (open.size) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of open) {
      const length = dist.get(id) ?? Infinity;
      if (length < best || (length === best && (current === null || id < current))) {
        current = id;
        best = length;
      }
    }
    if (current === null) break;
    open.delete(current);
    if (current === to) break;
    for (const hop of hops.get(current) ?? []) {
      const next = best + hop.length;
      const known = dist.get(hop.toId);
      if (known === undefined || next < known || (next === known && current < (prev.get(hop.toId) ?? ""))) {
        dist.set(hop.toId, next);
        prev.set(hop.toId, current);
        open.add(hop.toId);
      }
    }
  }
  if (!dist.has(to) || from === to) return from === to ? [from] : null;
  if (!prev.has(to) && from !== to) return null;
  const nodes = [to];
  let cursor = to;
  const guard = new Set<string>();
  while (cursor !== from) {
    const before = prev.get(cursor);
    if (!before || guard.has(cursor)) return null;
    guard.add(cursor);
    nodes.push(before);
    cursor = before;
  }
  nodes.reverse();
  return nodes;
}

function hopApproach(hops: ReadonlyMap<string, readonly DirectedHop[]>, from: string, to: string): string | undefined {
  return hops.get(from)?.find(hop => hop.toId === to)?.approachId;
}

function axisPartner(approachId: string, through: ReadonlyMap<string, number>): string | undefined {
  if (!((through.get(approachId) ?? 0) > 0)) return undefined;
  let partner: string | undefined;
  let best = 0;
  for (const [other, amount] of through) {
    if (other === approachId || !(amount > 0)) continue;
    if (!partner || amount > best || (amount === best && other < partner)) {
      partner = other;
      best = amount;
    }
  }
  return partner;
}

function axisFromHeavier(
  weight: number,
  ledgerPartner: string | undefined,
  priorPartner: string | undefined,
  ids: ReadonlySet<string>
): string | undefined {
  const first = weight >= 0.5 ? ledgerPartner : priorPartner;
  const second = weight >= 0.5 ? priorPartner : ledgerPartner;
  if (first && ids.has(first)) return first;
  if (second && ids.has(second)) return second;
  return undefined;
}

interface GateCargo {
  inbound: number;
  outbound: number;
  cargo: Partial<Record<CargoClass, number>>;
  cargoValue: Partial<Record<CargoClass, number>>;
}

function cargoByGate(goods: readonly ApproachPriorGood[], flowGates: readonly string[]): Map<string, GateCargo> {
  const slots = new Map<string, Partial<Record<CargoClass, number>>>();
  const values = new Map<string, Partial<Record<CargoClass, number>>>();
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const add = (
    bucket: Map<string, Partial<Record<CargoClass, number>>>,
    approachId: string,
    key: CargoClass,
    amount: number
  ) => {
    if (!(amount > 0)) return;
    const record = bucket.get(approachId) ?? {};
    record[key] = (record[key] ?? 0) + amount;
    bucket.set(approachId, record);
  };
  for (const good of goods) {
    const shortage = Math.max(0, good.partnerStock - good.homeStock);
    const surplus = Math.max(0, good.homeStock - good.partnerStock);
    if (!(shortage > 0) && !(surplus > 0)) continue;
    const targets = good.approachId ? [good.approachId] : flowGates;
    for (const approachId of targets) {
      inbound.set(approachId, (inbound.get(approachId) ?? 0) + shortage);
      outbound.set(approachId, (outbound.get(approachId) ?? 0) + surplus);
      add(slots, approachId, good.cargoClass, shortage);
      add(values, approachId, good.cargoClass, shortage * Math.max(0, good.unitValue ?? 0));
    }
  }
  const gates = new Map<string, GateCargo>();
  const ids = new Set<string>([...slots.keys(), ...values.keys(), ...inbound.keys()]);
  for (const approachId of ids) {
    gates.set(approachId, {
      inbound: inbound.get(approachId) ?? 0,
      outbound: outbound.get(approachId) ?? 0,
      cargo: normalise(slots.get(approachId)),
      cargoValue: normalise(values.get(approachId))
    });
  }
  return gates;
}

function normalise(record: Partial<Record<CargoClass, number>> | undefined): Partial<Record<CargoClass, number>> {
  if (!record) return {};
  let total = 0;
  for (const amount of Object.values(record)) if (amount && amount > 0) total += amount;
  if (!(total > 0)) return {};
  const out: Partial<Record<CargoClass, number>> = {};
  for (const [key, amount] of Object.entries(record) as [CargoClass, number | undefined][]) {
    if (amount && amount > 0) out[key] = r3(amount / total);
  }
  return out;
}

function mixRecord(
  ledger: Partial<Record<CargoClass, number>> | undefined,
  prior: Partial<Record<CargoClass, number>> | undefined,
  weight: number
): Partial<Record<CargoClass, number>> {
  const keys = new Set<string>([...Object.keys(ledger ?? {}), ...Object.keys(prior ?? {})]);
  const mixed: Partial<Record<CargoClass, number>> = {};
  for (const key of keys) {
    const value = weight * (ledger?.[key as CargoClass] ?? 0) + (1 - weight) * (prior?.[key as CargoClass] ?? 0);
    if (value > 0) mixed[key as CargoClass] = value;
  }
  return normalise(mixed);
}

function copyProfiles(source: ReadonlyMap<string, ApproachProfile>): Map<string, ApproachProfile> {
  const copy = new Map<string, ApproachProfile>();
  for (const [id, profile] of source)
    copy.set(id, { ...profile, cargo: { ...profile.cargo }, cargoValue: { ...profile.cargoValue } });
  return copy;
}
