import { getWorldState } from "../actions";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { redistributeRuralPopulationInScope } from "../generators/population-generator";
import {
  BurgIconsRenderer,
  BurgLabelsRenderer,
  EmblemsRenderer,
  PopulationRenderer,
  RoutesRenderer
} from "../renderers";
import { GenerationPipeline } from "../services/generationPipeline";
import { useBurgsOverviewState } from "../store/burgsOverviewState";
import { layerIsOn } from "../utils/nodeUtils";
import { refreshProvincesEditor } from "./provinces-editor";
import { refreshStatesEditor } from "./states-editor";

/**
 * Regenerates non-locked, non-capital burgs within `cellIds` (one state or province) and
 * redistributes rural population across the same scope, preserving both the scope's total
 * urban and rural population. Redraws every renderer whose output the regeneration can change,
 * and refreshes any open States/Provinces/Burgs tables so their numbers don't go stale.
 */
export function regeneratePopulationAndBurgs(cellIds: Iterable<number>): {
  addedBurgIds: number[];
  removedBurgIds: number[];
} {
  const ids = Array.from(cellIds);

  const result = Burgs.regenerateInScope(ids);
  redistributeRuralPopulationInScope(ids);

  const state = getWorldState();
  GenerationPipeline.States.collectStatistics(state);
  GenerationPipeline.Provinces.collectStatistics(state);

  BurgIconsRenderer.render(worldContext, viewContext, appServices);
  BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  EmblemsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRoutes")) RoutesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);

  refreshStatesEditor();
  refreshProvincesEditor();
  useBurgsOverviewState.getState().refresh();

  return result;
}
