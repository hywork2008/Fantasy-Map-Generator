type GenerationModules = {
  Features: unknown;
  Rivers: unknown;
  Biomes: unknown;
  Ice: unknown;
  Cultures: unknown;
  Burgs: unknown;
  States: unknown;
  Routes: unknown;
  Religions: unknown;
  Provinces: unknown;
  Lakes: unknown;
  Military: unknown;
  Markers: unknown;
  Zones: unknown;
  Names: unknown;
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