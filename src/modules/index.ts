import "./voronoi";
import { Features } from "./features";
import { Names } from "./names-generator";
import "./ocean-layers";
import { Biomes } from "./biomes";
import { Burgs } from "./burgs-generator";
import { Cultures } from "./cultures-generator";
import { Lakes } from "./lakes";
import { Provinces } from "./provinces-generator";
import { Religions } from "./religions-generator";
import { Rivers } from "./river-generator";
import { Routes } from "./routes-generator";
import { States } from "./states-generator";
import { Zones } from "./zones-generator";
import "./emblem";
import { initFonts } from "./fonts";
import { Ice } from "./ice";
import { Markers } from "./markers-generator";
import { Military } from "./military-generator";
import "./resample";

import type { WorldState } from "../types/WorldState";
import { UITour } from "./ui-tour";

export function initModules(): void {
  window.Names = Names;
  window.UITour = UITour;
  initFonts();
}

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
