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
  };
};

export type AutoUpdateMigrationContext = {
  pack: any;
  api: AutoUpdateApi;
  helpers: {
    layerIsOn: (layerId: string) => boolean;
    createDefaultRuler: () => void;
  };
};
