import * as THREE from "three";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import type { BvDefinition } from "../city3d/three/bvInstances";
import { createStructureMassing } from "../city3d/three/structureMeshes";
import { BUILDING_APPEARANCE_PROFILES } from "./appearance/types";
import { createRegionalHouse, defaultRegionalHouseSpec } from "./houses/regionalHouses";
import { objectDrawing, PLACEABLE_OBJECTS, placeableObject } from "./placeableObjects";
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
  footprint: () => FootprintBox;
}

const footprints = new Map<string, FootprintBox>();

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

export function placementCatalog(): readonly PlacementCatalogItem[] {
  return [...sources.values()].map(source => source.item);
}

export function placementFootprint(id: string): FootprintBox | null {
  return sources.get(id)?.footprint() ?? null;
}

/** Mesh factory for models that are not already placeable objects. Placeable objects keep their adopted variants. */
export function placementDefinition(id: string): BvDefinition | null {
  if (placeableObject(id)) return null;
  return sources.get(id)?.definition ?? null;
}
