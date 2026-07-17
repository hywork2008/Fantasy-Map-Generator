import type { DataTopic } from "./worldRuntime";

export type DataOwner = "map" | "simulation" | "presentation" | `extension:${string}`;
export type DeletePolicy = "cascade" | "orphan" | "reassign" | "preserve" | "not-applicable";

/**
 * Mechanical Phase 8 inventory for legacy backing-store fields.
 *
 * A path may name a field group only when its members have inseparable
 * topology lifetime (for example a CSR column and its offsets). Dynamic
 * simulation fields and extension compatibility fields stay individual so
 * their adapters can be checked for coverage.
 */
export interface DataFieldOwnership {
  readonly path: string;
  readonly owner: DataOwner;
  readonly topic: DataTopic;
  readonly stableId: string | null;
  readonly foreignKeys: readonly string[];
  readonly deletePolicy: DeletePolicy;
}

const map = (
  path: string,
  topic: Extract<DataTopic, `map.${string}`>,
  stableId: string | null = null,
  foreignKeys: readonly string[] = [],
  deletePolicy: DeletePolicy = "not-applicable"
): DataFieldOwnership => ({ path, owner: "map", topic, stableId, foreignKeys, deletePolicy });

const simulation = (
  path: string,
  topic: Extract<DataTopic, `simulation.${string}`>,
  stableId: string | null = null,
  foreignKeys: readonly string[] = [],
  deletePolicy: DeletePolicy = "not-applicable"
): DataFieldOwnership => ({ path, owner: "simulation", topic, stableId, foreignKeys, deletePolicy });

const extension = (path: string, extensionId: string, stableId: string | null = null): DataFieldOwnership => ({
  path,
  owner: `extension:${extensionId}`,
  topic: `extension.${extensionId}`,
  stableId,
  foreignKeys: [],
  deletePolicy: "preserve"
});

