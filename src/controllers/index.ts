import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import "../versioning";

import "../data";
import { initLayers } from "./layers";
import { initStyle } from "./style";
import "./editors";
import { initCoastlineEditor } from "./coastline-editor";
import "./elevation-profile";
import { initNamesbaseEditor } from "./namesbase-editor";
import "../io";
import "../utils/uiHelpers";
import { initHotkeys } from "./hotkeys";
import "./measurers";
import { initBiomesEditor } from "./biomes-editor";
import { initLakesEditor } from "./lakes-editor";
import { initMarkersEditor } from "./markers-editor";
import { initRiversEditor } from "./rivers-editor";
import { initRoutesEditor } from "./routes-editor";
import { initZonesEditor } from "./zones-editor";
import "./notes-editor";
import { initHeightmapEditor } from "./heightmapEditor";
import { initOptions } from "./options";
import { initProvincesEditor } from "./provinces-editor";
import { initTools } from "./tools";
import "./routes-overview";
import "./rivers-overview";
import "./temperature-graph";
import { initSubmapTool } from "./submap-tool";
import { initWorldConfigurator } from "./world-configurator";
import "./route-group-editor";
import { initIceEditor } from "./ice-editor";
import { initRiversCreator } from "./rivers-creator";
import { initTransformTool } from "./transform-tool";
import "./ai-generator";
import "./minimap";
import { initUnitsEditor } from "./units-editor";
import "./relief-editor";
import { initBurgGroupEditor } from "./burg-group-editor";
import "./labels-editor";
import "./burg-editor";
import { initRegimentEditor } from "./regiment-editor";
import "./emblems-editor";
import { initDiplomacyEditor } from "./diplomacy-editor";
import { initMilitaryOverview } from "./military-overview";
import "./burgs-overview";

import { initBattleScreen } from "./battle-screen";
import { initCulturesEditor } from "./cultures-editor";
import { initReligionsEditor } from "./religions-editor";
import { initStatesEditor } from "./states-editor";

export function initControllers(
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): void {
  initHotkeys();
  initBattleScreen(worldContext, viewContext, appServices);
  initLayers(worldContext, viewContext, appServices);
  initMilitaryOverview(worldContext, viewContext, appServices);
  initOptions(worldContext, viewContext, appServices);
  initRiversCreator(worldContext);
  initStyle(worldContext, viewContext, appServices);
  initSubmapTool(worldContext, viewContext, appServices);
  initTools(worldContext, viewContext, appServices);
  initTransformTool(worldContext, viewContext, appServices);
  initWorldConfigurator(worldContext, viewContext, appServices);
  initNamesbaseEditor();

  initBiomesEditor(worldContext, viewContext, appServices);
  initBurgGroupEditor(worldContext, viewContext, appServices);
  initCoastlineEditor(worldContext, viewContext, appServices);
  initCulturesEditor(worldContext, viewContext, appServices);
  initDiplomacyEditor(worldContext, viewContext, appServices);
  initHeightmapEditor(worldContext, viewContext, appServices);
  initIceEditor(worldContext, viewContext, appServices);
  initLakesEditor(worldContext, viewContext, appServices);
  initMarkersEditor(worldContext, viewContext, appServices);
  initProvincesEditor(worldContext, viewContext, appServices);
  initRegimentEditor(worldContext, viewContext, appServices);
  initReligionsEditor(worldContext, viewContext, appServices);
  initRiversEditor(worldContext);
  initRoutesEditor(worldContext);
  initStatesEditor(worldContext, viewContext, appServices);
  initUnitsEditor(worldContext, viewContext, appServices);
  initZonesEditor(worldContext, viewContext, appServices);
}
