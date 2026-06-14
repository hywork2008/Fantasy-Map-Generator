import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
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
export function generateWorld(
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  state: WorldState
): void {
  Rivers.generate(worldContext, viewContext, appServices, state);
  Biomes.define(state);
  Features.defineGroups();
  Ice.generate(worldContext, viewContext, appServices, state);
  Cultures.generate(worldContext, viewContext, appServices, state);
  Cultures.expand(state);
  Burgs.generate(worldContext, viewContext, appServices, state);
  States.generate(worldContext, viewContext, appServices, state);
  Routes.generate(worldContext, viewContext, appServices, state);
  Religions.generate(worldContext, viewContext, appServices, state);
  Burgs.specify(worldContext, viewContext, appServices, state);
  States.collectStatistics(state);
  States.defineStateForms(state);
  Provinces.generate(worldContext, viewContext, appServices, state);
  Provinces.getPoles(state);
  Rivers.specify(worldContext, viewContext, appServices, state);
  Lakes.defineNames(state);
  Military.generate(worldContext, viewContext, appServices, state);
  Markers.generate(worldContext, viewContext, appServices, state);
  Zones.generate(worldContext, viewContext, appServices, state);
}
