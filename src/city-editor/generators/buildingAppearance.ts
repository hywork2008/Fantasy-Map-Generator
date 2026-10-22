import {
  type BuildingAppearanceInput,
  normalizeBuildingAppearanceContext,
  regionalRoofMaterial,
  resolveBuildingAppearance
} from "../../buildings/appearance/resolver";
import { BUILDING_APPEARANCE_VERSION } from "../../buildings/appearance/types";
import type { BurgSiteDescriptor } from "../types/contracts/burgSiteDescriptor";
import type { CityDocument } from "../types/document";
import { limitBuildingRoofColors } from "./buildingAppearanceBuckets";
import type { BuildingLot } from "./buildingLots.types";

function contextOf(document: CityDocument, descriptor?: BurgSiteDescriptor) {
  const recipe = document.fabric?.generation?.settings.descriptor;
  const climate = descriptor?.climate ?? recipe?.climate;
  const context = normalizeBuildingAppearanceContext({
    period: document.urbanMorphology?.period ?? document.historicalPeriod,
    tradition:
      descriptor?.civilization?.tradition ?? document.civilization?.tradition ?? recipe?.civilization?.tradition,
    temperatureC:
      descriptor?.climate?.temperatureC ?? document.buildingAppearanceContext?.temperatureC ?? climate?.temperatureC,
    biome: descriptor?.biome ?? document.biome ?? (climate?.biomeKey ? { key: climate.biomeKey } : undefined)
  });
  const override = document.buildingAppearanceClimate;
  return override
    ? {
        ...context,
        forest: override === "forest" || override === "wet-forest",
        wetland: override === "wetland" || override === "wet-forest",
        arid: override === "arid"
      }
    : context;
}

/** Carry current housing controls onto an earlier generation input, including cleared overrides. */
export function inheritBuildingAppearance(document: CityDocument, current: CityDocument): CityDocument {
  return {
    ...document,
    buildingAppearanceVersion: current.buildingAppearanceVersion,
    buildingAppearanceProfile: current.buildingAppearanceProfile,
    buildingAppearanceClimate: current.buildingAppearanceClimate,
    buildingAppearanceContext: current.buildingAppearanceContext
  };
}

/** Explicit opt-in/refresh for saved cities; loading alone never upgrades their appearance. */
export function withBuildingAppearance(
  document: CityDocument,
  profile = document.buildingAppearanceProfile,
  descriptor?: BurgSiteDescriptor
): CityDocument {
  return {
    ...document,
    buildingAppearanceVersion: BUILDING_APPEARANCE_VERSION,
    ...(profile ? { buildingAppearanceProfile: profile } : {}),
    buildingAppearanceContext: contextOf(document, descriptor)
  };
}

/** Canonical ring key is invariant under winding, start vertex and lot array ordering. */
export function stableBuildingAppearanceId(lot: BuildingLot): string {
  if (lot.id) return lot.id;
  const points = lot.polygon.map(p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`);
  if (points.length > 1 && points[0] === points[points.length - 1]) points.pop();
  const rings: string[] = [];
  for (const order of [points, [...points].reverse()])
    for (let i = 0; i < order.length; i++) rings.push([...order.slice(i), ...order.slice(0, i)].join(";"));
  return `${lot.faceId}:${rings.sort()[0] ?? "empty"}`;
}

/** Resolve regional roof coverings and colors after massing, preserving its geometry and capacity. */
export function assignBuildingAppearances(document: CityDocument, lots: BuildingLot[]): BuildingLot[] {
  if (document.buildingAppearanceVersion !== BUILDING_APPEARANCE_VERSION) return lots;
  const context = document.buildingAppearanceContext ?? contextOf(document);
  const seed = document.generationSeed || document.fabric?.seed || "massing";
  return limitBuildingRoofColors(
    lots.map(lot => {
      if (!lot.massing || lot.landmark) return lot;
      const settlement = document.mesh.faces[lot.faceId]?.properties.settlement;
      const input: BuildingAppearanceInput = {
        version: document.buildingAppearanceVersion,
        profile: document.buildingAppearanceProfile,
        context,
        seed,
        stableLotId: stableBuildingAppearanceId(lot),
        blockId: lot.faceId,
        rural: settlement === "outskirts" || lot.role === "shed" || lot.role === "stable",
        rich: lot.archetype === "patrician-house" || lot.archetype === "elite-compound",
        wall: lot.massing.wall,
        roof: lot.massing.roof.material
      };
      const roof = regionalRoofMaterial(input, lot.massing.roof.pitchDeg);
      const appearance = resolveBuildingAppearance({ ...input, roof });
      const massing =
        roof === lot.massing.roof.material
          ? lot.massing
          : {
              ...lot.massing,
              roof: { ...lot.massing.roof, material: roof }
            };
      return { ...lot, massing, appearance };
    })
  );
}

/** Includes only appearance inputs; independent of rural-field feature versions. */
export function buildingAppearanceKey(document: CityDocument): string {
  return JSON.stringify([
    document.buildingAppearanceVersion ?? null,
    document.buildingAppearanceProfile ?? null,
    document.buildingAppearanceClimate ?? null,
    document.buildingAppearanceContext ?? contextOf(document)
  ]);
}
