import type { WorldState } from "../types/WorldState";
import { Biomes } from "./biomes";
import { Burgs } from "./burgs-generator";
import { Cultures } from "./cultures-generator";
import { COA } from "./emblem/generator";
import { COArenderer } from "./emblem/renderer";
import { Features } from "./features";
import { addGoogleFont, addLocalFont, addWebFont, declareFont, fonts, getUsedFonts, loadFontsAsDataURI } from "./fonts";
import { HeightmapGenerator } from "./heightmap-generator";
import { Ice } from "./ice";
import { Lakes } from "./lakes";
import { Markers } from "./markers-generator";
import { Military } from "./military-generator";
import { Names } from "./names-generator";
import { OceanLayers } from "./ocean-layers";
import { Provinces } from "./provinces-generator";
import { Religions } from "./religions-generator";
import { Resample } from "./resample";
import { Rivers } from "./river-generator";
import { Routes } from "./routes-generator";
import { States } from "./states-generator";
import { UITour } from "./ui-tour";
import { Zones } from "./zones-generator";

export {
  addGoogleFont,
  addLocalFont,
  addWebFont,
  Biomes,
  Burgs,
  COA,
  COArenderer,
  Cultures,
  declareFont,
  Features,
  fonts,
  getUsedFonts,
  HeightmapGenerator,
  Ice,
  Lakes,
  loadFontsAsDataURI,
  Markers,
  Military,
  Names,
  OceanLayers,
  Provinces,
  Religions,
  Resample,
  Rivers,
  Routes,
  States,
  UITour,
  Zones
};

/**
 * Run the full world-generation pipeline in dependency order.
 * Each step mutates state.pack in place.
 */
export function generateWorld(state: WorldState): void {
  Rivers.generate(state);
  Biomes.define(state);
  Features.defineGroups();
  Ice.generate(state);
  Cultures.generate(state);
  Cultures.expand(state);
  Burgs.generate(state);
  States.generate(state);
  Routes.generate(state);
  Religions.generate(state);
  Burgs.specify(state);
  States.collectStatistics(state);
  States.defineStateForms(state);
  Provinces.generate(state);
  Provinces.getPoles(state);
  Rivers.specify(state);
  Lakes.defineNames(state);
  Military.generate(state);
  Markers.generate(state);
  Zones.generate(state);
}
