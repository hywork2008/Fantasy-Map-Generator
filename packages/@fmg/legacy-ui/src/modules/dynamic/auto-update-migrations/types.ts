export type AutoUpdateApi = {
  Religions: { generate: () => void };
  Features: { markupPack: () => void };
  Zones: { generate: () => void };
  Markers: { generate: () => void };
  Provinces: { generate: () => void; getPoles: () => void };
  States: {
    collectStatistics: () => void;
    generateCampaigns: () => void;
    generateDiplomacy: () => void;
    defineStateForms: () => void;
    getPoles?: () => void;
  };
  // Additional services that migrations may need. Kept loose-typed for incremental migration.
  Cultures?: any;
  Burgs?: any;
  Names?: any;
  Military?: any;
  Rivers?: any;
};

export type DomHandles = {
  viewbox?: any;
  rivers?: any;
  lakes?: any;
  labels?: any;
  coastline?: any;
  defs?: any;
  compass?: any;
  pointsInput?: any;
  heightExponentInput?: any;
  zones?: any;
  markersGroup?: any;
  [key: string]: any;
};
export type AutoUpdateMigrationContext = {
  pack: any;
  grid?: any;
  api: AutoUpdateApi;
  biomesData?: any;
  helpers: {
    layerIsOn: (layerId: string) => boolean;
    createDefaultRuler: () => void;
    // Renderer helpers (may call into runtime renderers)
    markersRenderer?: () => void;
    featuresRenderer?: () => void;
    militaryRenderer?: () => void;
    burgIconsRenderer?: () => void;
    burgLabelsRenderer?: () => void;
    iceRenderer?: () => void;
    drawZones?: () => void;
    drawEmblems?: () => void;
    turnButtonOn?: (id: string) => void;
    turnButtonOff?: (id: string) => void;
    regenerateEmblems?: () => void;
    toggleEmblems?: (event?: any) => void;
    shiftCompass?: () => void;
    // Helper to find nearest cell within the provided pack (bound at runtime)
    findPackCell?: (x: number, y: number, radius?: number) => number | undefined;
  };
  dom?: DomHandles;
};
