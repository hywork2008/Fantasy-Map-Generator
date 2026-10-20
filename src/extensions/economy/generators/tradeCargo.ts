import { MERCHANT_SHIP_CLASS_DEFINITIONS } from "../../hostTypes";
import { getDraftAnimalType } from "./caravanMovement";
import type { Good } from "./goodsGeneratorTypes";
import type { Deal, TradeRouteSegment, TransportAllocation } from "./marketTypes";

export type CargoManifestItem = {
  deal: Deal;
  units: number;
  cargoSlotsPerUnit: number;
};

export type CargoManifest = {
  items: CargoManifestItem[];
  allocations: TransportAllocation[];
  usedSlots: number;
};

export type LandTransportDefinition = {
  id: string;
  name: string;
  cargoCapacitySlots: number;
  requiredDraftAnimals: number;
  /**
   * Beasts in one vehicle of this kind, which is a convoy: fifty pack horses, twenty one-horse
   * carts, twenty wagons with some sixty horses (port-freight-queue-and-warehouses.md §10.13, §10.15).
   */
  convoyDraftAnimals: number;
};

export const LAND_TRANSPORTS: readonly LandTransportDefinition[] = [
  { id: "pack-train", name: "Pack train", cargoCapacitySlots: 36, requiredDraftAnimals: 2, convoyDraftAnimals: 50 },
  { id: "cart", name: "Cart", cargoCapacitySlots: 80, requiredDraftAnimals: 1, convoyDraftAnimals: 20 },
  { id: "wagon", name: "Wagon", cargoCapacitySlots: 240, requiredDraftAnimals: 2, convoyDraftAnimals: 60 }
];

export const RIVER_BARGE_TRANSPORT = {
  id: "river-barge",
  name: "River barge",
  cargoCapacitySlots: 160
} as const;

export function getLandTransportDefinition(id: string): LandTransportDefinition | undefined {
  return LAND_TRANSPORTS.find(transport => transport.id === id);
}

const MINIMUM_CARGO_SLOTS = 1;
const MAX_DISTINCT_GOODS_PER_MANIFEST = 6;
const MAX_SINGLE_GOOD_SHARE = 0.55;
const UNIT_EPSILON = 0.000001;

/**
 * Transitional profile for pre-capacity saves and user-created Goods. The value is intentionally
 * derived only at read time; shipped defaults are materialized by Goods.restoreDefaults().
 */
export function getGoodCargoSlotsPerUnit(
  good: Pick<Good, "cargo" | "trade" | "name" | "tags" | "unit" | "value">
): number {
  if (good.cargo && Number.isFinite(good.cargo.cargoSlotsPerUnit) && good.cargo.cargoSlotsPerUnit > 0) {
    return good.cargo.cargoSlotsPerUnit;
  }
  return Math.max(0.25, good.trade?.bulk ?? 3);
}

export function getDefaultGoodCargoProfile(
  good: Pick<Good, "trade" | "name" | "tags" | "unit" | "value">
): Good["cargo"] {
  const slots = getGoodCargoSlotsPerUnit(good);
  const handlingClass =
    good.unit === "head" || good.unit === "slave"
      ? "live"
      : good.tags.includes("freshFood")
        ? "fragile"
        : good.unit === "barrel"
          ? "barreled"
          : good.unit === "pallet" || good.unit === "chest"
            ? "crated"
            : "loose";
  return { cargoSlotsPerUnit: slots, handlingClass };
}

