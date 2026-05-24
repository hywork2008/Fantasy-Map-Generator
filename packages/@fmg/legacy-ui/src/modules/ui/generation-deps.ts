import { Biomes } from "@fmg/core/modules/biomes";
import type { Burg as Burgs } from "@fmg/core/modules/burgs-generator";
import type { Culture as Cultures } from "@fmg/core/modules/cultures-generator";
import { Ice } from "@fmg/core/modules/ice";
import { Lakes } from "@fmg/core/modules/lakes";
import { Military } from "@fmg/core/modules/military-generator";
import { Names } from "@fmg/core/modules/names-generator";
import type { Province as Provinces } from "@fmg/core/modules/provinces-generator";
import type { Religion as Religions } from "@fmg/core/modules/religions-generator";
import { Rivers } from "@fmg/core/modules/river-generator";
import { Routes } from "@fmg/core/modules/routes-generator";
import { States } from "@fmg/core/modules/states-generator";
import type { Zone as Zones } from "@fmg/core/modules/zones-generator";

// @ts-ignore Features module not fully typed
declare const Features: any;

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