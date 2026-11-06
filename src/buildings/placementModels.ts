import * as THREE from "three";
import { adoptedDefinition } from "../city3d/adoption";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import type { BvDefinition } from "../city3d/three/bvInstances";
import { createStructureMassing } from "../city3d/three/structureMeshes";
import { BUILDING_APPEARANCE_PROFILES } from "./appearance/types";
import { createRegionalHouse, defaultRegionalHouseSpec } from "./houses/regionalHouses";
import { models as marketStalls } from "./medieval/06-market-stallsModels";
import { models as breweries } from "./medieval/15-breweriesModels";
import { models as civicHalls } from "./medieval/26-civic-hallsModels";
import { models as clothHalls } from "./medieval/27-cloth-hallsModels";
import { models as potteries } from "./medieval/34-pottery-workshopsModels";
import { models as printers } from "./medieval/38-printing-modelsModels";
import { models as tradeHalls } from "./medieval/48-trade-guild-hallsModels";
import { models as marketHalls } from "./medieval/49-market-guild-hallsModels";
import { models as workhomeShells } from "./medieval/50-workhome-shellsModels";
import { models as workhomes } from "./medieval/51-trade-workhomesModels";
import { models as bakehouses } from "./medieval/52-dedicated-bakehousesModels";
import { models as smithies } from "./medieval/53-dedicated-smithiesModels";
import { models as coopers } from "./medieval/54-dedicated-cooperageModels";
import { models as tanneries } from "./medieval/55-dedicated-tanneriesModels";
import { models as ropeworks } from "./medieval/56-ropeworksModels";
import { models as butcheries } from "./medieval/57-butcheryModels";
import { models as townTrades } from "./medieval/58-town-tradesModels";
import { isMarketPalette, type MarketPalette } from "./medieval/marketAppearance";
import {
  isMarketModel,
  type MarketActivity,
  type MarketDetail,
  packedMarketPitch
} from "./medieval/marketPresentation";
import { objectDrawing, PLACEABLE_OBJECTS, placeableObject } from "./placeableObjects";
import type { PlacementQuality } from "./placementContract";
import { axisBoxFromBounds, type FootprintBox, footprintBox } from "./placementContract";
import type { BuildingRecord } from "./record";

const catalogueRecords = Object.values(
  import.meta.glob<BuildingRecord>("./catalogue/*.json", { eager: true, import: "default" })
);

export interface PlacementCatalogItem {
  id: string;
  category: string;
  name: string;
}

interface PlacementSource {
  item: PlacementCatalogItem;
  definition: BvDefinition | null;
  qualities?: Partial<Record<PlacementQuality, BvDefinition>>;
  footprint: (quality?: PlacementQuality) => FootprintBox;
}

const footprints = new Map<string, FootprintBox>();
const paletteDefinitions = new Map<string, BvDefinition>();

export function placementPalette(id: string, requested?: MarketPalette): MarketPalette | undefined {
  return marketStalls.find(model => model.id === id)?.appearances
    ? isMarketPalette(requested)
      ? requested
      : "ochre"
    : undefined;
}

function measured(definition: BvDefinition): FootprintBox {
  const cached = footprints.get(definition.id);
  if (cached) return cached;
  const model = definition.create();
  try {
    const box = new THREE.Box3().setFromObject(model.group, true);
    const footprint = footprintBox(axisBoxFromBounds(box));
    footprints.set(definition.id, footprint);
    return footprint;
  } finally {
    model.dispose();
  }
}

const houseProfiles = BUILDING_APPEARANCE_PROFILES.filter(profile => profile !== "legacy");

const sources = new Map<string, PlacementSource>();

for (const profile of houseProfiles) {
  const id = `house:${profile}`;
  const definition: BvDefinition = {
    id,
    create: () => createRegionalHouse(defaultRegionalHouseSpec(profile, 0), "low")
  };
  sources.set(id, {
    item: { id, category: "Houses", name: profile.replaceAll("-", " ") },
    definition,
    footprint: () => measured(definition)
  });
}

