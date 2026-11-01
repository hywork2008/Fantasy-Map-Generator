/**
 * Trade-volume rows for the Data Charts dialog.
 *
 * Quantity comes from the decayed burg-pair corridor ledger (shipments and caravan
 * departures). Each living endpoint receives the full amount, so a state's bar is the
 * sum of its towns and an internal shipment is counted at both ends.
 *
 * Price uses the money recorded on the corridor. Same-market shipments store no money,
 * so those fall back to catalogue value times units. Weight is units times the good's
 * transport weight. The tag basis counts every cargo slot under that good's one trade
 * heading, so a stacked bar still sums to the slots. The ledger keeps only the busiest
 * goods; the unlisted tail is "Other" (headings) or the known goods' average weight per slot.
 */

import { getGoods, getTradeCorridors, getWorldContext, isEconomyContextReady } from "../economyContext";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";
import { TRADE_HEADING_LABELS, tradeHeadingOf } from "./tradeHeadings";

export type TradeChartBasis = "price" | "weight" | "tags";

export type TradeChartEntity = "states" | "cultures" | "religions" | "provinces" | "biomes" | "burgs";

export interface TradeChartBurg {
  id: number;
  state: number;
  culture: number;
  province: number;
  religion: number;
  biome: number;
}

export interface TradeChartGood {
  id: number;
  value: number;
  /** Transport weight, 1 (light) to 5 (heavy). */
  weight: number;
  cargoSlotsPerUnit: number;
  /** Resolved trade-statistics label. The full slot count is counted here. */
  heading: string;
}

export interface TradeChartCorridor {
  burgA: number;
  burgB: number;
  /** Recorded money. Zero on same-market shipments. */
  value: number;
  cargoSlots: number;
  goodsSlots: Readonly<Record<string, number>>;
}

export interface TradeChartContribution {
  entityId: number;
  /** Group entity id, or a trade heading when the basis is tags. */
  groupKey: string;
  value: number;
}

export interface TradeChartSeriesInput {
  basis: TradeChartBasis;
  entity: TradeChartEntity;
  groupBy: TradeChartEntity;
  corridors: readonly TradeChartCorridor[];
  /** Indexed by burg id. Missing and removed towns are absent. */
  burgs: readonly (TradeChartBurg | null | undefined)[];
  goods: readonly TradeChartGood[];
}

const ENTITIES: readonly TradeChartEntity[] = ["states", "cultures", "religions", "provinces", "biomes", "burgs"];

