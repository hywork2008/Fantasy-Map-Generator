export type DedicatedSmithyForm = "smithy" | "farrier";
const commonCirculation = [
  { id: "main", rectXZ: [-0.6, 2.5, 0.6, 6], state: "both" },
  { id: "front-apron", rectXZ: [-2.5, 2.5, 4.2, 4], state: "both" },
  { id: "forge-approach", rectXZ: [-2.5, -0.5, -1.5, 3.2], state: "both" },
  { id: "anvil-approach", rectXZ: [-1.6, 0.5, -0.6, 3.2], state: "both" },
  { id: "bench-approach", rectXZ: [1.65, -1.4, 4, -0.4], state: "both" },
  { id: "materials", rectXZ: [3.1, -3.1, 4.2, 6], state: "both" },
  { id: "fuel-approach", rectXZ: [-6, -2, -4.7, 6], state: "both" },
  { id: "front-crossing", rectXZ: [-6, 3, 4.2, 4], state: "both" }
] as const;
const commonEquipment = [
  { id: "forge", rectXZ: [-3.1, -2.7, -0.9, -0.9] },
  { id: "bellows", rectXZ: [-1.3, -2.5, 1.85, -1.3] },
  { id: "anvil", rectXZ: [-0.4, 0.5, 0.85, 1.3] },
  { id: "tools", rectXZ: [-3.3, -0.5, 2.85, 2.3] },
  { id: "stores", rectXZ: [-4.7, -2.3, 5.2, 2.3] }
] as const;
/** Illustrative spatial contract, not animal handling or industrial process certification. */
export function dedicatedSmithyProfile(form: DedicatedSmithyForm) {
  const farrier = form === "farrier",
    front = farrier ? 7 : 6;
  return {
    formId: farrier ? "dedicated-farrier" : "dedicated-smithy",
    placementSpecVersion: 1,
    equipmentLayoutVersion: 1,
    coordinateFrame: { origin: "forge-shelter-authored-origin-at-ground", front: "+Z", up: "+Y", metersPerUnit: 1 },
    envelope: { min: [-6.2, 0, farrier ? -7 : -4.5], max: [farrier ? 10 : 5.5, 5.8, front] },
    siteXZ: [-6.2, farrier ? -7 : -4.5, farrier ? 10 : 5.5, front],
    floorElevation: 0.15,
    ramps: [
      { rectXZ: [-6.2, front - 2, farrier ? 10 : 5.5, front], rise: 0.15, run: 2, end: "front" },
      ...(farrier ? [{ rectXZ: [-6.2, -7, 10, -5], rise: 0.15, run: 2, end: "rear" }] : [])
    ],
    ports: [
      { id: "main", position: [0, 0, front], normalXZ: [0, 1], clearWidth: 1.2, clearHeight: 2.2 },
      { id: "materials", position: [3.65, 0, front], normalXZ: [0, 1], clearWidth: 1.1, clearHeight: 2.2 },
      { id: "fuel", position: [-5.35, 0, front], normalXZ: [0, 1], clearWidth: 1.3, clearHeight: 2.2 },
      ...(farrier
        ? [
            { id: "animal-front", position: [7, 0, 7], normalXZ: [0, 1], clearWidth: 1.8, clearHeight: 2.6 },
            { id: "animal-rear", position: [7, 0, -7], normalXZ: [0, -1], clearWidth: 1.8, clearHeight: 2.6 },
            { id: "handler-front", position: [8.85, 0, 7], normalXZ: [0, 1], clearWidth: 1, clearHeight: 2.2 },
            { id: "handler-rear", position: [8.85, 0, -7], normalXZ: [0, -1], clearWidth: 1, clearHeight: 2.2 }
          ]
        : [])
    ],
    componentBoundsIncludeEmptySpace: true,
    componentBounds: [...commonEquipment, ...(farrier ? [{ id: "stock", rectXZ: [5.7, -2.1, 8.3, 2.1] }] : [])],
    circulation: [
      ...commonCirculation.map(p => ({ ...p, rectXZ: p.rectXZ.map((n, i) => (i === 3 && n === 6 ? front : n)) })),
      ...(farrier
        ? [
            { id: "farrier-approach", rectXZ: [4.6, -0.5, 5.6, 4], state: "stationary-shoeing" },
            { id: "farrier-work", rectXZ: [4.8, -0.5, 6.3, 0.5], state: "stationary-shoeing" },
            { id: "farrier-crossing", rectXZ: [3.1, 3, 9.35, 4], state: "stationary-shoeing" },
            { id: "handler", rectXZ: [8.35, -7, 9.35, 7], state: "both" }
          ]
        : [])
    ],
    workplaces: farrier
      ? [
          { id: "forge-worker", centerXZ: [-2, -0.15], sizeXZ: [0.65, 0.65], height: 1.8, state: "stationary-shoeing" },
          { id: "farrier", centerXZ: [5.95, 0], sizeXZ: [0.65, 0.65], height: 1.4, state: "stationary-shoeing" },
          { id: "handler", centerXZ: [8.85, 0], sizeXZ: [0.65, 0.65], height: 1.8, state: "stationary-shoeing" }
        ]
      : [
          { id: "forge-worker", centerXZ: [-2, -0.15], sizeXZ: [0.65, 0.65], height: 1.8, state: "working" },
          { id: "anvil-worker", centerXZ: [-1.1, 0.9], sizeXZ: [0.65, 0.65], height: 1.8, state: "working" },
          { id: "bench-worker", centerXZ: [2, -0.9], sizeXZ: [0.65, 0.65], height: 1.8, state: "working" }
        ],
    animal: farrier
      ? {
          travelXZ: [6.1, -7, 7.9, 7],
          bodySize: [1, 2.4, 2.6],
          stationaryCenterXZ: [7, 0],
          testedTravelCenterZ: [-5.5, 5.5],
          frontAndRearExternalContinuationRequired: true,
          movementDuringShoeing: false,
          hoofMotionAndRestraintVerified: false
        }
      : null,
    operations: {
      hotEquipmentExclusionXZ: [-3.4, -2.85, -0.6, -0.65],
      hotMetalTransferXZ: [-2.6, -0.65, 0.9, 1.6],
      hammerWorkingXZ: [-1.6, 0.3, 1.1, 2.3],
      quenchZoneXZ: [1, 1.5, 1.8, 2.3],
      externalDependencies: ["iron-stock", "charcoal", "water"],
      delivery: "hand-carried-materials-no-cart-rating",
      occupationalCoverage: farrier ? "farriery-only" : "general-forging-only",
      completeOccupationalRow: false,
      supplyChainVerified: false,
      throughputVerified: false,
      processMotionVerified: false,
      firePolicy: "illustrative-local-exclusion-not-a-historical-fire-code",
      smithingPoolSplit: "explicit-assignment-required-not-six-of-each-form"
    },
    capacity: { workshops: 1, laborPeople: 2.5, simultaneousWorkplaces: 3, dwellings: 0, netResidentialAreaM2: 0 },
    status: "CE-explicit-spatial-reservation-only"
  };
}
export function smithyFloorHeight(form: DedicatedSmithyForm, z: number) {
  const front = form === "farrier" ? 7 : 6;
  if (z > front - 2) return Math.max(0, (front - z) * 0.075);
  if (form === "farrier" && z < -5) return Math.max(0, (z + 7) * 0.075);
  return 0.15;
}
