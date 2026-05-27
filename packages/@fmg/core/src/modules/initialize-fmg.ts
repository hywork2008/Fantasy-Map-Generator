import type { FmgGlobalContext, Grid } from "@fmg/types";
import { BurgsGenerator } from "@fmg/burgs";
import { CulturesGenerator } from "./cultures-generator";
import { FeaturesGenerator } from "./features";
import { HeightmapGenerator } from "./heightmap-generator";
import { MarkersGenerator } from "@fmg/markers";
import { ProvincesGenerator } from "@fmg/states";
import { ReligionsGenerator } from "./religions-generator";
import { ZonesGenerator } from "./zones-generator";
import { Resampler } from "./resample";
import { drawOceanLayers } from "./ocean-layers";
import { fontsApi } from "./fonts";
import { startUITour } from "./ui-tour";

type CoreInstances = {
  Burgs: BurgsGenerator;
  Cultures: CulturesGenerator;
  Features: FeaturesGenerator;
  HeightmapGenerator: HeightmapGenerator;
  Markers: MarkersGenerator;
  Provinces: ProvincesGenerator;
  Religions: ReligionsGenerator;
  Zones: ZonesGenerator;
  Resample: Resampler;
};

let instances: CoreInstances | null = null;

type ResampleMapFn = NonNullable<FmgGlobalContext["resampleMap"]>;

const getInstances = (): CoreInstances => {
  if (instances) return instances;

  instances = {
    Burgs: new BurgsGenerator(),
    Cultures: new CulturesGenerator(),
    Features: new FeaturesGenerator(),
    HeightmapGenerator: new HeightmapGenerator(),
    Markers: new MarkersGenerator(),
    Provinces: new ProvincesGenerator(),
    Religions: new ReligionsGenerator(),
    Zones: new ZonesGenerator(),
    Resample: new Resampler()
  };

  return instances;
};

export const getCoreFmgInstances = (): CoreInstances => getInstances();

export function initializeFmg(): FmgGlobalContext {
  const fmg = (window.fmg || (window.fmg = {} as FmgGlobalContext)) as FmgGlobalContext;
  const api = getInstances();

  Object.assign(fmg, {
    Burgs: api.Burgs,
    generateBurgs: api.Burgs.generate.bind(api.Burgs),

    Cultures: api.Cultures,
    generateCultures: api.Cultures.generate.bind(api.Cultures),

    Features: api.Features,
    markFeaturesGrid: api.Features.markupGrid.bind(api.Features),
    markFeaturesPack: api.Features.markupPack.bind(api.Features),

    HeightmapGenerator: api.HeightmapGenerator,
    generateHeightmap: api.HeightmapGenerator.generate.bind(api.HeightmapGenerator) as (graph: Grid) => Promise<unknown>,

    Markers: api.Markers,
    generateMarkers: api.Markers.generate.bind(api.Markers),

    Provinces: api.Provinces,
    generateProvinces: api.Provinces.generate.bind(api.Provinces),

    Religions: api.Religions,
    generateReligions: api.Religions.generate.bind(api.Religions),

    Zones: api.Zones,
    generateZones: api.Zones.generate.bind(api.Zones),

    Resample: { process: api.Resample.process.bind(api.Resample) },
    resampleMap: api.Resample.process.bind(api.Resample) as ResampleMapFn,

    OceanLayers: drawOceanLayers,
    startUITour,

    fonts: fontsApi.fonts,
    declareFont: fontsApi.declareFont,
    getUsedFonts: fontsApi.getUsedFonts,
    loadFontsAsDataURI: fontsApi.loadFontsAsDataURI,
    addGoogleFont: fontsApi.addGoogleFont,
    addLocalFont: fontsApi.addLocalFont,
    addWebFont: fontsApi.addWebFont
  });

  return fmg;
}
