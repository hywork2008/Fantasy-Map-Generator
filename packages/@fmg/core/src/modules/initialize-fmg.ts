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
import { sharedFmg, sharedGridFmg } from "@fmg/shared";
import { legacyCompat } from "../../../legacy-ui/src/globals-compat";

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
  // If a legacy runtime shim is installed, replace the proxy with a plain
  // object so we control exactly which keys are defined on `window.fmg`.
  // Keep a reference to the shim so we can flush queued calls after
  // real implementations are assigned.
  const existing = (window as any).fmg as any;
  let shimProxy: any | undefined;
  let fmg = undefined as unknown as FmgGlobalContext;
  if (existing && existing.__isShim) {
    shimProxy = existing;
    // Install a plain object to replace the shim proxy. This prevents the
    // shim from creating persistent stub properties on further property
    // accesses while we perform controlled registration below.
    (window as any).fmg = {} as FmgGlobalContext;
    fmg = (window as any).fmg as FmgGlobalContext;
  } else {
    fmg = (window.fmg || (window.fmg = {} as FmgGlobalContext)) as FmgGlobalContext;
  }
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
    generateHeightmap: api.HeightmapGenerator.generate.bind(api.HeightmapGenerator) as (graph: Grid) => Promise<Uint8Array>,

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

  // Merge shared package fragments (utilities, grid helpers, etc.)
  try {
    Object.assign(fmg, sharedFmg, sharedGridFmg, legacyCompat);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error merging shared/legacy FMG fragments:", err);
  }

  // Prune legacy class-like exposures that may have been created by the
  // runtime shim as transient stubs (e.g. `window.fmg.UITour`, `window.fmg.ThreeD`,
  // `window.fmg.Cloud`, `window.fmg.Names`). Tests and the new migration
  // require only function-level APIs (startUITour, create3d, etc.), so remove
  // these legacy object/class exposures if present.
  try {
    const legacyClassLikeKeys = ["UITour", "ThreeD", "Cloud", "Names"] as const;
    for (const k of legacyClassLikeKeys) {
      try {
        if ((fmg as any)[k] !== undefined) delete (fmg as any)[k];
      } catch (e) {
        // ignore
      }
      try {
        if ((window as any)[k] !== undefined) delete (window as any)[k];
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }

  // If a legacy shim is present, ask it to flush queued calls now that
  // core implementations have been assigned onto `window.fmg`.
  try {
    if (shimProxy && typeof shimProxy.__flush === "function") {
      try {
        shimProxy.__flush();
      } catch (err) {
        // Non-fatal: just log and continue
        // eslint-disable-next-line no-console
        console.error("Error flushing legacy fmg shim:", err);
      }
    } else {
      const flush = (fmg as { __flush?: () => void }).__flush;
      if (typeof flush === "function") {
        try {
          flush();
        } catch (err) {
          // Non-fatal: just log and continue
          // eslint-disable-next-line no-console
          console.error("Error flushing legacy fmg shim:", err);
        }
      }
    }
  } catch (err) {
    // ignore
  }

  return fmg;
}