for (const record of catalogueRecords) {
  const id = `catalogue:${record.id}`;
  const definition: BvDefinition = {
    id,
    create: () => createStructureMassing(catalogueMassing(record))
  };
  sources.set(id, {
    item: { id, category: record.kind, name: record.name },
    definition,
    footprint: () => measured(definition)
  });
}

for (const object of PLACEABLE_OBJECTS) {
  sources.set(object.id, {
    item: { id: object.id, category: object.category, name: object.name },
    definition: null,
    footprint: () => {
      const cached = footprints.get(object.id);
      if (cached) return cached;
      const footprint = footprintBox(axisBoxFromBounds(objectDrawing(object).bounds));
      footprints.set(object.id, footprint);
      return footprint;
    }
  });
}

for (const model of [
  ...marketStalls,
  ...breweries,
  ...potteries,
  ...printers.filter(m => m.id === "early-printing-workshop"),
  ...civicHalls,
  ...clothHalls,
  ...tradeHalls,
  ...marketHalls,
  ...workhomeShells,
  ...workhomes,
  ...bakehouses,
  ...smithies,
  ...coopers,
  ...tanneries,
  ...ropeworks,
  ...butcheries,
  ...townTrades
]) {
  const qualities = Object.fromEntries(
    (["low", "high"] as const).map(level => [
      level,
      adoptedDefinition(model.variants!, `medieval.${model.id}`, `${model.id}:${level}`, { level })
    ])
  );
  sources.set(model.id, {
    item: {
      id: model.id,
      category: model.task >= 48 ? "Trade facilities" : model.task === 6 ? "Market stalls" : "Market halls",
      name: model.name
    },
    definition: qualities.high,
    qualities,
    footprint: quality => measured(qualities[quality === "low" ? "low" : "high"])
  });
}

/** Explicit tiers supported by a placement; existing objects keep their compatibility defaults. */
export function placementQualities(id: string): readonly PlacementQuality[] {
  return Object.keys(sources.get(id)?.qualities ?? {}) as PlacementQuality[];
}

/** Missing or unavailable market tiers resolve to High; other models keep their existing defaults. */
export function placementQuality(id: string, requested?: PlacementQuality): PlacementQuality | undefined {
  const available = placementQualities(id);
  return available.length ? (requested && available.includes(requested) ? requested : "high") : undefined;
}

export function placementCatalog(): readonly PlacementCatalogItem[] {
  return [...sources.values()].map(source => source.item);
}

export function placementFootprint(id: string, quality?: PlacementQuality): FootprintBox | null {
  return sources.get(id)?.footprint(quality) ?? null;
}

/** Mesh factory for models that are not already placeable objects. Placeable objects keep their adopted variants. */
export function placementDefinition(
  id: string,
  quality?: PlacementQuality,
  palette?: MarketPalette,
  presentation?: { activity?: MarketActivity; detail?: MarketDetail }
): BvDefinition | null {
  if (placeableObject(id)) return null;
  if (packedMarketPitch(id, presentation?.activity)) return null;
  const source = sources.get(id);
  const level = placementQuality(id, quality);
  const definition = (level ? source?.qualities?.[level] : source?.definition) ?? null;
  const appearance = placementPalette(id, palette);
  const custom = isMarketModel(id) && (presentation?.activity === "closed" || presentation?.detail === "distant");
  if (!definition || (!custom && (!appearance || appearance === "ochre"))) return definition;
  const key = `${definition.id}:${appearance ?? "ochre"}:${presentation?.activity ?? "market-day"}:${presentation?.detail ?? "near"}`;
  let result = paletteDefinitions.get(key);
  if (!result) {
    const model = marketStalls.find(model => model.id === id)!;
    result = {
      id: key,
      variant: definition.variant,
      create: () =>
        custom
          ? model.marketDisplay!.create(
              definition.variant!,
              appearance ?? "ochre",
              presentation?.activity ?? "market-day",
              presentation?.detail ?? "near"
            )
          : model.appearances!.create(definition.variant!, appearance!)
    };
    paletteDefinitions.set(key, result);
  }
  return result;
}
