export const PARCEL_ARCHETYPES = [
  "small-house",
  "shop-house",
  "workshop-house",
  "merchant-house",
  "warehouse-compound",
  "patrician-house",
  "elite-compound",
  "port-workyard"
] as const;
export type ParcelArchetype = (typeof PARCEL_ARCHETYPES)[number];
