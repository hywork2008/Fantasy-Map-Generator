import { viewContext } from "../context/viewContext";
import { useRiversOverviewState } from "../store/riversOverviewState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { layerIsOn } from "../utils/nodeUtils";
import { fitContent } from "../utils/uiHelpers";
import { toggleRivers } from "./layers";

export function overviewRivers(): void {
  if (viewContext.customization) return;
  closeDialogs("#riversOverview, .stable");
  if (!layerIsOn("toggleRivers")) toggleRivers();

  // refresh the Zustand store to pull fresh data from worldContext
  useRiversOverviewState.getState().refresh();

  openDialog("riversOverview", {
    title: "Rivers Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}