export const DATA_FIELD_OWNERSHIP: readonly DataFieldOwnership[] = [
  map("world.seed", "map.identity"),
  map("world.mapId", "map.identity"),
  map("world.graphWidth", "map.identity"),
  map("world.graphHeight", "map.identity"),
  map("world.mapHistory", "map.identity"),
  map("world.options", "map.identity"),
  map("world.biomesData", "map.physical"),
  map("world.nameBases", "map.annotations"),
  map("world.notes", "map.annotations", "note.id", [], "cascade"),
  map("world.mapCoordinates", "map.identity"),
  map("world.urbanization", "map.identity"),
  map("world.urbanDensity", "map.identity"),
  map("world.populationRate", "map.identity"),
  map("world.distanceScale", "map.identity"),

  map("grid.identity", "map.topology"),
  map("grid.boundary", "map.topology"),
  map("grid.points", "map.topology", "grid-cell.id"),
  map("grid.cells.{i,c,v}", "map.topology", "grid-cell.id"),
  map("grid.vertices", "map.topology", "grid-vertex.id"),
  map("grid.features", "map.topology", "feature.id", [], "cascade"),
  map("grid.cells.{h,t,f}", "map.physical", "grid-cell.id"),
  map("grid.cells.{temp,prec}", "map.physical", "grid-cell.id"),

  map("pack.cells.{i,c,v,p,b,q,g}", "map.topology", "cell.id"),
  map("pack.vertices.{i,c,v,x,y,p}", "map.topology", "vertex.id"),
  map("pack.cells.{h,t,f,fl,s,conf,haven,biome,harbor,enclosure}", "map.physical", "cell.id"),
  map(
    "pack.cells.{culture,religion,state,province,burg}",
    "map.politics",
    "cell.id",
    ["culture.id", "religion.id", "state.id", "province.id", "burg.id"],
    "reassign"
  ),
  map("pack.cells.r", "map.networks", "cell.id", ["river.id"], "reassign"),
  map("pack.cells.routes", "map.networks", "cell.id", ["route.id"], "cascade"),
  simulation("pack.cells.pop", "simulation.cells", "cell.id"),
  simulation("pack.cells.capacity", "simulation.cells", "cell.id"),
  simulation("pack.cells.children", "simulation.cells", "cell.id"),
  simulation("pack.cells.maleAdults", "simulation.cells", "cell.id"),
  simulation("pack.cells.femaleAdults", "simulation.cells", "cell.id"),
  simulation("pack.cells.elders", "simulation.cells", "cell.id"),
  simulation("pack.cells.danger", "simulation.cells", "cell.id"),

  map("pack.features", "map.topology", "feature.id", ["cell.id", "vertex.id"], "cascade"),
  map("pack.rivers", "map.networks", "river.id", ["cell.id", "feature.id"], "cascade"),
  map("pack.routes", "map.networks", "route.id", ["cell.id", "feature.id"], "cascade"),
  map("pack.ice", "map.physical", "ice.id", ["cell.id"], "cascade"),
  map("pack.markers", "map.annotations", "marker.id", ["cell.id"], "cascade"),
  map("pack.zones", "map.annotations", "zone.id", ["cell.id"], "cascade"),
  map("pack.frontierForts", "map.settlements", "frontier-fort.id", ["state.id", "cell.id"], "cascade"),
  map("pack.monsters", "map.annotations", "monster.id", ["cell.id"], "cascade"),
  map("pack.cultures", "map.politics", "culture.id", ["cell.id"], "reassign"),
  map("pack.religions", "map.politics", "religion.id", ["cell.id"], "reassign"),
  map("pack.provinces", "map.politics", "province.id", ["state.id", "burg.id", "cell.id"], "cascade"),
  map("pack.states.definition", "map.politics", "state.id", ["burg.id", "culture.id", "cell.id"], "cascade"),
  simulation("pack.states.alert", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.salesTax", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.pollTax", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.treasury", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.tributeRate", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.tributePaid", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.manpowerReconciled", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.foodStress", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.plantingExposure", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.harvestExposure", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.agricultureCarryOver", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.agricultureYear", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.supplyStrain", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.foodStock", "simulation.states", "state.id", ["state.id"]),
  simulation("pack.states.military", "simulation.military", "regiment.id", ["state.id", "cell.id", "province.id"]),
  map("pack.burgs.definition", "map.settlements", "burg.id", ["cell.id", "state.id", "province.id"], "cascade"),
  simulation("pack.burgs.population", "simulation.burgs", "burg.id", ["burg.id"]),
  simulation("pack.burgs.product", "simulation.burgs", "burg.id", ["burg.id"]),
  simulation("pack.burgs.treasury", "simulation.burgs", "burg.id", ["burg.id"]),
  simulation("pack.burgs.demographics", "simulation.burgs", "burg.id", ["burg.id"]),

  simulation("simulation.clock", "simulation.clock"),
  simulation("simulation.rng", "simulation.rng"),
  simulation("simulation.intelligence", "simulation.states", "state.id", ["state.id"]),
  simulation("simulation.strategicGoals", "simulation.military", "state.id", ["burg.id", "state.id"]),
  extension("simulation.extensions.characters.characters", "characters", "character.id"),
  extension("simulation.extensions.economy.goods", "economy", "good.id"),
  extension("simulation.extensions.economy.markets", "economy", "market.id"),
  extension("simulation.extensions.economy.deals", "economy", "deal.id"),
  extension("simulation.extensions.economy.caravans", "economy", "caravan.id"),
  extension("simulation.extensions.economy.nextCaravanId", "economy"),
  extension("simulation.extensions.economy.burgMarketLedgers", "economy", "burg.id"),
  extension("simulation.extensions.economy.merchantOrganizations", "economy", "merchant-organization.id"),
  extension("simulation.extensions.economy.strategicProcurementOrders", "economy", "procurement-order.id"),
  extension("simulation.extensions.economy.strategicGoodsPolicies", "economy", "state.id"),
  extension("simulation.extensions.economy.nextStrategicProcurementOrderId", "economy"),
  extension("simulation.extensions.economy.strategicLaborMarkets", "economy", "market.id"),
  extension("simulation.extensions.economy.good", "economy", "cell.id"),
  extension("simulation.extensions.economy.market", "economy", "cell.id"),
  extension("simulation.extensions.nobility", "nobility"),
  extension("simulation.extensions.shipbuilding", "shipbuilding"),

  {
    path: "presentation.styles",
    owner: "presentation",
    topic: "presentation.styles",
    stableId: null,
    foreignKeys: [],
    deletePolicy: "not-applicable"
  },
  {
    path: "presentation.activeLayers",
    owner: "presentation",
    topic: "presentation.layers",
    stableId: "layer.id",
    foreignKeys: [],
    deletePolicy: "cascade"
  },
  {
    path: "presentation.labels",
    owner: "presentation",
    topic: "presentation.labels",
    stableId: "feature.id",
    foreignKeys: ["feature.id"],
    deletePolicy: "cascade"
  },
  {
    path: "presentation.overlays",
    owner: "presentation",
    topic: "presentation.overlays",
    stableId: "overlay.id",
    foreignKeys: [],
    deletePolicy: "cascade"
  }
];

export function findFieldOwnership(path: string): DataFieldOwnership | undefined {
  return DATA_FIELD_OWNERSHIP.find(field => field.path === path);
}
