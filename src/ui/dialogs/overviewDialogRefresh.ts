import { useBurgsOverviewState } from "../../store/burgsOverviewState";
import { registerDialogBeforeOpen } from "../../store/dialogState";
import { useMarkersOverviewState } from "../../store/markersOverviewState";
import { useMilitaryOverviewState } from "../../store/militaryOverviewState";
import { usePopulationOverviewState } from "../../store/populationOverviewState";
import { useRegimentsOverviewState } from "../../store/regimentsOverviewState";
import { useRiversOverviewState } from "../../store/riversOverviewState";
import { useRoutesOverviewState } from "../../store/routesOverviewState";
import { useTechnologyOverviewState } from "../../store/technologyOverviewState";

let registered = false;

/**
 * Ensures Overview dialogs recompute data from mutable world state before their first
 * visible render. The registration happens once when the React UI starts.
 */
export function registerOverviewDialogRefreshers(): void {
  if (registered) return;
  registered = true;

  registerDialogBeforeOpen("burgsOverview", () => useBurgsOverviewState.getState().refresh());
  registerDialogBeforeOpen("markersOverview", () => useMarkersOverviewState.getState().refresh());
  registerDialogBeforeOpen("militaryOverview", () => useMilitaryOverviewState.getState().refresh());
  registerDialogBeforeOpen("populationOverview", () => usePopulationOverviewState.getState().refresh());
  registerDialogBeforeOpen("regimentsOverview", () => useRegimentsOverviewState.getState().refresh());
  registerDialogBeforeOpen("riversOverview", () => useRiversOverviewState.getState().refresh());
  registerDialogBeforeOpen("routesOverview", () => useRoutesOverviewState.getState().refresh());
  registerDialogBeforeOpen("technologyOverview", () => useTechnologyOverviewState.getState().refresh());
}
