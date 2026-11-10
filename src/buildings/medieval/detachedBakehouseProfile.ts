/** Illustrative bread-only workshop contract; not an economic throughput rating. */
export const DETACHED_BAKEHOUSE = {
  formId: "dedicated-bakehouse",
  placementSpecVersion: 1,
  equipmentLayoutVersion: 1,
  coordinateFrame: { origin: "preparation-house-center-at-ground", front: "+Z", up: "+Y", metersPerUnit: 1 },
  body: { width: 8, depth: 6, wall: 0.25, eave: 3.25, roofRise: 1.4 },
  envelope: { min: [-4.5, 0, -3.5], max: [10, 5, 7] },
  siteXZ: [-4.5, -3.5, 10, 7],
  floorElevation: 0.15,
  ramp: { rectXZ: [-4.5, 5, 10, 7], rise: 0.15, run: 2 },
  main: { position: [0, 0, 7], clearWidth: 2, clearHeight: 2.2 },
  service: { position: [9, 0, 7], clearWidth: 1.4, clearHeight: 2.2 },
  houseEntry: { position: [0, 0.15, 3], clearWidth: 2, clearHeight: 2.2 },
  equipment: [
    { id: "oven", sourcePart: "oven", translation: [3, 0.15, 0], rotationY: 0 },
    { id: "kneading", sourcePart: "kneading-station", translation: [-1.3, 0.15, -4.3], rotationY: 0 },
    { id: "cooling", sourcePart: "cooling-bench", translation: [-5.1, 0.15, -2.3], rotationY: Math.PI / 2 },
    { id: "cooling-bread", sourcePart: "bread", translation: [-5.1, 0.15, -2.3], rotationY: Math.PI / 2 },
    { id: "tools", sourcePart: "tools", translation: [4.35, 0.15, -2.3], rotationY: Math.PI / 2 },
    { id: "fuel", sourcePart: "fuel", translation: [4.6, 0.1, -4.4], rotationY: 0 }
  ],
  equipmentReservations: [
    { id: "oven", rectXZ: [4.8, -1.1, 7.2, 1.55] },
    { id: "kneading", rectXZ: [-2.5, -2.3, -0.5, -1.4] },
    { id: "cooling", rectXZ: [-3.2, -0.6, -2, 2.2] },
    { id: "cooling-bread", rectXZ: [-3.2, -0.6, -2, 2.2] },
    { id: "tools", rectXZ: [7.5, -0.8, 8.1, 2.2] },
    { id: "fuel", rectXZ: [6.5, -3.1, 8.2, -1.8] },
    { id: "stores", rectXZ: [1.5, -2.5, 3.6, 2.1] }
  ],
  circulation: [
    { id: "main", rectXZ: [-1, -1.3, 1, 7] },
    { id: "kneading-approach", rectXZ: [-1.825, -1.225, 0, -0.575] },
    { id: "cooling-approach", rectXZ: [-1.975, 0.475, 0, 1.125] },
    { id: "front-apron", rectXZ: [-1, 3.5, 9.7, 5] },
    { id: "stores-approach", rectXZ: [0.6, -1.8, 1.6, 1.5] },
    { id: "oven-approach", rectXZ: [5.65, 2.675, 6.35, 4.25] },
    { id: "service", rectXZ: [8.3, -3.1, 9.7, 7] }
  ],
  workplaces: [
    { id: "kneader", centerXZ: [-1.5, -0.9], sizeXZ: [0.65, 0.65], faces: "-Z" },
    { id: "cooler", centerXZ: [-1.65, 0.8], sizeXZ: [0.65, 0.65], faces: "-X" },
    { id: "oven-worker", centerXZ: [6, 3], sizeXZ: [0.65, 0.65], faces: "-Z" }
  ],
  operations: {
    ovenHandlingXZ: [4.5, 1.55, 7.5, 4.6],
    hotEquipmentExclusionXZ: [4.5, -1.5, 7.5, 1.55],
    delivery: "hand-carried-flour-and-fuel-no-cart-or-animal-rating",
    peelHandling: "reserved-plan-sweep-no-production-animation",
    externalDependencies: ["flour", "water", "fuel"],
    supplyChainVerified: false,
    throughputVerified: false,
    completeOccupationalRow: false,
    occupationalCoverage: "bread-baking-only-not-all-confectionery",
    firePolicy: "illustrative-local-exclusion-not-a-historical-fire-code"
  },
  capacity: { workshops: 1, laborPeople: 2.5, simultaneousWorkplaces: 3, dwellings: 0, netResidentialAreaM2: 0 },
  status: "CE-explicit-reservation-only"
} as const;

export function bakehouseFloorHeight(z: number): number {
  return z > 5 ? Math.max(0, ((7 - z) * 0.15) / 2) : 0.15;
}
