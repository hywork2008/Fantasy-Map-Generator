/**
 * The cargo slot shared by goods, vehicles and hulls (docs/plan/goods-physical-units.md §5.4.1).
 * A slot is 150 kg or 250 L, whichever the cargo fills first: a convoy of twenty carts takes 80
 * slots, some 12 t of grain. Heavy cargo fills it by weight, light cargo by bulk.
 */
export const CARGO_SLOT_KG = 150;
export const CARGO_SLOT_LITERS = 250;

/** Slots a carrier holds when every slot of cargo may weigh 150 kg and take 250 L. */
export function getCarrierCargoSlots(capacityKg: number, capacityLiters: number): number {
  return Math.floor(Math.min(capacityKg / CARGO_SLOT_KG, capacityLiters / CARGO_SLOT_LITERS));
}
