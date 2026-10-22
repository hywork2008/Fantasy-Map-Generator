import { buildBlockFabric, type DistrictFabric, documentFabricFingerprint } from "../generators/blockInfill";
import { type BridgeDeck, bridgeDecks, overSkewedBridgeDecks } from "../generators/bridgeDeck";
import { buildCityBuildings } from "../generators/buildingLots";
import { computeCemeteryBoundary, layoutCemetery } from "../generators/cemeteryLayout";
import { polygonArea } from "../generators/geom";
import { buildParkLawns, type ParkLawn } from "../generators/parkFabric";
import { populationHousingFacts } from "../generators/populationHousing";
import { measureHousingCapacity } from "../generators/residentialCapacity";
import { ruralFieldOverlay } from "../generators/ruralFieldOverlay";
import { buildWatermillPlan, type WatermillPlan } from "../generators/watermillFabric";
import type { CemeteryPlan, CityDocument } from "../types/document";

type Lots = ReturnType<typeof buildCityBuildings>;

/** What the town view needs to know exists, decided once before any DOM is written. */
export interface TownFacts {
  /** Null for plain layouts that have no block fabric. */
  fabric: DistrictFabric | null;
  lots: Lots;
  housing: ReturnType<typeof measureHousingCapacity> | null;
  populationReport?: import("../types/contracts/population").PopulationReport;
  populationClusters?: import("../types/contracts/population").ResidentialCluster[];
  watermills: WatermillPlan | undefined;
  parks: ParkLawn[];
}

/**
 * Read-only preparation for the town view. Never mutates `document`; block-fabric
 * reuse is owned by `buildBlockFabric`'s own cache.
 */
export function prepareTownFacts(document: CityDocument, mark?: (phase: string) => void): TownFacts {
  const usesFabric =
    document.populationPlan ||
    document.urbanMorphology ||
    document.buildingPattern === "medieval" ||
    document.fabric?.version === 5 ||
    document.gridKind === "evolution" ||
    document.layout === "circulade" ||
    document.layout === "bram" ||
    document.layout === "classic";
  const fabric: DistrictFabric | null = usesFabric
    ? buildBlockFabric(document)
    : document.ruralFieldVersion === 2
      ? {
          buildings: buildCityBuildings(document),
          farms: [],
          lanes: [],
          entrances: new Map(),
          ...ruralFieldOverlay(document, documentFabricFingerprint(document))
        }
      : null;
  mark?.("town-fabric");
  const lots = fabric?.buildings ?? buildCityBuildings(document);
  const housing = document.populationPlan
    ? measureHousingCapacity(document, lots, document.populationPlan.requiredDwellings)
    : document.urbanMorphology && document.urbanGrowth
      ? measureHousingCapacity(document, lots, document.urbanGrowth.requiredDwellings)
      : null;
  mark?.("housing-capacity");
  const population = document.populationPlan && fabric ? populationHousingFacts(document, fabric) : undefined;
  mark?.("population-facts");
  const watermills = fabric?.watermills ?? buildWatermillPlan(document, lots.length);
  const parks = fabric?.parks ?? buildParkLawns(document);
  mark?.("town-landscape");
  return {
    ...(population
      ? { populationReport: population.populationReport, populationClusters: population.residentialClusters }
      : {}),
    fabric,
    lots,
    housing,
    watermills,
    parks
  };
}

/** Bridges that may be drawn. AGENTS.md: a bridge beyond the skew allowance is never drawn. */
export function drawableBridgeDecks(document: CityDocument): BridgeDeck[] {
  const decks = bridgeDecks(document);
  const overSkewed = new Set(overSkewedBridgeDecks(document, undefined, decks));
  return decks.filter(deck => !overSkewed.has(deck));
}

/** Stored cemetery plans, or plans derived on the fly from cemetery-ward faces. Never mutates `document`. */
export function resolveCemeteryPlans(document: CityDocument): CemeteryPlan[] {
  if (document.cemeteries) return document.cemeteries;
  const generated: CemeteryPlan[] = [];
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.ward === "cemetery") {
      const boundary = computeCemeteryBoundary(document, face);
      const area = Math.abs(polygonArea(boundary));
      const period = document.historicalPeriod;
      const isModern = period === "preIndustrialEra" || period === "steamEra" || period === "industrialChemistryEra";
      const form: CemeteryPlan["form"] = isModern || area < 750 ? "field" : "churchyard";
      const plan: CemeteryPlan = {
        id: `cemetery:${face.id}`,
        version: 1,
        seed: `cemetery-${face.id}`,
        form,
        faceId: face.id,
        boundary,
        courtyards: [],
        parts: [],
        accesses: [],
        trees: [],
        burialProfile: document.burialProfile,
        provenance: "generated",
        locked: false
      };
      const layout = layoutCemetery(document, plan);
      if (layout) generated.push(layout);
    }
  }
  return generated;
}
