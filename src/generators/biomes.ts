import { mean } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { createDefaultBiomesData, getBiomeCode } from "../data/biomeCatalog";
import { ensureCoastalHabitatColumns } from "../data/coastalHabitatCatalog";
import { BiomeConstants, HeightThreshold, TemperatureThreshold } from "../data/constants";
import type { WorldState } from "../types/WorldState";
import { rn } from "../utils";
import { TIME } from "../utils/debug";

class BiomesModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  private MIN_LAND_HEIGHT = BiomeConstants.MIN_LAND_HEIGHT;

  getDefault() {
    return createDefaultBiomesData();
  }

  define(state: WorldState) {
    const { pack, grid } = state;
    TIME && console.time("defineBiomes");

    const { fl: flux, r: riverIds, h: heights, c: neighbors, g: gridReference } = pack.cells;
    const { temp, prec } = grid.cells;
    pack.cells.biomeCode = new Uint8Array(pack.cells.i.length);
    // Habitat attributes start empty; Phase 3 auto-assigns, Phase 2 paints manually.
    const habitats = ensureCoastalHabitatColumns(pack.cells.i.length, pack.cells);
    pack.cells.coastalHabitat = habitats.coastalHabitat;
    pack.cells.nearshoreHabitat = habitats.nearshoreHabitat;

    const calculateMoisture = (cellId: number) => {
      let moisture = prec[gridReference[cellId]];
      if (riverIds[cellId]) moisture += Math.max(flux[cellId] / 10, 2);

      const moistAround = neighbors[cellId]
        .filter((neibCellId: number) => heights[neibCellId] >= this.MIN_LAND_HEIGHT)
        .map((c: number) => prec[gridReference[c]])
        .concat([moisture]);
      return rn(4 + (mean(moistAround) as number));
    };

    for (let cellId = 0; cellId < heights.length; cellId++) {
      const height = heights[cellId];
      const moisture = height < this.MIN_LAND_HEIGHT ? 0 : calculateMoisture(cellId);
      const temperature = temp[gridReference[cellId]];
      pack.cells.biomeCode[cellId] = this.getId(moisture, temperature, height, Boolean(riverIds[cellId]));
    }

    TIME && console.timeEnd("defineBiomes");
  }

  getId(moisture: number, temperature: number, height: number, hasRiver: boolean) {
    const { biomesData } = this.worldContext;
    const marine = getBiomeCode(biomesData, "marine") ?? 0;
    const glacier = getBiomeCode(biomesData, "glacier") ?? 11;
    const hotDesert = getBiomeCode(biomesData, "hotDesert") ?? 1;
    const wetland = getBiomeCode(biomesData, "wetland") ?? 12;

    if (height < HeightThreshold.WATER_MAX_HEIGHT) return marine;
    if (temperature < TemperatureThreshold.PERMAFROST_TEMP) return glacier;
    if (
      temperature >= TemperatureThreshold.HOT_DESERT_TEMP &&
      !hasRiver &&
      moisture < BiomeConstants.HOT_DESERT_MOISTURE
    )
      return hotDesert;
    if (this.isWetland(moisture, temperature, height)) return wetland;

    // Climate matrix is compiled from BiomeKey at catalog build time
    const moistureBand = Math.min((moisture / 5) | 0, 4); // [0-4]
    const temperatureBand = Math.min(Math.max(20 - temperature, 0), 25); // [0-25]
    return biomesData.biomesMatrix[moistureBand][temperatureBand];
  }

  private isWetland(moisture: number, temperature: number, height: number) {
    if (temperature <= TemperatureThreshold.WETLAND_COLD_LIMIT) return false; // too cold
    if (moisture > BiomeConstants.WETLAND_COAST_MOISTURE && height < BiomeConstants.WETLAND_COAST_HEIGHT) return true; // near coast
    if (
      moisture > BiomeConstants.WETLAND_INLAND_MOISTURE &&
      height > BiomeConstants.WETLAND_INLAND_HEIGHT_MIN &&
      height < BiomeConstants.WETLAND_INLAND_HEIGHT_MAX
    )
      return true; // off coast
    return false;
  }
}

export const Biomes = new BiomesModule();

// Re-export catalog helpers for convenient imports from generators/biomes
export {
  biomeHasAnyTag,
  biomeHasTag,
  createDefaultBiomeCatalog,
  createDefaultBiomesData,
  ensureBiomeCatalogFields,
  getBiomeCode,
  getBiomeKey,
  isArableBiome,
  isColdBiome,
  isDesertBiome,
  isForestBiome,
  isMountainBiome,
  isNomadicBiome,
  isSnowBiome,
  isWetlandBiome,
  STANDARD_BIOME_COUNT,
  STANDARD_BIOME_DEFINITIONS
} from "../data/biomeCatalog";
