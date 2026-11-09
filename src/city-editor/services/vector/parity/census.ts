import { cachedForestPlan } from "../../../generators/forestPlan";
import { drawableBridgeDecks, prepareTownFacts } from "../../../renderers/townFacts";
import type { CityDocument } from "../../../types/document";
import type { VectorCityDocument } from "../../../types/vector/document";

/**
 * Element kinds that both editors are expected to generate from the same settings (feature parity, P0).
 * Values are counts unless noted; `null` means the document form has no such element at all. Positions and
 * shapes are not compared: meshless differs from the mesh editor only by not following cells.
 */
export interface ParityCensus {
  wallCircuits: number;
  wallPaths: number;
  gates: number;
  roads: number;
  rivers: number;
  bridges: number;
  castles: number;
  bastionedTown: number;
  plazas: number;
  temples: number;
  markets: number;
  cemeteries: number;
  harbors: number;
  ships: number;
  parks: number;
  farms: number;
  forests: number;
  landmarks: number;
  houses: number;
  facilities: number;
  targetPopulation: number;
  assignedPopulation: number;
  unplacedPopulation: number;
  /** Mesh: automatic woodland area derived for display. Meshless: forest regions and features. */
  forestAreaM2?: number;
  /** Street layout: the mesh editor's layout setting, or meshless's skeleton generator. */
  layout: string;
  /** District uses or wards, by name. */
  uses: Record<string, number>;
}

const tally = (values: string[]) => {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
};

export function meshCensus(doc: CityDocument): ParityCensus {
  const groups = tally(doc.featureGroups.map(g => g.kind)),
    elements = tally(doc.elements.map(e => e.kind)),
    wards = tally(Object.values(doc.mesh.faces).map(f => String(f.properties.ward ?? "none")));
  const housing = doc.housingCapacity,
    // Automatic woodland is derived for display from the district fabric, as the mesh editor draws it.
    fabric = prepareTownFacts(doc).fabric,
    forest = fabric ? cachedForestPlan(doc, fabric) : undefined;
  return {
    wallCircuits: doc.defenseCircuits?.length ?? 0,
    wallPaths: groups.wall ?? 0,
    gates: doc.gates.length,
    roads: groups.road ?? 0,
    rivers: groups.river ?? 0,
    bridges: drawableBridgeDecks(doc).length,
    castles: (doc.castles?.length ?? 0) + (elements.citadel ?? 0),
    bastionedTown: doc.bastionedTown ? 1 : 0,
    plazas: elements.plaza ?? 0,
    temples: elements.temple ?? 0,
    markets: doc.markets?.length ?? (wards.market ? 1 : 0),
    cemeteries: doc.cemeteries?.length ?? 0,
    harbors: (elements.harbor ?? 0) + (wards.harbor ? 1 : 0),
    ships: elements.ship ?? 0,
    parks: wards.park ?? 0,
    farms: doc.ruralFieldSnapshot?.farms.length ?? 0,
    forests: forest?.regions.length ?? 0,
    landmarks: doc.landmarks?.length ?? 0,
    houses: housing ? housing.buildingsInside + housing.buildingsOutside : 0,
    facilities: Object.values(doc.facilityCounts ?? {}).reduce((n, c) => n + (c ?? 0), 0),
    targetPopulation: doc.populationReport?.targetPopulation ?? 0,
    assignedPopulation: doc.populationReport?.assignedPopulation ?? 0,
    unplacedPopulation: doc.populationReport?.unplacedPopulation ?? 0,
    forestAreaM2: Math.round(forest?.areaM2 ?? 0),
    layout: doc.bastionedTown ? "bastioned" : (doc.layout ?? "organic"),
    uses: wards
  };
}

export function vectorCensus(doc: VectorCityDocument): ParityCensus {
  const roles = tally(Object.values(doc.paths).map(p => p.role)),
    owned = new Set(doc.urban?.ownedPaths ?? []),
    features = tally(Object.values(doc.environment?.features ?? {}).map(f => f.kind)),
    regions = tally(Object.values(doc.regions).map(r => r.kind)),
    buildings = tally(Object.values(doc.placements).map(p => p.building?.kind ?? "none"));
  const fabricHouses = Object.values(doc.fabric?.cells ?? {}).reduce((n, c) => n + c.houses.offsets.length, 0),
    report = doc.urban?.report;
  return {
    wallCircuits: Object.keys(doc.connections.circuits).length,
    wallPaths: roles.wall ?? 0,
    gates: Object.keys(doc.connections.gates).length,
    roads: Object.values(doc.paths).filter(p => p.role === "road" && !owned.has(p.id)).length,
    rivers: roles.river ?? 0,
    bridges: Object.keys(doc.connections.bridges).length,
    castles: features.castle ?? 0,
    bastionedTown: Object.keys(doc.environment?.defenses ?? {}).length + (features.bastion ?? 0),
    plazas: Object.values(doc.environment?.features ?? {}).filter(f => f.id === "feature:civic-plaza").length,
    temples: features.temple ?? 0,
    markets: Object.values(doc.environment?.features ?? {}).filter(
      f => f.kind === "market" && f.id !== "feature:civic-plaza"
    ).length,
    cemeteries: (features.cemetery ?? 0) + (regions.cemetery ?? 0),
    harbors: (features.harbor ?? 0) + (doc.environment?.harbor ? 1 : 0),
    ships: doc.environment?.harbor?.ships.length ?? 0,
    parks: (features.park ?? 0) + (regions.park ?? 0),
    farms: (features.farm ?? 0) + (regions.farm ?? 0),
    forests: (features.forest ?? 0) + (regions.forest ?? 0),
    landmarks: buildings.landmark ?? 0,
    houses: fabricHouses + (buildings.housing ?? 0),
    facilities: buildings.facility ?? 0,
    targetPopulation: report?.targetPopulation ?? doc.context.targetPopulation ?? 0,
    assignedPopulation: report?.assignedPopulation ?? 0,
    unplacedPopulation: report?.unplacedPopulation ?? 0,
    layout: "skeleton",
    uses: tally((doc.urban?.districts ?? []).map(d => d.use))
  };
}
