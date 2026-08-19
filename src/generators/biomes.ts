import { mean } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { createDefaultBiomesData, getBiomeCode } from "../data/biomeCatalog";
import { ensureCoastalHabitatColumns } from "../data/coastalHabitatCatalog";
import { BiomeConstants, HeightThreshold } from "../data/constants";
import type { StandardBiomeKey } from "../types/biome";
import { DEFAULT_BIOME_REGION_PROFILE, normalizeBiomeRegionProfile } from "../types/biomeRegion";
import type { WorldState } from "../types/WorldState";
import { rn } from "../utils";
import { TIME } from "../utils/debug";
import {
  type AssignmentOptions,
  applyRegionalForestMask,
  type CellBiomeClimate,
  classifySpecialBiome,
  climateMatrixBands
} from "./biomeAssignment";
import { initializeBiomeAttributes } from "./biomeAttributes";
import { assignCoastalHabitats } from "./coastalHabitatAssignment";
import { lavaFlowLandCells } from "./volcanicTerrain";

class BiomesModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  private MIN_LAND_HEIGHT = BiomeConstants.MIN_LAND_HEIGHT;

  getDefault() {
    return createDefaultBiomesData();
  }

  define(state: WorldState) {
    const { pack, grid, options, seed } = state;
    TIME && console.time("defineBiomes");

    const { fl: flux, r: riverIds, h: heights, c: neighbors, g: gridReference, t: coastDist, p: points } = pack.cells;
    const { temp, prec, volcanic: gridVolcanic, volcanicActive: gridVolcanicActive } = grid.cells;
    const lavaFlowCells = lavaFlowLandCells(pack);
    const n = pack.cells.i.length;
    pack.cells.biomeCode = new Uint8Array(n);
    const habitats = ensureCoastalHabitatColumns(n, pack.cells);
    pack.cells.coastalHabitat = habitats.coastalHabitat;
    pack.cells.nearshoreHabitat = habitats.nearshoreHabitat;

    const profile = normalizeBiomeRegionProfile(
      options?.biomeRegionProfile ?? this.worldContext.options?.biomeRegionProfile
    );
    const assignmentOptions: AssignmentOptions = {
      profile,
      seed: Number.parseInt(String(seed ?? this.worldContext.seed ?? "0"), 10) || 1,
      volcanicSoilStrength: options?.volcanicSoilStrength ?? this.worldContext.options?.volcanicSoilStrength ?? 50
    };

    const calculateMoisture = (cellId: number) => {
      let moisture = prec[gridReference[cellId]];
      if (riverIds[cellId]) moisture += Math.max(flux[cellId] / 10, 2);

      const moistAround = neighbors[cellId]
        .filter((neibCellId: number) => heights[neibCellId] >= this.MIN_LAND_HEIGHT)
        .map((c: number) => prec[gridReference[c]])
        .concat([moisture]);
      return rn(4 + (mean(moistAround) as number));
    };

    const hasOceanNeighbor = (cellId: number): boolean => {
      for (const nb of neighbors[cellId] ?? []) {
        if (heights[nb] >= this.MIN_LAND_HEIGHT) continue;
        const feature = pack.features[pack.cells.f[nb]];
        if (feature?.type === "ocean") return true;
      }
      return false;
    };

    for (let cellId = 0; cellId < heights.length; cellId++) {
      const height = heights[cellId];
      const moisture = height < this.MIN_LAND_HEIGHT ? 0 : calculateMoisture(cellId);
      const temperature = temp[gridReference[cellId]];
      const [x, y] = points[cellId] ?? [0, 0];
      const climate: CellBiomeClimate = {
        moisture,
        temperature,
        height,
        hasRiver: Boolean(riverIds[cellId]),
        flux: flux[cellId] ?? 0,
        coastDistance: coastDist?.[cellId] ?? 0,
        neighborOcean: height >= this.MIN_LAND_HEIGHT ? hasOceanNeighbor(cellId) : false,
        x,
        y,
        volcanic: gridVolcanic?.[gridReference[cellId]] ?? 0,
        volcanicActive: Boolean(gridVolcanicActive?.[gridReference[cellId]]),
        lavaFlow: lavaFlowCells.has(cellId)
      };
      pack.cells.biomeCode[cellId] = this.resolveBiomeCode(climate, assignmentOptions);
    }

    // Coastal / nearshore attributes (independent of climate biome)
    assignCoastalHabitats(pack, grid, {
      profile: assignmentOptions.profile,
      seed: assignmentOptions.seed
    });

    // Forest cover / land-cover attribute layers (not climate biomes)
    initializeBiomeAttributes(pack, this.worldContext.biomesData);

    TIME && console.timeEnd("defineBiomes");
  }

  /**
   * Resolve a cell to a catalog code using special rules → climate matrix → regional mask.
   */
  resolveBiomeCode(climate: CellBiomeClimate, options: AssignmentOptions): number {
    const { biomesData } = this.worldContext;
    const codeOf = (key: StandardBiomeKey) => getBiomeCode(biomesData, key) ?? 0;

    const special = classifySpecialBiome(climate, options);
    let key: StandardBiomeKey;
    if (special) {
      key = special;
    } else {
      // Climate matrix fallback (legacy path)
      const { moistureBand, temperatureBand } = climateMatrixBands(climate.moisture, climate.temperature);
      const matrixCode = biomesData.biomesMatrix[moistureBand]?.[temperatureBand];
      const matrixKey = biomesData.keys?.[matrixCode] as StandardBiomeKey | undefined;
      key = matrixKey ?? "grassland";
    }

    key = applyRegionalForestMask(key, climate, options);
    return codeOf(key);
  }

  /**
   * Compatibility API used by heightmap restore and satellite texture paths.
   * Uses simplified inputs (no regional mask continuity) — full define() is preferred.
   */
  getId(moisture: number, temperature: number, height: number, hasRiver: boolean) {
    const profile = normalizeBiomeRegionProfile(
      this.worldContext.options?.biomeRegionProfile ?? DEFAULT_BIOME_REGION_PROFILE
    );
    return this.resolveBiomeCode(
      {
        moisture,
        temperature,
        height,
        hasRiver,
        flux: hasRiver ? 50 : 0,
        coastDistance: height < HeightThreshold.WATER_MAX_HEIGHT ? -1 : 2,
        neighborOcean: false,
        x: 0,
        y: 0,
        volcanic: 0,
        volcanicActive: false,
        lavaFlow: false
      },
      { profile, seed: 1, volcanicSoilStrength: this.worldContext.options?.volcanicSoilStrength ?? 50 }
    );
  }
}

export const Biomes = new BiomesModule();

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
