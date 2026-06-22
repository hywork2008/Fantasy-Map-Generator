import { viewContext } from "../context/viewContext";
import { modules } from "../store/editorState";
import { useRoutesOverviewState } from "../store/routesOverviewState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { layerIsOn } from "../utils/nodeUtils";
import { fitContent } from "../utils/uiHelpers";
import { toggleRoutes } from "./layers";

export function overviewRoutes(): void {
  if (viewContext.customization) return;
  closeDialogs("#routesOverview, .stable");
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  // Force state refresh so dialog content is up to date when opened
  useRoutesOverviewState.getState().refresh();
  openDialog("routesOverview");

  if (modules.overviewRoutes) return;
  modules.overviewRoutes = true;

  openDialog("routesOverview", {
    title: "Routes Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}
