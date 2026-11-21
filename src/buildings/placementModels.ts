import * as THREE from "three";
import { adoptedDefinition } from "../city3d/adoption";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import type { BvDefinition } from "../city3d/three/bvInstances";
import { createStructureMassing } from "../city3d/three/structureMeshes";
import { BUILDING_APPEARANCE_PROFILES } from "./appearance/types";
import { createRegionalHouse, defaultRegionalHouseSpec } from "./houses/regionalHouses";
import { models as marketStalls } from "./medieval/06-market-stallsModels";
import { models as parishChurches } from "./medieval/14-parish-churchesModels";
import { models as townChurches } from "./medieval/14-town-churchesModels";
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
import { models as rearWorks } from "./medieval/58-rear-worksModels";
import { models as townTrades } from "./medieval/58-town-tradesModels";
import { models as squareFurniture } from "./medieval/59-market-square-furnitureModels";
import { models as churchyardFurniture } from "./medieval/60-churchyard-furnitureModels";
import { models as horseMills } from "./medieval/61-horse-millsModels";
import { isMarketPalette, type MarketPalette } from "./medieval/marketAppearance";
import {
  isMarketModel,
  type MarketActivity,
  type MarketDetail,
  packedMarketPitch
} from "./medieval/marketPresentation";
import { createOpusGuildHouse } from "./medieval/opusGuildHouse";
import {
  type OpusGuildHouseExterior,
  opusGuildHouseModel,
  opusGuildHouseSpecKey,
  opusGuildHouseSpecOf
} from "./medieval/opusGuildHouseProfiles";
import { createOpusRearWorks } from "./medieval/opusRearWorks";
import {
  type OpusRearWorksExterior,
  opusRearWorksModel,
  opusRearWorksSpecKey,
  opusRearWorksSpecOf
} from "./medieval/opusRearWorksProfiles";
import { createOpusWorkhome } from "./medieval/opusWorkhome";
import { type OpusWorkhomeExterior, opusWorkhomeSpecKey, opusWorkhomeSpecOf } from "./medieval/opusWorkhomeProfiles";
import type { StreetHouseExterior } from "./medieval/streetHouses";
import { objectDrawing, PLACEABLE_OBJECTS, placeableObject } from "./placeableObjects";
import type { PlacementQuality } from "./placementContract";
import { axisBoxFromBounds, type FootprintBox, footprintBox } from "./placementContract";
import footprintTable from "./placementFootprints.json";
import heightTable from "./placementHeights.json";
import type { BuildingRecord } from "./record";
import { BASILICA_QUALITIES } from "./temples/basilicaTemple";
import { BASILICA_VARIANTS } from "./temples/basilicaVariants";

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

/**
 * The footprints measured once ahead (`placementFootprints.json`, kept equal to the models by
 * `placementFootprints.test.ts`): measuring builds the whole 3D model, and a generation worker starts with an empty
 * cache, so a town in facility mode spent seconds building every trade's model only to read its bounds.
 */
const measuredAhead = footprintTable as Record<string, FootprintBox>;
let measureAhead = true;

