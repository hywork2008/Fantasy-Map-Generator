import { usePopulationOverviewState } from "../store/populationOverviewState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";

export function overviewPopulation(): void {
  closeDialogs("#populationOverview, .stable");
  usePopulationOverviewState.getState().refresh();
  openDialog("populationOverview", {
    title: "Population Overview"
  });
}
