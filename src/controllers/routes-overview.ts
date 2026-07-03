import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { useRoutesOverviewState } from "../store/routesOverviewState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { fitContent } from "../utils/domUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { toggleRoutes } from "./layers";

export function overviewRoutes(): void {
  if (view.customization) return;
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

// preserve getLength method from src/generators/routes-generator.ts
// commit 2757b684ac2b5f3a10f3aabbd7a1cccb6727c868
export function getExactLength(routeId: string): number {
  if (!view.customization) return 0;
  const path = view.routes.select(`#route${routeId}`).node() as SVGPathElement;
  return path.getTotalLength();
}