/** Selects the smallest convoy/vessel class that can contain the pending route cargo. */
export function getTransportAllocations(
  routeSegments: readonly TradeRouteSegment[],
  pendingSlots: number,
  draftAnimalId: string,
  allowConvoy: boolean = false
): TransportAllocation[] {
  const modes = new Set(routeSegments.map(segment => segment.type));
  const allocations: TransportAllocation[] = [];

  if (modes.has("land")) {
    const animal = getDraftAnimalType(draftAnimalId);
    const landOptions = LAND_TRANSPORTS.map(definition => ({
      definition,
      capacitySlots: Math.min(definition.cargoCapacitySlots, definition.requiredDraftAnimals * animal.towCapacitySlots)
    }));
    // A load filled to the slot is not tipped onto the next size by floating-point dust: 80.0000000001
    // slots asked for a wagon, and a market with carts and no wagon left the cargo waiting.
    const selected =
      landOptions.find(option => option.capacitySlots >= pendingSlots - UNIT_EPSILON) ??
      landOptions[landOptions.length - 1];
    const unitCount = allowConvoy ? Math.max(1, Math.ceil(pendingSlots / selected.capacitySlots)) : 1;
    allocations.push({
      mode: "land",
      transportId: selected.definition.id,
      transportName: selected.definition.name,
      unitCount,
      capacitySlots: selected.capacitySlots * unitCount,
      usedSlots: 0,
      draftAnimalId,
      requiredDraftAnimals: selected.definition.requiredDraftAnimals
    });
  }

  if (modes.has("water") || modes.has("sea")) {
    const selected =
      MERCHANT_SHIP_CLASS_DEFINITIONS.find(shipClass => shipClass.cargoCapacitySlots >= pendingSlots - UNIT_EPSILON) ??
      MERCHANT_SHIP_CLASS_DEFINITIONS[MERCHANT_SHIP_CLASS_DEFINITIONS.length - 1];
    const unitCount = allowConvoy ? Math.max(1, Math.ceil(pendingSlots / selected.cargoCapacitySlots)) : 1;
    allocations.push({
      mode: "water",
      transportId: selected.id,
      transportName: selected.name,
      unitCount,
      capacitySlots: selected.cargoCapacitySlots * unitCount,
      usedSlots: 0
    });
  }

  if (modes.has("river")) {
    const unitCount = allowConvoy ? Math.max(1, Math.ceil(pendingSlots / RIVER_BARGE_TRANSPORT.cargoCapacitySlots)) : 1;
    allocations.push({
      mode: "river",
      transportId: RIVER_BARGE_TRANSPORT.id,
      transportName: RIVER_BARGE_TRANSPORT.name,
      unitCount,
      capacitySlots: RIVER_BARGE_TRANSPORT.cargoCapacitySlots * unitCount,
      usedSlots: 0
    });
  }

  return allocations;
}

/** Add vehicles within each mode; the weakest route mode determines the shipment's capacity. */
export function getManifestCapacitySlots(
  allocations: readonly Pick<TransportAllocation, "mode" | "capacitySlots">[]
): number {
  if (!allocations.length) return 0;
  const byMode = new Map<TransportAllocation["mode"], number>();
  for (const allocation of allocations)
    byMode.set(allocation.mode, (byMode.get(allocation.mode) ?? 0) + allocation.capacitySlots);
  return Math.min(...byMode.values());
}

/**
 * Splits pending route deals into capacity-bounded manifests. A diversity pass gives each
 * available Good a small berth; the fill pass then prefers value density without allowing one
 * Good to occupy the whole hold while alternatives remain.
 */
