/** Features exposed by the Burg Editor. Port values are water-body IDs, so presence uses truthiness. */
export const burgFeatures = [
  { id: "capital", label: "Capital", icon: "icon-star" },
  { id: "port", label: "Port", icon: "icon-anchor" },
  { id: "citadel", label: "Citadel", icon: "icon-chess-rook" },
  { id: "walls", label: "Walls", icon: "icon-fort-awesome" },
  { id: "plaza", label: "Plaza", icon: "icon-store" },
  { id: "temple", label: "Temple", icon: "icon-chess-bishop" },
  { id: "shanty", label: "Shanty", icon: "icon-campground" }
] as const;

export type BurgFeature = (typeof burgFeatures)[number]["id"];
