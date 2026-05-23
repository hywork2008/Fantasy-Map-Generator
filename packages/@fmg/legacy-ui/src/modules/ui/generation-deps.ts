import { Biomes } from "@fmg/core/modules/biomes";
import { Burgs } from "@fmg/core/modules/burgs-generator";
import { Cultures } from "@fmg/core/modules/cultures-generator";
import { Features } from "@fmg/core/modules/features";
import { Ice } from "@fmg/core/modules/ice";
import { Lakes } from "@fmg/core/modules/lakes";
import { Military } from "@fmg/core/modules/military-generator";
import { Names } from "@fmg/core/modules/names-generator";
import { Provinces } from "@fmg/core/modules/provinces-generator";
import { Religions } from "@fmg/core/modules/religions-generator";
import { Rivers } from "@fmg/core/modules/river-generator";
import { Routes } from "@fmg/core/modules/routes-generator";
import { States } from "@fmg/core/modules/states-generator";
import { Zones } from "@fmg/core/modules/zones-generator";

export type GenerationModules = {
  Features: typeof Features;
  Rivers: typeof Rivers;
  Biomes: typeof Biomes;
  Ice: typeof Ice;
  Cultures: typeof Cultures;
  Burgs: typeof Burgs;
  States: typeof States;
  Routes: typeof Routes;
  Religions: typeof Religions;
  Provinces: typeof Provinces;
  Lakes: typeof Lakes;
  Military: typeof Military;
  Markers: { generate: () => void };
  Zones: typeof Zones;
  Names: typeof Names;
};

export function buildGenerationModules({
  Features,
  Rivers,
  Biomes,
  Ice,
  Cultures,
  Burgs,
  States,
  Routes,
  Religions,
  Provinces,
  Lakes,
  Military,
  Markers,
  Zones,
  Names
}: GenerationModules): GenerationModules {
  return {
    Features,
    Rivers,
    Biomes,
    Ice,
    Cultures,
    Burgs,
    States,
    Routes,
    Religions,
    Provinces,
    Lakes,
    Military,
    Markers,
    Zones,
    Names
  };
}

export function buildGenerateDeps<T>(deps: T): T {
  return deps;
}

export function buildSetSeedDeps<T>(deps: T): T {
  return deps;
}

export function buildDefineMapSizeDeps<T>(deps: T): T {
  return deps;
}

export function buildCalculateMapCoordinatesDeps<T>(deps: T): T {
  return deps;
}

export function buildCalculateTemperaturesDeps<T>(deps: T): T {
  return deps;
}

export function buildGeneratePrecipitationDeps<T>(deps: T): T {
  return deps;
}

export function buildReGraphDeps<T>(deps: T): T {
  return deps;
}

export function buildRankCellsDeps<T>(deps: T): T {
  return deps;
}

export function buildShowStatisticsDeps<T>(deps: T): T {
  return deps;
}

export function buildRegenerateMapDeps<T>(deps: T): T {
  return deps;
}

export function buildUndrawDeps<T>(deps: T): T {
  return deps;
}