export function buildCargoManifests(
  deals: readonly Deal[],
  goods: readonly Good[],
  routeSegments: readonly TradeRouteSegment[],
  draftAnimalId: string,
  maxCapacitySlots?: number
): CargoManifest[] {
  // Good ids start at 1: look goods up by id, not by position in the catalogue.
  const goodById = new Map(goods.map(good => [good.i, good]));
  const pending = deals
    .map(deal => {
      const good = goodById.get(deal.good);
      const remainingUnits = deal.remainingUnits ?? deal.units;
      return good && remainingUnits > UNIT_EPSILON ? { deal, good, remainingUnits } : null;
    })
    .filter((entry): entry is { deal: Deal; good: Good; remainingUnits: number } => entry !== null);
  const manifests: CargoManifest[] = [];

  while (pending.some(entry => entry.remainingUnits > UNIT_EPSILON)) {
    const pendingSlots = pending.reduce(
      (sum, entry) => sum + entry.remainingUnits * getGoodCargoSlotsPerUnit(entry.good),
      0
    );
    const requestedSlots = maxCapacitySlots !== undefined ? Math.min(pendingSlots, maxCapacitySlots) : pendingSlots;
    const allocations = getTransportAllocations(routeSegments, requestedSlots, draftAnimalId);
    const capacitySlots = Math.min(getManifestCapacitySlots(allocations), maxCapacitySlots ?? Number.POSITIVE_INFINITY);
    if (capacitySlots <= 0) break;

    const manifest: CargoManifest = { items: [], allocations, usedSlots: 0 };
    const byDealId = new Map<number, CargoManifestItem>();
    const slotsByGoodId = new Map<number, number>();
    const active = () => pending.filter(entry => entry.remainingUnits > UNIT_EPSILON);

    const add = (entry: (typeof pending)[number], requestedUnits: number): number => {
      const slotsPerUnit = getGoodCargoSlotsPerUnit(entry.good);
      const freeSlots = capacitySlots - manifest.usedSlots;
      const units = Math.min(entry.remainingUnits, requestedUnits, freeSlots / slotsPerUnit);
      if (units <= UNIT_EPSILON) return 0;
      const occupiedSlots = units * slotsPerUnit;
      const existing = byDealId.get(entry.deal.i);
      if (existing) existing.units += units;
      else {
        const item = { deal: entry.deal, units, cargoSlotsPerUnit: slotsPerUnit };
        manifest.items.push(item);
        byDealId.set(entry.deal.i, item);
      }
      entry.remainingUnits -= units;
      manifest.usedSlots += occupiedSlots;
      slotsByGoodId.set(entry.good.i, (slotsByGoodId.get(entry.good.i) ?? 0) + occupiedSlots);
      return units;
    };

    // Round-robin berths: every candidate gets a small chance to ride before density filling.
    for (const entry of active()) {
      if (new Set(manifest.items.map(item => item.deal.good)).size >= MAX_DISTINCT_GOODS_PER_MANIFEST) break;
      add(entry, MINIMUM_CARGO_SLOTS / getGoodCargoSlotsPerUnit(entry.good));
      if (manifest.usedSlots >= capacitySlots - UNIT_EPSILON) break;
    }

    while (manifest.usedSlots < capacitySlots - UNIT_EPSILON) {
      const candidates = active().sort((left, right) => {
        const leftDensity = left.deal.price / getGoodCargoSlotsPerUnit(left.good);
        const rightDensity = right.deal.price / getGoodCargoSlotsPerUnit(right.good);
        return rightDensity - leftDensity || left.deal.i - right.deal.i;
      });
      if (!candidates.length) break;

      const alternativeGoodsRemain = new Set(candidates.map(entry => entry.good.i)).size > 1;
      const selected = candidates.find(entry => {
        const occupiedSlots = slotsByGoodId.get(entry.good.i) ?? 0;
        return !alternativeGoodsRemain || occupiedSlots < capacitySlots * MAX_SINGLE_GOOD_SHARE - UNIT_EPSILON;
      });
      if (!selected) break;
      const slotsForSelectedGood = slotsByGoodId.get(selected.good.i) ?? 0;
      const maxAdditionalSlots = alternativeGoodsRemain
        ? Math.max(0, capacitySlots * MAX_SINGLE_GOOD_SHARE - slotsForSelectedGood)
        : Number.POSITIVE_INFINITY;
      const added = add(
        selected,
        Math.min(selected.remainingUnits, maxAdditionalSlots / getGoodCargoSlotsPerUnit(selected.good))
      );
      if (added <= UNIT_EPSILON) break;
    }

    if (!manifest.items.length) break;
    for (const allocation of manifest.allocations) allocation.usedSlots = manifest.usedSlots;
    manifests.push(manifest);
  }

  return manifests;
}