function measured(definition: BvDefinition): FootprintBox {
  const cached = footprints.get(definition.id);
  if (cached) return cached;
  const known = measureAhead ? measuredAhead[definition.id] : undefined;
  if (known) {
    footprints.set(definition.id, known);
    return known;
  }
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
  // The basilica has detailed Low and High models in the catalogue record's plan frame; the record's massing is only
  // the fallback for a CE that cannot build them.
  const qualities =
    record.id === "basilica-temple"
      ? Object.fromEntries(
          BASILICA_QUALITIES.map(level => [
            level,
            adoptedDefinition(BASILICA_VARIANTS, "temple.basilica", `basilica-temple:${level}`, { level })
          ])
        )
      : undefined;
  sources.set(id, {
    item: { id, category: record.kind, name: record.name },
    definition: qualities?.high ?? definition,
    ...(qualities ? { qualities } : {}),
    footprint: quality => measured(qualities?.[quality === "low" ? "low" : "high"] ?? definition)
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
  ...townTrades,
  ...rearWorks,
  ...parishChurches.filter(m => m.id === "village-chapel"),
  ...townChurches,
  ...squareFurniture,
  ...churchyardFurniture,
  ...horseMills
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
      category:
        model.task === 14
          ? "Churches"
          : model.task === 59 || model.task === 60
            ? "Civic furniture"
            : model.task >= 48
              ? "Trade facilities"
              : model.task === 6
                ? "Market stalls"
                : "Market halls",
      name: model.name
    },
    definition: qualities.high,
    qualities,
    footprint: model.placementEnvelope
      ? () => ({
          // Rounded as measured mesh bounds are (float32), so plots sized on the measured model stay bit-identical.
          halfX: Math.fround(model.placementEnvelope![0] / 2),
          halfZ: Math.fround(model.placementEnvelope![1] / 2),
          centerX: 0,
          centerZ: 0,
          groundY: 0
        })
      : quality => measured(qualities[quality === "low" ? "low" : "high"])
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

/** Every model footprint measured from its model, as `placementFootprints.json` holds them (tests only). */
export function measureAllPlacementFootprints(): Record<string, FootprintBox> {
  measureAhead = false;
  footprints.clear();
  try {
    for (const source of sources.values()) {
      if (!source.definition && !source.qualities) continue;
      for (const quality of [undefined, "low", "high"] as const) source.footprint(quality);
    }
    // Placeable objects are measured from their drawings, which costs nothing: only models are kept.
    const objects = new Set(PLACEABLE_OBJECTS.map(o => o.id));
    return Object.fromEntries([...footprints].filter(([id]) => !objects.has(id)).sort(([a], [b]) => (a < b ? -1 : 1)));
  } finally {
    measureAhead = true;
    footprints.clear();
  }
}

const heights = new Map<string, number>();
const heightsAhead = heightTable as Record<string, number>;
let measureHeightsAhead = true;

/**
 * A model's height as its bounds give it, measured once ahead like the footprints (`placementHeights.json`, kept equal
 * to the models by `placementFootprints.test.ts`): a BV facility records it, and a generation worker would otherwise
 * build each facility's whole model to read it.
 */
export function placementHeight(id: string, quality: PlacementQuality): number | null {
  const key = `${id}:${quality}`,
    known = heights.get(key) ?? (measureHeightsAhead ? heightsAhead[key] : undefined);
  if (known !== undefined) return known;
  const definition = placementDefinition(id, quality);
  if (!definition) return null;
  const model = definition.create();
  try {
    const height = new THREE.Box3().setFromObject(model.group, true).getSize(new THREE.Vector3()).y;
    heights.set(key, height);
    return height;
  } finally {
    model.dispose();
  }
}

/** Every BV facility height measured from its model, as `placementHeights.json` holds them (tests only). */
export function measureAllPlacementHeights(): Record<string, number> {
  measureHeightsAhead = false;
  heights.clear();
  try {
    const out: Record<string, number> = {};
    for (const [id, source] of sources) {
      if (!source.definition && !source.qualities) continue;
      const qualities = placementQualities(id);
      for (const quality of ["low", "high"] as const) {
        if (qualities.length && !qualities.includes(quality)) continue;
        const height = placementHeight(id, quality);
        if (height !== null) out[`${id}:${quality}`] = height;
      }
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  } finally {
    measureHeightsAhead = true;
    heights.clear();
  }
}

export function placementFootprint(id: string, quality?: PlacementQuality): FootprintBox | null {
  return sources.get(id)?.footprint(quality) ?? null;
}

/** Mesh factory for models that are not already placeable objects. Placeable objects keep their adopted variants. */
const workhomeDefinitions = new Map<string, BvDefinition>();
/**
 * A trade workhome's street front (docs/plan/bv-workhome-facade-variation.md §4.7): a saved exterior draws the Opus
 * shop-house it describes; "codex" draws the Codex study a placement saved before the exterior existed was sized on.
 */
function workhomeDefinition(
  id: string,
  level: PlacementQuality,
  workhome: StreetHouseExterior | "codex"
): BvDefinition | null {
  if (opusGuildHouseModel(id)) return workhome === "codex" ? null : guildHouseDefinition(id, level, workhome);
  if (opusRearWorksModel(id)) return workhome === "codex" ? null : rearWorksDefinition(id, level, workhome);
  const model = workhomes.find(m => m.id === id);
  if (!model) return null;
  const quality = level === "low" ? "low" : "high";
  if (workhome === "codex") {
    const key = `${id}:${quality}:codex`;
    let result = workhomeDefinitions.get(key);
    if (!result) {
      // A shop-house before rear works has no Codex study; it is never saved without its front.
      const variant = model.variants!.find(v => v.author === "Codex GPT-6.1 Sol" && v.level === quality);
      if (!variant) return null;
      result = { id: key, variant: variant.id, create: () => variant.create() };
      workhomeDefinitions.set(key, result);
    }
    return result;
  }
  const spec = opusWorkhomeSpecOf(id, workhome as OpusWorkhomeExterior);
  if (!spec) return null;
  const key = `${id}:${quality}:${opusWorkhomeSpecKey(spec)}`;
  let result = workhomeDefinitions.get(key);
  if (!result) {
    const variant = model.variants!.find(v => v.author === "Claude Opus 5.5" && v.level === quality)!;
    result = { id: key, variant: variant.id, create: () => createOpusWorkhome(spec, quality) };
    workhomeDefinitions.set(key, result);
  }
  return result;
}

/** A guild house's saved front draws the Opus guild house it describes (plan W5b). */
function guildHouseDefinition(id: string, level: PlacementQuality, exterior: StreetHouseExterior): BvDefinition | null {
  const spec = opusGuildHouseSpecOf(id, exterior as OpusGuildHouseExterior),
    model = tradeHalls.find(m => m.id === id);
  if (!spec || !model) return null;
  const quality = level === "low" ? "low" : "high",
    key = `${id}:${quality}:${opusGuildHouseSpecKey(spec)}`;
  let result = workhomeDefinitions.get(key);
  if (!result) {
    const variant = model.variants!.find(v => v.level === quality)!;
    result = { id: key, variant: variant.id, create: () => createOpusGuildHouse(spec, quality) };
    workhomeDefinitions.set(key, result);
  }
  return result;
}

/** A rear works' saved envelope and culture draw the shed it describes (docs/plan/ce-town-trade-rear-works.md R2). */
function rearWorksDefinition(id: string, level: PlacementQuality, exterior: StreetHouseExterior): BvDefinition | null {
  const spec = opusRearWorksSpecOf(id, exterior as OpusRearWorksExterior),
    model = rearWorks.find(m => m.id === id);
  if (!spec || !model) return null;
  const quality = level === "low" ? "low" : "high",
    key = `${id}:${quality}:${opusRearWorksSpecKey(spec)}`;
  let result = workhomeDefinitions.get(key);
  if (!result) {
    const variant = model.variants!.find(v => v.level === quality)!;
    result = { id: key, variant: variant.id, create: () => createOpusRearWorks(spec, quality) };
    workhomeDefinitions.set(key, result);
  }
  return result;
}

export function placementDefinition(
  id: string,
  quality?: PlacementQuality,
  palette?: MarketPalette,
  presentation?: {
    activity?: MarketActivity;
    detail?: MarketDetail;
    /** A street house's saved front (trade workhome or guild house), or "codex" for a workhome saved before it had
     * one. */
    workhome?: StreetHouseExterior | "codex";
  }
): BvDefinition | null {
  if (placeableObject(id)) return null;
  if (presentation?.workhome) {
    const level = placementQuality(id, quality);
    if (level) {
      const result = workhomeDefinition(id, level, presentation.workhome);
      if (result) return result;
    }
  }
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
