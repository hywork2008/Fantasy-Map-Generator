/** Spatial design v1; craft references do not establish medieval dimensions or production rates. */
export const DEDICATED_COOPER = {
  formId: "dedicated-cooperage",
  placementSpecVersion: 1,
  equipmentLayoutVersion: 1,
  coordinateFrame: { origin: "operating-yard-ground-origin", front: "+Z", up: "+Y", metersPerUnit: 1 },
  envelope: { min: [-8, 0, -6], max: [8, 4.6, 7] },
  siteXZ: [-8, -6, 8, 7],
  floorElevation: 0.12,
  ramps: [{ rectXZ: [-8, 5, 8, 7], rise: 0.12, run: 2, end: "front" }],
  ports: [
    { id: "main", position: [-1.7, 0, 7], normalXZ: [0, 1], clearWidth: 1.2, clearHeight: 2.2 },
    { id: "seasoned-stock", position: [-6.8, 0, 7], normalXZ: [0, 1], clearWidth: 1.2, clearHeight: 2.2 },
    { id: "empty-cask", position: [2.2, 0, 7], normalXZ: [0, 1], clearWidth: 2.4, clearHeight: 2.2 }
  ],
  componentBoundsIncludeEmptySpace: true,
  componentBounds: [
    { id: "shaping", rectXZ: [-5.9, -3.4, -3.1, -2.0] },
    { id: "assembly", rectXZ: [-1.55, -3.45, 0.15, -1.75] },
    { id: "heading", rectXZ: [-5.95, 0.8, -3.25, 2.2] },
    { id: "hoops", rectXZ: [0.1, -4.8, 1.3, -3.6] },
    { id: "seasoned-stock", rectXZ: [-7.8, -4.8, -6.4, 3.8] },
    { id: "finished-stock", rectXZ: [3.6, 3.2, 7, 5] },
    { id: "heat-bending", rectXZ: [4.2, -4.4, 6.8, -1.6] }
  ],
  circulation: [
    { id: "main", rectXZ: [-2.3, 2, -1.1, 7] },
    { id: "front-crossing", rectXZ: [-7.4, 4, 3.2, 5.3] },
    { id: "stock-entry", rectXZ: [-7.4, 3.9, -6.2, 7] },
    { id: "shaping", rectXZ: [-5.1, -2, -3.9, -0.7] },
    { id: "work-crossing", rectXZ: [-5.2, -0.9, 0, 0.3] },
    { id: "assembly", rectXZ: [-1.3, -1.6, -0.1, 2.7] },
    { id: "heading", rectXZ: [-3.2, 0.7, -1.8, 2.8] },
    { id: "heading-front", rectXZ: [-5.8, 2.25, -1.8, 3.45] },
    { id: "jointer-side", rectXZ: [-3, -4.9, -1.8, 0.2] },
    { id: "jointer-rear", rectXZ: [-5.1, -4.9, -1.8, -3.6] },
    { id: "hoop-approach", rectXZ: [0.3, -3.5, 1.1, -0.4] },
    { id: "assembly-side", rectXZ: [-1.3, -1.6, 1.2, -0.4] },
    { id: "empty-cask", rectXZ: [1, -0.4, 3.4, 7] },
    { id: "yard-crossing", rectXZ: [1, 0.8, 6.9, 3.15] },
    { id: "heat-approach", rectXZ: [4.9, -0.7, 6.1, 2.9] }
  ],
  workplaces: [
    { id: "stave-worker", centerXZ: [-4.5, -1.65], sizeXZ: [0.65, 0.65], height: 1.8 },
    { id: "assembly-worker", centerXZ: [-0.7, -1.2], sizeXZ: [0.65, 0.65], height: 1.8 },
    { id: "heading-worker", centerXZ: [-2.85, 1.3], sizeXZ: [0.65, 0.65], height: 1.8 }
  ],
  handling: {
    mode: "empty-upright-cask-on-level-pad-no-loaded-cask-or-cart-rating",
    stagingPickupXZ: [4.5, 2.5],
    turnCenterXZ: [1.7, 2.5],
    handlerTurnRadius: 1.25,
    travelCenterX: 1.7,
    testedCenterZ: [0.5, 6.3],
    caskRadius: 0.65,
    caskHeight: 1.4,
    handlerCenterX: 2.95,
    handlerWidth: 0.65,
    routeWidth: 2.4,
    crossingTrafficVerified: false,
    rampRollingDynamicsVerified: false
  },
  operations: {
    hotEquipmentExclusionXZ: [3.6, -5, 7.4, -0.8],
    alternateShapingWorkplace: { centerXZ: [-4.5, -4], sizeXZ: [0.65, 0.65], height: 1.8 },
    alternateHeadingWorkplace: { centerXZ: [-4.6, 2.6], sizeXZ: [0.65, 0.65], height: 1.8 },
    alternateStationsReuseAssignedWorkers: true,
    alternateHeatWorkplace: { centerXZ: [5.5, 0.2], sizeXZ: [0.65, 0.65], height: 1.8 },
    heatWorkplaceReusesAssemblyWorker: true,
    heatAndDispatchSchedulingVerified: false,
    readySeasonedStockOnly: true,
    longTermSeasoningOnSite: false,
    externalDependencies: ["seasoned-staves-and-head-boards", "hoop-stock", "water", "fuel"],
    waterAndWasteConnectionVerified: false,
    occupationalCoverage: "cask-forming-and-fitting-spatial-study",
    completeOccupationalRow: false,
    supplyChainVerified: false,
    throughputVerified: false,
    processMotionVerified: false,
    firePolicy: "illustrative-local-exclusion-not-a-historical-fire-code"
  },
  capacity: { workshops: 1, laborPeople: 2.5, simultaneousWorkplaces: 3, dwellings: 0, netResidentialAreaM2: 0 },
  status: "CE-explicit-spatial-reservation-only"
} as const;
export function cooperFloorHeight(z: number) {
  return z > 5 ? Math.max(0, (7 - z) * 0.06) : 0.12;
}
