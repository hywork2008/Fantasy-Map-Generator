import { viewLayerService as view } from "../services/viewLayerService";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { fitContent } from "../utils/domUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { toggleRivers } from "./layers";

export function overviewRivers(): void {
  if (view.customization) return;
  closeDialogs("#riversOverview, .stable");
  if (!layerIsOn("toggleRivers")) toggleRivers();

  openDialog("riversOverview", {
    title: "Rivers Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}
