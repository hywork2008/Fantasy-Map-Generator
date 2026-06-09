import "../editors/BrushHistory";
import "../editors/HeightmapEditorHistory";
import "./voronoi";
import "./heightmap-generator";
import "./features";
import "./names-generator";
import "./ocean-layers";
import "./lakes";
import "./river-generator";
import "./burgs-generator";
import "./biomes";
import "./cultures-generator";
import "./routes-generator";
import "./states-generator";
import "./zones-generator";
import "./religions-generator";
import "./provinces-generator";
import "./emblem";
import "./ice";
import "./military-generator";
import "./markers-generator";
import "./fonts";
import "./resample";
import "./ui-tour";

import type { WorldState } from "../types/WorldState";

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