export function isTradeChartEntity(value: string): value is TradeChartEntity {
  return (ENTITIES as readonly string[]).includes(value);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function membership(burg: TradeChartBurg, entity: TradeChartEntity): number {
  switch (entity) {
    case "burgs":
      return burg.id;
    case "states":
      return burg.state;
    case "cultures":
      return burg.culture;
    case "religions":
      return burg.religion;
    case "provinces":
      return burg.province;
    case "biomes":
      return burg.biome;
  }
}

function livingEnds(
  corridor: TradeChartCorridor,
  burgs: readonly (TradeChartBurg | null | undefined)[]
): TradeChartBurg[] {
  const ends: TradeChartBurg[] = [];
  const seen = new Set<number>();
  for (const id of [corridor.burgA, corridor.burgB]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const burg = burgs[id];
    if (!burg || burg.id !== id) continue;
    ends.push(burg);
  }
  return ends;
}

function slotsPerUnit(good: TradeChartGood): number {
  return good.cargoSlotsPerUnit > 0 ? good.cargoSlotsPerUnit : 1;
}

function catalogueValue(corridor: TradeChartCorridor, goodsById: ReadonlyMap<number, TradeChartGood>): number {
  let total = 0;
  for (const [key, rawSlots] of Object.entries(corridor.goodsSlots)) {
    const id = Number(key);
    const slots = Number(rawSlots);
    const good = goodsById.get(id);
    if (!Number.isInteger(id) || !good || !(slots > 0)) continue;
    total += (slots / slotsPerUnit(good)) * Math.max(0, good.value);
  }
  return total;
}

function weightOf(corridor: TradeChartCorridor, goodsById: ReadonlyMap<number, TradeChartGood>): number {
  let accounted = 0;
  let total = 0;
  for (const [key, rawSlots] of Object.entries(corridor.goodsSlots)) {
    const id = Number(key);
    const slots = Number(rawSlots);
    const good = goodsById.get(id);
    if (!Number.isInteger(id) || !good || !(slots > 0)) continue;
    accounted += slots;
    total += (slots / slotsPerUnit(good)) * Math.max(0, good.weight);
  }
  const residual = Math.max(0, corridor.cargoSlots - accounted);
  if (residual > 0) {
    const perSlot = accounted > 0 ? total / accounted : 3;
    total += residual * perSlot;
  }
  return total;
}

function headingSlots(
  corridor: TradeChartCorridor,
  goodsById: ReadonlyMap<number, TradeChartGood>
): Map<string, number> {
  const shares = new Map<string, number>();
  let accounted = 0;
  const add = (heading: string, amount: number) => shares.set(heading, (shares.get(heading) ?? 0) + amount);
  for (const [key, rawSlots] of Object.entries(corridor.goodsSlots)) {
    const id = Number(key);
    const slots = Number(rawSlots);
    const good = goodsById.get(id);
    if (!Number.isInteger(id) || !good || !(slots > 0)) continue;
    accounted += slots;
    add(good.heading || TRADE_HEADING_LABELS.other, slots);
  }
  const residual = Math.max(0, corridor.cargoSlots - accounted);
  if (residual > 0) add(TRADE_HEADING_LABELS.other, residual);
  return shares;
}

/** One row per entity and stack. Empty when nothing traded. */
export function collectTradeContributions(input: TradeChartSeriesInput): TradeChartContribution[] {
  const goodsById = new Map(input.goods.map(good => [good.id, good]));
  const totals = new Map<string, { entityId: number; groupKey: string; value: number }>();
  const add = (entityId: number, groupKey: string, amount: number) => {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    const key = `${entityId}\0${groupKey}`;
    const row = totals.get(key);
    if (row) row.value += amount;
    else totals.set(key, { entityId, groupKey, value: amount });
  };

  for (const corridor of input.corridors) {
    const ends = livingEnds(corridor, input.burgs);
    if (!ends.length) continue;
    if (input.basis === "tags") {
      const shares = headingSlots(corridor, goodsById);
      for (const burg of ends) {
        const entityId = membership(burg, input.entity);
        for (const [tag, slots] of shares) add(entityId, tag, slots);
      }
      continue;
    }
    const amount =
      input.basis === "price"
        ? corridor.value > 0
          ? corridor.value
          : catalogueValue(corridor, goodsById)
        : weightOf(corridor, goodsById);
    for (const burg of ends) add(membership(burg, input.entity), String(membership(burg, input.groupBy)), amount);
  }

  const rows: TradeChartContribution[] = [];
  for (const row of totals.values()) {
    const value = round3(row.value);
    if (value > 0) rows.push({ entityId: row.entityId, groupKey: row.groupKey, value });
  }
  return rows;
}

function cellNumber(column: ArrayLike<number> | undefined, cell: number): number {
  if (!column || cell < 0 || cell >= column.length) return 0;
  const value = column[cell];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Null when the economy extension has not initialised. */
export function readTradeContributions(input: {
  basis: TradeChartBasis;
  entity: TradeChartEntity;
  groupBy: TradeChartEntity;
}): TradeChartContribution[] | null {
  if (!isEconomyContextReady()) return null;
  const pack = getWorldContext().pack;
  const cells = pack.cells;
  const burgs: (TradeChartBurg | null)[] = [];
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const cell = burg.cell ?? -1;
    burgs[burg.i] = {
      id: burg.i,
      state: burg.state ?? 0,
      culture: burg.culture ?? 0,
      province: typeof burg.province === "number" ? burg.province : cellNumber(cells?.province, cell),
      religion: cellNumber(cells?.religion, cell),
      biome: cellNumber(cells?.biomeCode, cell)
    };
  }
  const goods = getGoods().map(good => ({
    id: good.i,
    value: good.value ?? 0,
    weight: good.trade?.weight ?? 3,
    cargoSlotsPerUnit: getGoodCargoSlotsPerUnit(good),
    heading: tradeHeadingOf(good)
  }));
  const corridors = getTradeCorridors().map(corridor => ({
    burgA: corridor.burgA,
    burgB: corridor.burgB,
    value: corridor.value ?? 0,
    cargoSlots: corridor.cargoSlots ?? 0,
    goodsSlots: corridor.goodsSlots ?? {}
  }));
  return collectTradeContributions({ ...input, corridors, burgs, goods });
}
