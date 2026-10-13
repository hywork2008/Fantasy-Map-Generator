import { type BridgeDeck, bridgeDecks, overSkewedBridgeDecks } from "../core/bridgeDeck";
import { buildBlockFabric, type DistrictFabric } from "../core/gen/blockInfill";
import { buildCityBuildings } from "../core/gen/buildingLots";
import { computeCemeteryBoundary, layoutCemetery } from "../core/gen/cemeteryLayout";
import { polygonArea } from "../core/gen/geom";
import { buildParkLawns, type ParkLawn } from "../core/gen/parkFabric";
import { measureHousingCapacity } from "../core/gen/residentialCapacity";
import { buildWatermillPlan, type WatermillPlan } from "../core/gen/watermillFabric";
import type { CemeteryPlan, CityDocument } from "../core/types";

type Lots = ReturnType<typeof buildCityBuildings>;

/** What the town view needs to know exists, decided once before any DOM is written. */
export interface TownFacts {
  /** Null for plain layouts that have no block fabric. */
  fabric: DistrictFabric | null;
  lots: Lots;
  housing: ReturnType<typeof measureHousingCapacity> | null;
  watermills: WatermillPlan | undefined;
  parks: ParkLawn[];
}

/**
 * Read-only preparation for the town view. Never mutates `document`; block-fabric
 * reuse is owned by `buildBlockFabric`'s own cache.
 */
export function prepareTownFacts(document: CityDocument): TownFacts {
  const usesFabric =
    document.urbanMorphology ||
    document.buildingPattern === "medieval" ||
    document.fabric?.version === 5 ||
    document.gridKind === "evolution" ||
    document.layout === "circulade" ||
    document.layout === "bram" ||
    document.layout === "classic";
  const fabric = usesFabric ? buildBlockFabric(document) : null;
  const lots = fabric?.buildings ?? buildCityBuildings(document);
  const housing =
    document.urbanMorphology && document.urbanGrowth
      ? measureHousingCapacity(document, lots, document.urbanGrowth.requiredDwellings)
      : null;
  return {
    fabric,
    lots,
    housing,
    watermills: fabric?.watermills ?? buildWatermillPlan(document, lots.length),
    parks: fabric?.parks ?? buildParkLawns(document)
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
