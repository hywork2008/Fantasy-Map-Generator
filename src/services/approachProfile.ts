/**
 * Gate character from the Economy approach ledger (docs/plan/approach-commerce-quarters.md §5,
 * C0). One pure implementation shared by the site descriptor and the observatory's
 * `observe/gates`, so City Editor and the measurements see the same numbers.
 */

/**
 * Cargo classes for gate profiles (approach-commerce-quarters.md §4): what a gate's traffic asks
 * of the street behind it. First matching tag wins, in this order.
 */
export const CARGO_CLASSES = [
  { id: "livestock", tags: ["liveAnimal", "draft"] },
  { id: "perishable", tags: ["freshFood", "fruit", "aquatic"] },
  {
    id: "grain",
    tags: ["cereal", "stapleCrop", "legume", "tuber", "stapleFood"]
  },
  {
    id: "bulk",
    tags: ["construction", "mineral", "ore", "fuel", "ingot", "alloy", "metal"]
  },
  { id: "luxury", tags: ["luxury", "art", "gift", "ritual"] },
  {
    id: "manufactured",
    tags: ["clothing", "tools", "industrial", "military", "naval", "chemical"]
  },
  {
    id: "provisions",
    tags: ["food", "preservedFood", "beverage", "preservative", "crop", "perennialCrop"]
  }
] as const;
export type CargoClass = (typeof CARGO_CLASSES)[number]["id"] | "other";

export function cargoClassOf(tags: readonly string[] | undefined): CargoClass {
  for (const entry of CARGO_CLASSES)
    if (tags?.some(tag => (entry.tags as readonly string[]).includes(tag))) return entry.id;
  return "other";
}

/** Cargo slots of one wagon load (the mean load seen at gates, §6.2). */
export const WAGON_CARGO_SLOTS = 51;

export interface ApproachProfile {
  /** 0..1: this gate's part of the town's cargo slots (ends + pass-through), all modes. */
  share: number;
  /** 0..1: part of this gate's slots that pass the town on the way elsewhere. */
  throughShare: number;
  /** Gate most strongly tied to this one by pass-through traffic: the other end of the axis. */
  axisPartner?: string;
  /** 0..1: inbound part of the end flows; near 0.5 is two-way. */
  inboundShare: number;
  /** Part of the end-flow cargo slots per cargo class (sums to 1). */
  cargo: Partial<Record<CargoClass, number>>;
  /** Part of the end-flow cargo value per cargo class (sums to 1). */
  cargoValue: Partial<Record<CargoClass, number>>;
  /** Wagon loads per year (ends + pass-through), from the decayed stock at steady state. */
  wagonsPerYear: number;
  /** Ledger measurement, the generation-time estimate, or a weighted mix while the ledger is short. */
  source: "ledger" | "prior" | "blend";
}

/** The ledger fields a profile reads (structurally `ApproachTraffic`). */
export interface ApproachProfileRow {
  approachId: string;
  inbound: { cargoSlots: number };
  outbound: { cargoSlots: number };
  through: { cargoSlots: number; partners?: Record<string, number> };
  goodsSlots: Record<string, number>;
  goodsValue?: Record<string, number>;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const load = (row: ApproachProfileRow) => row.inbound.cargoSlots + row.outbound.cargoSlots + row.through.cargoSlots;

function classShares(record: Record<string, number> | undefined, classOf: (goodId: string) => CargoClass) {
  const sums: Partial<Record<CargoClass, number>> = {};
  let total = 0;
  for (const [good, amount] of Object.entries(record ?? {})) {
    if (!(amount > 0)) continue;
    const key = classOf(good);
    sums[key] = (sums[key] ?? 0) + amount;
    total += amount;
  }
  if (total > 0) for (const key of Object.keys(sums) as CargoClass[]) sums[key] = r3(sums[key]! / total);
  return sums;
}

/**
 * Profiles of one town's ledger rows, keyed by approach id. `retention` is the ledger's yearly
 * retention: a decayed stock S of yearly flow F settles at F / (1 - retention).
 */
export function approachProfiles(
  rows: readonly ApproachProfileRow[],
  classOf: (goodId: string) => CargoClass,
  retention: number
): Map<string, ApproachProfile> {
  const total = rows.reduce((sum, row) => sum + load(row), 0);
  const ids = new Set(rows.map(row => row.approachId));
  const profiles = new Map<string, ApproachProfile>();
  for (const row of rows) {
    const slots = load(row);
    const ends = row.inbound.cargoSlots + row.outbound.cargoSlots;
    let axisPartner: string | undefined;
    let best = 0;
    for (const [partner, amount] of Object.entries(row.through.partners ?? {}))
      if (amount > best && partner !== row.approachId && ids.has(partner)) [axisPartner, best] = [partner, amount];
    profiles.set(row.approachId, {
      share: total > 0 ? r3(slots / total) : 0,
      throughShare: slots > 0 ? r3(row.through.cargoSlots / slots) : 0,
      ...(axisPartner ? { axisPartner } : {}),
      inboundShare: ends > 0 ? r3(row.inbound.cargoSlots / ends) : 0,
      cargo: classShares(row.goodsSlots, classOf),
      cargoValue: classShares(row.goodsValue, classOf),
      wagonsPerYear: r3((slots * (1 - retention)) / WAGON_CARGO_SLOTS),
      source: "ledger"
    });
  }
  return profiles;
}
