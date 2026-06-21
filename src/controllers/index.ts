import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import "../versioning";
import "../components";
import "../config";
import { initLayers } from "./layers";
import { initStyle } from "./style";
import "./editors";
import { initCoastlineEditor } from "../editors/coastline-editor";
import "./elevation-profile";
import { initNamesbaseEditor } from "../editors/namesbase-editor";
import "../io";
import "../utils/uiHelpers";
import { initHotkeys } from "./hotkeys";
import "./measurers";
import { initBiomesEditor } from "../editors/biomes-editor";
import { initLakesEditor } from "../editors/lakes-editor";
import { initMarkersEditor } from "../editors/markers-editor";
import { initRiversEditor } from "../editors/rivers-editor";
import { initRoutesEditor } from "../editors/routes-editor";
import { initZonesEditor } from "../editors/zones-editor";
import "../editors/notes-editor";
import { initHeightmapEditor } from "../editors/heightmap-editor";
import { initProvincesEditor } from "../editors/provinces-editor";
import { initOptions } from "./options";
import { initTools } from "./tools";
import "./routes-overview";
import "./rivers-overview";
import "./temperature-graph";
import { initSubmapTool } from "./submap-tool";
import { initWorldConfigurator } from "./world-configurator";
import "../editors/route-group-editor";
import { initIceEditor } from "../editors/ice-editor";
import { initRiversCreator } from "./rivers-creator";
import { initTransformTool } from "./transform-tool";
import "./ai-generator";
import "./minimap";
import { initUnitsEditor } from "../editors/units-editor";
import "../editors/relief-editor";
import { initBurgGroupEditor } from "../editors/burg-group-editor";
import "../editors/labels-editor";
import "../editors/burg-editor";
import { initRegimentEditor } from "../editors/regiment-editor";
import "../editors/emblems-editor";
import { initDiplomacyEditor } from "../editors/diplomacy-editor";
import { initMilitaryOverview } from "./military-overview";
import "./burgs-overview";

import { initCulturesEditor } from "../editors/cultures-editor";
import { initReligionsEditor } from "../editors/religions-editor";
import { initStatesEditor } from "../editors/states-editor";
import { initBattleScreen } from "./battle-screen";
import { initChartsOverview } from "./charts-overview";
import { initHeightmapSelection } from "./heightmap-selection";

export function initControllers(
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): void {
  initHotkeys();
  initBattleScreen(worldContext, viewContext, appServices);
  initChartsOverview(worldContext);
  initHeightmapSelection(worldContext);
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
